const pool = require('../db/pool');
const env = require('../config/env');
const { getActiveConfig, updateActiveConfig, deepMerge } = require('./config.service');
const { deriveTrainingInsight } = require('./training.service');
const { getTrainingSettings } = require('./trainingAdaptation.service');
const { getTrainingRuntimeState } = require('./trainingRuntime.service');

const DEFAULT_EXPERT_KEYS = ['trend', 'momentum', 'volatility', 'liquidity', 'regime', 'pattern', 'risk'];
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MIN_DECISIONS = 25;
const DEFAULT_MAX_SHIFT = 0.15;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function normalizeArray(scope) {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean);
  return String(scope)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeWeightMap(weights = {}, fallback = null) {
  const keys = new Set([...DEFAULT_EXPERT_KEYS, ...Object.keys(weights || {})]);
  const entries = Array.from(keys).map((key) => [key, Math.max(0, toNumber(weights?.[key], 0))]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (!total) {
    if (fallback) return normalizeWeightMap(fallback, null);
    const even = round(1 / DEFAULT_EXPERT_KEYS.length, 4);
    return Object.fromEntries(DEFAULT_EXPERT_KEYS.map((key) => [key, even]));
  }

  const normalized = Object.fromEntries(entries.map(([key, value]) => [key, round(value / total, 4)]));
  const normalizedTotal = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const residual = round(1 - normalizedTotal, 4);
  if (Math.abs(residual) > 0 && normalized[DEFAULT_EXPERT_KEYS[0]] !== undefined) {
    normalized[DEFAULT_EXPERT_KEYS[0]] = round(normalized[DEFAULT_EXPERT_KEYS[0]] + residual, 4);
  }
  return normalized;
}

function limitWeightShift(currentWeights = {}, targetWeights = {}, maxShiftPerRun = DEFAULT_MAX_SHIFT) {
  const current = normalizeWeightMap(currentWeights);
  const target = normalizeWeightMap(targetWeights, current);
  const capped = {};

  for (const expertKey of new Set([...Object.keys(current), ...Object.keys(target)])) {
    const currentValue = toNumber(current[expertKey], 0);
    const targetValue = toNumber(target[expertKey], currentValue);
    const delta = clamp(targetValue - currentValue, -Math.abs(maxShiftPerRun), Math.abs(maxShiftPerRun));
    capped[expertKey] = Math.max(0.01, round(currentValue + delta, 4));
  }

  return normalizeWeightMap(capped, current);
}

function buildWeightDiff(currentWeights = {}, recommendedWeights = {}) {
  const current = normalizeWeightMap(currentWeights);
  const recommended = normalizeWeightMap(recommendedWeights, current);
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(recommended)])).sort();

  return keys.map((expertKey) => ({
    expertKey,
    currentWeight: round(current[expertKey], 4),
    recommendedWeight: round(recommended[expertKey], 4),
    delta: round(toNumber(recommended[expertKey], 0) - toNumber(current[expertKey], 0), 4),
  }));
}

function resolveOutcomeValue(row) {
  const pnl = toNumber(row.realizedPnl, 0);
  if (pnl > 0) return 1;
  if (pnl < 0) return -1;
  return 0;
}

function resolveDecisionDirection(action) {
  const normalized = String(action || '').toUpperCase();
  if (normalized === 'BUY') return 1;
  if (normalized === 'SELL') return -1;
  return 0;
}

function resolveRegimeKey(payload = {}) {
  return (
    payload?.runtime?.currentRegime
    || payload?.trainingRuntime?.currentRegime
    || payload?.currentRegime
    || 'mixed'
  );
}

function normalizeExpertSignalsFromPayload(payload = {}) {
  const experts = payload?.experts || payload?.expertScores || payload?.components || {};
  const result = {};

  for (const [expertKey, value] of Object.entries(experts || {})) {
    if (!value || typeof value !== 'object') continue;

    if (typeof value.numeric === 'number') {
      result[expertKey] = {
        numeric: clamp(value.numeric, -1, 1),
        confidence: clamp(toNumber(value.confidence, Math.abs(value.numeric)), 0, 1),
      };
      continue;
    }

    const buyScore = toNumber(value.buy, NaN);
    const sellScore = toNumber(value.sell, NaN);
    if (Number.isFinite(buyScore) || Number.isFinite(sellScore)) {
      const safeBuy = Number.isFinite(buyScore) ? buyScore : 0;
      const safeSell = Number.isFinite(sellScore) ? sellScore : 0;
      result[expertKey] = {
        numeric: clamp(safeBuy - safeSell, -1, 1),
        confidence: clamp(Math.max(safeBuy, safeSell), 0, 1),
      };
      continue;
    }

    const signal = String(value.signal || value.action || value.label || '').toUpperCase();
    if (signal === 'BUY' || signal === 'COMPRAR') {
      result[expertKey] = { numeric: 1, confidence: clamp(toNumber(value.confidence, 1), 0, 1) };
    } else if (signal === 'SELL' || signal === 'VENDER') {
      result[expertKey] = { numeric: -1, confidence: clamp(toNumber(value.confidence, 1), 0, 1) };
    } else if (signal) {
      result[expertKey] = { numeric: 0, confidence: clamp(toNumber(value.confidence, 0.5), 0, 1) };
    }
  }

  return result;
}

function computeExpertBucketsByRegime(rows = []) {
  const buckets = new Map();

  const getBucket = (regimeKey, expertKey) => {
    if (!buckets.has(regimeKey)) buckets.set(regimeKey, {});
    const regimeBucket = buckets.get(regimeKey);
    if (!regimeBucket[expertKey]) {
      regimeBucket[expertKey] = {
        expertKey,
        samples: 0,
        supportingSamples: 0,
        supportiveWins: 0,
        supportiveLosses: 0,
        totalSupport: 0,
        contributionRaw: 0,
        avgConfidence: 0,
      };
    }
    return regimeBucket[expertKey];
  };

  for (const row of rows) {
    const payload = row.payload || {};
    const regimeKey = String(resolveRegimeKey(payload) || 'mixed').toLowerCase();
    const finalDirection = resolveDecisionDirection(row.action);
    if (!finalDirection) continue;

    const outcome = resolveOutcomeValue(row);
    const expertSignals = normalizeExpertSignalsFromPayload(payload);

    for (const expertKey of Object.keys(expertSignals)) {
      const signal = expertSignals[expertKey];
      const bucket = getBucket(regimeKey, expertKey);
      const expertDirection = signal.numeric > 0.1 ? 1 : signal.numeric < -0.1 ? -1 : 0;
      const support = expertDirection === finalDirection ? 1 : expertDirection === 0 ? 0.35 : -1;

      bucket.samples += 1;
      bucket.avgConfidence += clamp(toNumber(signal.confidence, Math.abs(signal.numeric)), 0, 1);
      bucket.totalSupport += support;
      if (support > 0) bucket.supportingSamples += 1;

      const weightedContribution = support * outcome * Math.max(0.2, clamp(toNumber(signal.confidence, 0.5), 0, 1));
      bucket.contributionRaw += weightedContribution;
      if (support > 0 && outcome > 0) bucket.supportiveWins += 1;
      if (support > 0 && outcome < 0) bucket.supportiveLosses += 1;
    }
  }

  return buckets;
}

function finalizeExpertBuckets(regimeBuckets = new Map()) {
  return Array.from(regimeBuckets.entries()).map(([regimeKey, bucket]) => {
    const experts = Object.values(bucket)
      .map((item) => {
        const supportRate = item.samples ? item.supportingSamples / item.samples : 0;
        const decisiveSamples = item.supportiveWins + item.supportiveLosses;
        const hitRate = decisiveSamples ? item.supportiveWins / decisiveSamples : 0.5;
        const avgConfidence = item.samples ? item.avgConfidence / item.samples : 0;
        const contributionScore = item.samples ? item.contributionRaw / item.samples : 0;
        const qualityScore = clamp(
          (hitRate * 0.55) + (supportRate * 0.2) + (((contributionScore + 1) / 2) * 0.25),
          0,
          1,
        );

        return {
          expertKey: item.expertKey,
          samples: item.samples,
          supportRate: round(supportRate, 4),
          hitRate: round(hitRate, 4),
          avgConfidence: round(avgConfidence, 4),
          contributionScore: round(contributionScore, 4),
          qualityScore: round(qualityScore, 4),
          status: qualityScore >= 0.66 ? 'healthy' : qualityScore >= 0.48 ? 'warning' : 'degraded',
        };
      })
      .sort((left, right) => right.qualityScore - left.qualityScore);

    const aggregate = experts.reduce(
      (acc, item) => {
        acc.samples += item.samples;
        acc.avgQualityScore += item.qualityScore;
        return acc;
      },
      { samples: 0, avgQualityScore: 0 },
    );

    return {
      regimeKey,
      samples: aggregate.samples,
      expertCount: experts.length,
      avgQualityScore: experts.length ? round(aggregate.avgQualityScore / experts.length, 4) : 0,
      experts,
    };
  });
}

async function fetchDecisionRows({ windowDays = DEFAULT_WINDOW_DAYS, symbolScope = null } = {}) {
  const normalizedScope = normalizeArray(symbolScope);
  const result = await pool.query(
    `
      SELECT
        d.id,
        d.symbol,
        d.action,
        d.confidence,
        d.blocked,
        d.reason,
        d.payload,
        d.created_at AS "createdAt",
        o.id AS "orderId",
        o.status AS "orderStatus",
        o.realized_pnl AS "realizedPnl"
      FROM ai_decisions d
      LEFT JOIN LATERAL (
        SELECT id, status, realized_pnl
        FROM paper_orders
        WHERE linked_decision_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) o ON TRUE
      WHERE d.created_at >= NOW() - (($1::int || ' days')::interval)
        AND ($2::text[] IS NULL OR d.symbol = ANY($2))
      ORDER BY d.created_at DESC
    `,
    [Math.max(1, Math.min(Number(windowDays || DEFAULT_WINDOW_DAYS), 180)), normalizedScope.length ? normalizedScope : null],
  );

  return result.rows || [];
}

function buildRegimeMetrics(rows = [], regimeExpertPerformance = []) {
  const grouped = new Map();

  for (const row of rows) {
    const regimeKey = String(resolveRegimeKey(row.payload || {}) || 'mixed').toLowerCase();
    if (!grouped.has(regimeKey)) {
      grouped.set(regimeKey, {
        regimeKey,
        decisions: 0,
        blockedDecisions: 0,
        executedDecisions: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        avgConfidenceRaw: 0,
      });
    }

    const bucket = grouped.get(regimeKey);
    bucket.decisions += 1;
    bucket.avgConfidenceRaw += toNumber(row.confidence, 0);
    if (row.blocked) bucket.blockedDecisions += 1;
    if (row.orderStatus) {
      bucket.executedDecisions += 1;
      const pnl = toNumber(row.realizedPnl, 0);
      bucket.totalPnl += pnl;
      if (pnl > 0) bucket.wins += 1;
      if (pnl < 0) bucket.losses += 1;
    }
  }

  return Array.from(grouped.values())
    .map((item) => {
      const expertMetrics = regimeExpertPerformance.find((entry) => entry.regimeKey === item.regimeKey)?.experts || [];
      return {
        regimeKey: item.regimeKey,
        decisions: item.decisions,
        blockedDecisions: item.blockedDecisions,
        executedDecisions: item.executedDecisions,
        blockedRate: item.decisions ? round(item.blockedDecisions / item.decisions, 4) : 0,
        winRate: item.executedDecisions ? round(item.wins / item.executedDecisions, 4) : 0,
        totalPnl: round(item.totalPnl, 6),
        avgConfidence: item.decisions ? round(item.avgConfidenceRaw / item.decisions, 4) : 0,
        degradedExperts: expertMetrics.filter((entry) => entry.status === 'degraded').map((entry) => entry.expertKey),
        topExperts: expertMetrics.slice(0, 3),
      };
    })
    .sort((left, right) => right.decisions - left.decisions);
}

async function getRegimeAndExpertPerformance({ windowDays = DEFAULT_WINDOW_DAYS, symbolScope = null } = {}) {
  const rows = await fetchDecisionRows({ windowDays, symbolScope });
  const regimeBuckets = computeExpertBucketsByRegime(rows);
  const regimeExpertPerformance = finalizeExpertBuckets(regimeBuckets);
  const regimeMetrics = buildRegimeMetrics(rows, regimeExpertPerformance);

  return {
    windowDays: Math.max(1, Math.min(Number(windowDays || DEFAULT_WINDOW_DAYS), 180)),
    symbolScope: normalizeArray(symbolScope),
    decisionsAnalyzed: rows.length,
    regimes: regimeMetrics,
    expertsByRegime: regimeExpertPerformance,
    generatedAt: new Date().toISOString(),
  };
}

function buildExpertActions(expertEvaluations = [], weightDiff = []) {
  const diffByExpert = Object.fromEntries((weightDiff || []).map((item) => [item.expertKey, item]));
  return (expertEvaluations || []).map((item) => {
    const delta = diffByExpert[item.expert]?.delta || 0;
    let action = 'keep';
    if (item.qualityLabel === 'poor' || item.qualityScore < 0.46 || delta < -0.015) action = 'reduce';
    if (item.qualityLabel === 'healthy' && delta > 0.015) action = 'reinforce';
    return {
      expertKey: item.expert,
      currentWeight: item.currentWeight,
      qualityScore: item.qualityScore,
      qualityLabel: item.qualityLabel,
      contributionScore: item.contributionScore,
      supportRate: item.supportRate,
      hitRate: item.hitRate,
      recommendedWeight: diffByExpert[item.expert]?.recommendedWeight ?? item.currentWeight,
      delta,
      action,
    };
  });
}

function resolveCurrentWeightSources(activeConfig = {}, runtimePayload = {}) {
  const aiWeights = normalizeWeightMap(activeConfig?.ai?.expertWeights || {});
  const trainingWeights = normalizeWeightMap(activeConfig?.training?.expertWeights || {}, aiWeights);
  const runtimeWeights = normalizeWeightMap(runtimePayload?.runtime?.effectiveExpertWeights || {}, trainingWeights);

  return {
    aiWeights,
    trainingWeights,
    runtimeWeights,
  };
}

function buildRecommendationSummary({
  insight,
  performance,
  settings,
  activeConfig,
  runtimePayload,
}) {
  const currentWeights = resolveCurrentWeightSources(activeConfig, runtimePayload);
  const maxShiftPerRun = toNumber(settings?.settings?.maxWeightShiftPerRun, DEFAULT_MAX_SHIFT);
  const recommendedWeights = limitWeightShift(currentWeights.aiWeights, insight.suggestedWeights, maxShiftPerRun);
  const diff = buildWeightDiff(currentWeights.aiWeights, recommendedWeights);
  const expertActions = buildExpertActions(insight.expertEvaluations || [], diff);
  const degradedExperts = expertActions.filter((item) => item.action === 'reduce').map((item) => item.expertKey);
  const minQualityScoreForApply = toNumber(settings?.settings?.minQualityScoreForApply, 0.56);
  const decisionsAnalyzed = toNumber(insight?.stats?.decisionsAnalyzed, 0);
  const minDecisions = DEFAULT_MIN_DECISIONS;
  const driftLevel = String(insight?.driftSummary?.driftLevel || 'low').toLowerCase();
  const safeToApply = Boolean(
    decisionsAnalyzed >= minDecisions
    && toNumber(insight?.qualitySummary?.qualityScore, 0) >= minQualityScoreForApply
    && (settings?.settings?.allowApplyWithWarning || driftLevel !== 'high')
  );

  return {
    generatedAt: new Date().toISOString(),
    windowDays: insight.windowDays,
    symbolScope: insight.symbols || [],
    currentRegime: runtimePayload?.runtime?.currentRegime || activeConfig?.training?.currentRegime || activeConfig?.training?.activeRegimePreset || 'mixed',
    quality: insight.qualitySummary,
    drift: insight.driftSummary,
    decisionsAnalyzed,
    currentWeights,
    recommendedWeights,
    weightDiff: diff,
    expertActions,
    degradedExperts,
    regimePerformance: performance.regimes,
    expertsByRegime: performance.expertsByRegime,
    safeToApply,
    guardrails: {
      minQualityScoreForApply,
      maxWeightShiftPerRun: maxShiftPerRun,
      minDecisions,
      allowApplyWithWarning: Boolean(settings?.settings?.allowApplyWithWarning),
      adaptiveExpertsEnabled: Boolean(settings?.settings?.adaptiveExpertsEnabled),
    },
  };
}

async function getTrainingRecalibrationRecommendation({ windowDays = DEFAULT_WINDOW_DAYS, symbolScope = null } = {}) {
  const [activeConfigRow, settings, runtimePayload, insight, performance] = await Promise.all([
    getActiveConfig(),
    getTrainingSettings(),
    getTrainingRuntimeState(),
    deriveTrainingInsight({ windowDays, symbolScope }),
    getRegimeAndExpertPerformance({ windowDays, symbolScope }),
  ]);

  const activeConfig = activeConfigRow?.config || {};
  const recommendation = buildRecommendationSummary({
    insight,
    performance,
    settings,
    activeConfig,
    runtimePayload,
  });

  return {
    recommendation,
    configVersion: activeConfigRow?.version || null,
    runtime: runtimePayload?.runtime || null,
    training: activeConfig?.training || {},
  };
}

async function persistRecalibrationHistory({
  requestedBy = 'dashboard',
  triggerSource = 'manual',
  windowDays = DEFAULT_WINDOW_DAYS,
  summary = {},
  applied = false,
  appliedConfigVersion = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO training_recalibration_history (
        requested_by,
        trigger_source,
        window_days,
        applied,
        applied_config_version,
        summary,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      RETURNING
        id,
        requested_by AS "requestedBy",
        trigger_source AS "triggerSource",
        window_days AS "windowDays",
        applied,
        applied_config_version AS "appliedConfigVersion",
        summary,
        created_at AS "createdAt"
    `,
    [
      String(requestedBy || 'dashboard'),
      String(triggerSource || 'manual'),
      Math.max(1, Math.min(Number(windowDays || DEFAULT_WINDOW_DAYS), 180)),
      Boolean(applied),
      appliedConfigVersion ? Number(appliedConfigVersion) : null,
      JSON.stringify(summary || {}),
    ],
  );

  return result.rows[0] || null;
}

async function listTrainingRecalibrationHistory({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        requested_by AS "requestedBy",
        trigger_source AS "triggerSource",
        window_days AS "windowDays",
        applied,
        applied_config_version AS "appliedConfigVersion",
        summary,
        created_at AS "createdAt"
      FROM training_recalibration_history
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 20), 100))],
  );

  return result.rows || [];
}

async function runTrainingRecalibration({
  requestedBy = 'dashboard',
  triggerSource = 'manual',
  windowDays = DEFAULT_WINDOW_DAYS,
  symbolScope = null,
  autoApply = true,
  force = false,
} = {}) {
  const activeConfigRow = await getActiveConfig();
  const recommendationPayload = await getTrainingRecalibrationRecommendation({ windowDays, symbolScope });
  const recommendation = recommendationPayload.recommendation;
  const activeConfig = activeConfigRow?.config || {};
  const trainingConfig = activeConfig.training || {};

  const shouldApply = Boolean(
    autoApply
    && Boolean(trainingConfig.enabled ?? true)
    && Boolean(trainingConfig.allowSuggestedWeightsApply ?? true)
    && (force || recommendation.safeToApply)
  );

  let appliedConfigVersion = null;
  let applied = false;
  let updatedConfig = null;

  if (shouldApply) {
    updatedConfig = deepMerge(activeConfig, {
      ai: {
        expertWeights: recommendation.recommendedWeights,
      },
      training: {
        expertWeights: recommendation.recommendedWeights,
        lastRecalibrationAt: new Date().toISOString(),
        lastRecommendedExpertWeights: recommendation.recommendedWeights,
        lastRecalibrationSummary: {
          qualityScore: recommendation.quality?.qualityScore ?? null,
          driftScore: recommendation.drift?.driftScore ?? null,
          currentRegime: recommendation.currentRegime,
          degradedExperts: recommendation.degradedExperts,
        },
      },
    });

    const updated = await updateActiveConfig(updatedConfig, {
      actionType: 'training_recalibration_apply',
      actor: requestedBy,
      sourceType: triggerSource,
      reason: `Aplicação de recalibração automática dos experts (${recommendation.currentRegime}).`,
      metadata: {
        currentRegime: recommendation.currentRegime,
        qualityScore: recommendation.quality?.qualityScore ?? null,
        driftScore: recommendation.drift?.driftScore ?? null,
        degradedExperts: recommendation.degradedExperts,
        recommendedWeights: recommendation.recommendedWeights,
      },
    });

    appliedConfigVersion = updated?.version || null;
    applied = true;
  }

  const summary = {
    ...recommendation,
    applyDecision: {
      requested: Boolean(autoApply),
      applied,
      forced: Boolean(force),
      reason: applied
        ? 'weights_applied'
        : recommendation.safeToApply
          ? 'apply_disabled_or_config_blocked'
          : 'guardrail_blocked',
    },
  };

  const history = await persistRecalibrationHistory({
    requestedBy,
    triggerSource,
    windowDays,
    summary,
    applied,
    appliedConfigVersion,
  });

  return {
    message: applied
      ? 'Recalibração dos experts executada e aplicada com sucesso.'
      : 'Recalibração dos experts executada em modo análise.',
    recommendation,
    applied,
    appliedConfigVersion,
    history,
  };
}

module.exports = {
  getRegimeAndExpertPerformance,
  getTrainingRecalibrationRecommendation,
  listTrainingRecalibrationHistory,
  runTrainingRecalibration,
  _internals: {
    normalizeWeightMap,
    limitWeightShift,
    buildWeightDiff,
    normalizeExpertSignalsFromPayload,
    computeExpertBucketsByRegime,
    finalizeExpertBuckets,
    buildRegimeMetrics,
    buildExpertActions,
    buildRecommendationSummary,
  },
};
