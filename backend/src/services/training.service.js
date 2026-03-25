const pool = require('../db/pool');
const { getActiveConfig, updateActiveConfig, deepMerge } = require('./config.service');

const DEFAULT_EXPERTS = ['trend', 'momentum', 'volatility', 'liquidity', 'regime', 'pattern', 'risk'];

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value, digits = 6) {
  const numeric = toNumber(value, 0);
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function normalizeArray(scope) {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean);
  return String(scope)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function statusFromScore(score) {
  if (score >= 0.66) return 'healthy';
  if (score >= 0.46) return 'warning';
  return 'poor';
}

function getDecisionOutcomeValue(row) {
  const pnl = toNumber(row.realizedPnl, 0);
  if (pnl > 0) return 1;
  if (pnl < 0) return -1;
  return 0;
}

function normalizeExpertPayload(payload = {}) {
  const result = {};
  const candidates = [
    payload.expertScores,
    payload.expertSignals,
    payload.expertVotes,
    payload.experts,
    payload.components,
    payload.breakdown,
  ].filter(Boolean);

  const pickSignal = (value) => {
    if (typeof value === 'number') {
      return { numeric: clamp(value, -1, 1), confidence: Math.abs(value), text: value > 0 ? 'BUY' : value < 0 ? 'SELL' : 'HOLD' };
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      if (normalized === 'BUY' || normalized === 'COMPRAR') return { numeric: 1, confidence: 1, text: 'BUY' };
      if (normalized === 'SELL' || normalized === 'VENDER') return { numeric: -1, confidence: 1, text: 'SELL' };
      if (normalized === 'HOLD' || normalized === 'BLOCK') return { numeric: 0, confidence: 0.5, text: normalized };
      return null;
    }

    if (value && typeof value === 'object') {
      if (typeof value.numeric === 'number') {
        return {
          numeric: clamp(value.numeric, -1, 1),
          confidence: clamp(toNumber(value.confidence, Math.abs(value.numeric)), 0, 1),
          text: value.numeric > 0 ? 'BUY' : value.numeric < 0 ? 'SELL' : 'HOLD',
        };
      }

      const text = String(value.signal || value.action || value.label || '').toUpperCase();
      if (text) {
        const parsed = pickSignal(text);
        if (parsed) {
          return {
            ...parsed,
            confidence: clamp(toNumber(value.confidence, parsed.confidence), 0, 1),
          };
        }
      }

      if (typeof value.score === 'number') {
        return {
          numeric: clamp(value.score, -1, 1),
          confidence: clamp(toNumber(value.confidence, Math.abs(value.score)), 0, 1),
          text: value.score > 0 ? 'BUY' : value.score < 0 ? 'SELL' : 'HOLD',
        };
      }
    }

    return null;
  };

  for (const candidate of candidates) {
    for (const expert of DEFAULT_EXPERTS) {
      if (result[expert]) continue;
      if (candidate[expert] === undefined) continue;
      const parsed = pickSignal(candidate[expert]);
      if (parsed) {
        result[expert] = parsed;
      }
    }
  }

  return result;
}

function computeExpertEvaluations(rows, currentWeights = {}) {
  const bucket = Object.fromEntries(
    DEFAULT_EXPERTS.map((expert) => [
      expert,
      {
        expert,
        samples: 0,
        supportingSamples: 0,
        avgConfidence: 0,
        totalSupport: 0,
        contributionRaw: 0,
        supportiveWins: 0,
        supportiveLosses: 0,
      },
    ]),
  );

  for (const row of rows) {
    const outcome = getDecisionOutcomeValue(row);
    const finalDirection = String(row.action || '').toUpperCase() === 'SELL' ? -1 : String(row.action || '').toUpperCase() === 'BUY' ? 1 : 0;
    if (!finalDirection) continue;

    const experts = normalizeExpertPayload(row.payload || {});

    for (const expert of DEFAULT_EXPERTS) {
      const evalRow = bucket[expert];
      const signal = experts[expert];
      if (!signal) continue;

      evalRow.samples += 1;
      evalRow.avgConfidence += clamp(toNumber(signal.confidence, Math.abs(signal.numeric)), 0, 1);

      const expertDirection = signal.numeric > 0.1 ? 1 : signal.numeric < -0.1 ? -1 : 0;
      const support = expertDirection === finalDirection ? 1 : expertDirection === 0 ? 0.35 : -1;
      evalRow.totalSupport += support;
      if (support > 0) {
        evalRow.supportingSamples += 1;
      }

      const weightedContribution = support * outcome * Math.max(0.2, clamp(toNumber(signal.confidence, 0.5), 0, 1));
      evalRow.contributionRaw += weightedContribution;

      if (support > 0 && outcome > 0) evalRow.supportiveWins += 1;
      if (support > 0 && outcome < 0) evalRow.supportiveLosses += 1;
    }
  }

  return DEFAULT_EXPERTS.map((expert) => {
    const currentWeight = toNumber(currentWeights?.[expert], 1 / DEFAULT_EXPERTS.length);
    const item = bucket[expert];
    const avgConfidence = item.samples ? item.avgConfidence / item.samples : 0;
    const supportRate = item.samples ? item.supportingSamples / item.samples : 0;
    const supportiveSampleBase = item.supportiveWins + item.supportiveLosses;
    const hitRate = supportiveSampleBase ? item.supportiveWins / supportiveSampleBase : 0.5;
    const contributionScore = item.samples ? (item.contributionRaw / item.samples) : 0;
    const qualityScore = clamp((hitRate * 0.6) + (supportRate * 0.2) + ((contributionScore + 1) / 2) * 0.2, 0, 1);

    return {
      expert,
      samples: item.samples,
      supportRate: round(supportRate, 4),
      hitRate: round(hitRate, 4),
      avgConfidence: round(avgConfidence, 4),
      contributionScore: round(contributionScore, 4),
      qualityScore: round(qualityScore, 4),
      qualityLabel: statusFromScore(qualityScore),
      currentWeight: round(currentWeight, 4),
    };
  }).sort((left, right) => right.qualityScore - left.qualityScore);
}

function buildSuggestedWeights(expertEvaluations, currentWeights = {}) {
  const weighted = expertEvaluations.map((item) => {
    const baseline = Math.max(0.05, toNumber(currentWeights?.[item.expert], 1 / DEFAULT_EXPERTS.length));
    const multiplier = clamp(0.7 + (item.qualityScore * 0.9) + (item.contributionScore * 0.25), 0.25, 1.85);
    return {
      expert: item.expert,
      raw: baseline * multiplier,
    };
  });

  const total = weighted.reduce((sum, item) => sum + item.raw, 0) || 1;
  const normalized = {};

  weighted.forEach((item) => {
    normalized[item.expert] = round(item.raw / total, 4);
  });

  const normalizedTotal = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const residual = round(1 - normalizedTotal, 4);
  if (Math.abs(residual) > 0 && normalized[weighted[0]?.expert]) {
    normalized[weighted[0].expert] = round(normalized[weighted[0].expert] + residual, 4);
  }

  return normalized;
}

function computeQualityMetrics(rows) {
  const totalDecisions = rows.length;
  const blockedDecisions = rows.filter((row) => row.blocked).length;
  const executedRows = rows.filter((row) => row.orderStatus);
  const buyRows = executedRows.filter((row) => String(row.action).toUpperCase() === 'BUY');
  const sellRows = executedRows.filter((row) => String(row.action).toUpperCase() === 'SELL');
  const wins = executedRows.filter((row) => toNumber(row.realizedPnl, 0) > 0);
  const losses = executedRows.filter((row) => toNumber(row.realizedPnl, 0) < 0);
  const grossProfit = wins.reduce((sum, row) => sum + toNumber(row.realizedPnl, 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, row) => sum + toNumber(row.realizedPnl, 0), 0));
  const totalPnl = executedRows.reduce((sum, row) => sum + toNumber(row.realizedPnl, 0), 0);
  const avgPnl = executedRows.length ? totalPnl / executedRows.length : 0;
  const avgConfidence = totalDecisions ? rows.reduce((sum, row) => sum + toNumber(row.confidence, 0), 0) / totalDecisions : 0;
  const blockedRate = totalDecisions ? blockedDecisions / totalDecisions : 0;
  const winRate = executedRows.length ? wins.length / executedRows.length : 0;
  const buyWinRate = buyRows.length ? buyRows.filter((row) => toNumber(row.realizedPnl, 0) > 0).length / buyRows.length : 0;
  const sellWinRate = sellRows.length ? sellRows.filter((row) => toNumber(row.realizedPnl, 0) > 0).length / sellRows.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);
  const expectancy = executedRows.length ? totalPnl / executedRows.length : 0;
  const qualityScore = clamp(
    (winRate * 0.4)
    + (clamp((profitFactor / 2), 0, 1) * 0.25)
    + (clamp((avgConfidence / 0.85), 0, 1) * 0.15)
    + (clamp((1 - blockedRate), 0, 1) * 0.10)
    + (clamp((totalPnl > 0 ? 1 : totalPnl === 0 ? 0.5 : 0), 0, 1) * 0.10),
    0,
    1,
  );

  return {
    totalDecisions,
    blockedDecisions,
    executedDecisions: executedRows.length,
    blockedRate: round(blockedRate, 4),
    avgConfidence: round(avgConfidence, 4),
    totalPnl: round(totalPnl, 6),
    avgPnl: round(avgPnl, 6),
    winRate: round(winRate, 4),
    buyWinRate: round(buyWinRate, 4),
    sellWinRate: round(sellWinRate, 4),
    profitFactor: round(profitFactor, 4),
    expectancy: round(expectancy, 6),
    qualityScore: round(qualityScore, 4),
    qualityStatus: statusFromScore(qualityScore),
  };
}

function splitSeries(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = String(row.symbol || '').toUpperCase();
    if (!symbol) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push({
      openTime: Number(row.openTime),
      close: toNumber(row.close, 0),
      volume: toNumber(row.volume, 0),
    });
  }
  return bySymbol;
}

function calcReturns(series) {
  const returns = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = toNumber(series[index - 1].close, 0);
    const current = toNumber(series[index].close, 0);
    if (previous > 0 && current > 0) {
      returns.push((current - previous) / previous);
    }
  }
  return returns;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + toNumber(value, 0), 0) / values.length : 0;
}

function stddev(values) {
  if (!values.length) return 0;
  const mean = avg(values);
  const variance = avg(values.map((value) => (toNumber(value, 0) - mean) ** 2));
  return Math.sqrt(variance);
}

function computeDriftSummary(rows) {
  const grouped = splitSeries(rows);
  const symbolInsights = [];
  const scores = [];

  for (const [symbol, seriesDesc] of grouped.entries()) {
    const series = [...seriesDesc].sort((left, right) => left.openTime - right.openTime);
    if (series.length < 24) continue;

    const midpoint = Math.floor(series.length / 2);
    const previous = series.slice(0, midpoint);
    const recent = series.slice(midpoint);
    if (previous.length < 8 || recent.length < 8) continue;

    const prevReturns = calcReturns(previous);
    const recentReturns = calcReturns(recent);
    const prevVolatility = stddev(prevReturns);
    const recentVolatility = stddev(recentReturns);
    const prevVolume = avg(previous.map((item) => item.volume));
    const recentVolume = avg(recent.map((item) => item.volume));
    const prevNetReturn = previous[0]?.close > 0 ? ((previous.at(-1).close - previous[0].close) / previous[0].close) : 0;
    const recentNetReturn = recent[0]?.close > 0 ? ((recent.at(-1).close - recent[0].close) / recent[0].close) : 0;

    const volatilityRatio = prevVolatility > 0 ? recentVolatility / prevVolatility : (recentVolatility > 0 ? 2 : 1);
    const volumeRatio = prevVolume > 0 ? recentVolume / prevVolume : (recentVolume > 0 ? 2 : 1);
    const returnShift = Math.abs(recentNetReturn - prevNetReturn);
    const driftScore = clamp((Math.abs(volatilityRatio - 1) * 0.45) + (Math.abs(volumeRatio - 1) * 0.25) + clamp(returnShift * 6, 0, 1) * 0.30, 0, 1);
    scores.push(driftScore);

    symbolInsights.push({
      symbol,
      driftScore: round(driftScore, 4),
      volatilityRatio: round(volatilityRatio, 4),
      volumeRatio: round(volumeRatio, 4),
      returnShift: round(returnShift, 4),
    });
  }

  const averageScore = avg(scores);
  const driftLevel = averageScore >= 0.7 ? 'high' : averageScore >= 0.4 ? 'moderate' : 'low';

  return {
    driftLevel,
    driftScore: round(averageScore, 4),
    symbolInsights: symbolInsights.sort((left, right) => right.driftScore - left.driftScore).slice(0, 12),
  };
}

async function fetchDecisionWindow({ windowDays = 14, symbolScope = [] } = {}) {
  const symbols = normalizeArray(symbolScope);
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
        o.realized_pnl AS "realizedPnl",
        o.created_at AS "orderCreatedAt"
      FROM ai_decisions d
      LEFT JOIN LATERAL (
        SELECT id, status, realized_pnl, created_at
        FROM paper_orders
        WHERE linked_decision_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) o ON TRUE
      WHERE d.created_at >= NOW() - (($1::int || ' days')::interval)
        AND ($2::text[] IS NULL OR d.symbol = ANY($2))
      ORDER BY d.created_at DESC
    `,
    [Math.max(1, Math.min(Number(windowDays || 14), 180)), symbols.length ? symbols : null],
  );

  return result.rows;
}

async function fetchDriftRows({ symbolScope = [], interval = '5m', pointsPerSymbol = 80 } = {}) {
  const symbols = normalizeArray(symbolScope);
  if (!symbols.length) return [];

  const result = await pool.query(
    `
      SELECT symbol, open_time AS "openTime", close, volume
      FROM (
        SELECT symbol, open_time, close, volume,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY open_time DESC) AS rn
        FROM market_candles
        WHERE interval = $1 AND symbol = ANY($2)
      ) ranked
      WHERE rn <= $3
      ORDER BY symbol ASC, open_time DESC
    `,
    [String(interval || '5m'), symbols, Math.max(20, Math.min(Number(pointsPerSymbol || 80), 240))],
  );

  return result.rows;
}

async function createTrainingRun({ label, objective, symbolScope, windowDays, requestedBy, applySuggestedWeights }) {
  const result = await pool.query(
    `
      INSERT INTO training_runs (
        label,
        objective,
        symbol_scope,
        window_days,
        status,
        summary,
        suggested_config_override,
        requested_by,
        apply_suggested_weights,
        started_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4, 'running', '{}'::jsonb, '{}'::jsonb, $5, $6, NOW(), NOW(), NOW())
      RETURNING
        id,
        label,
        objective,
        symbol_scope AS "symbolScope",
        window_days AS "windowDays",
        status,
        requested_by AS "requestedBy",
        apply_suggested_weights AS "applySuggestedWeights",
        created_at AS "createdAt"
    `,
    [
      String(label || 'manual-training-assistance'),
      String(objective || 'quality_assistance'),
      JSON.stringify(symbolScope || []),
      Math.max(1, Math.min(Number(windowDays || 14), 180)),
      String(requestedBy || 'dashboard'),
      Boolean(applySuggestedWeights),
    ],
  );

  return result.rows[0];
}

async function appendTrainingRunLog({ trainingRunId, level = 'info', stepKey = 'info', message, payload = null }) {
  if (!trainingRunId) return null;

  const result = await pool.query(
    `
      INSERT INTO training_run_logs (
        training_run_id,
        level,
        step_key,
        message,
        payload,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      RETURNING
        id,
        training_run_id AS "trainingRunId",
        level,
        step_key AS "stepKey",
        message,
        payload,
        created_at AS "createdAt"
    `,
    [
      trainingRunId,
      String(level || 'info'),
      String(stepKey || 'info'),
      String(message || ''),
      JSON.stringify(payload || {}),
    ],
  );

  return result.rows[0];
}

async function finalizeTrainingRunSuccess({ trainingRunId, qualitySummary, expertEvaluations, suggestedWeights, driftSummary, appliedConfigVersion = null }) {
  const result = await pool.query(
    `
      UPDATE training_runs
      SET
        status = 'completed',
        summary = $2::jsonb,
        suggested_config_override = $3::jsonb,
        applied_config_version = $4,
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        label,
        objective,
        symbol_scope AS "symbolScope",
        window_days AS "windowDays",
        status,
        summary,
        suggested_config_override AS "suggestedConfigOverride",
        requested_by AS "requestedBy",
        apply_suggested_weights AS "applySuggestedWeights",
        applied_config_version AS "appliedConfigVersion",
        created_at AS "createdAt"
    `,
    [
      trainingRunId,
      JSON.stringify({ quality: qualitySummary, experts: expertEvaluations, drift: driftSummary }),
      JSON.stringify({ ai: { expertWeights: suggestedWeights } }),
      appliedConfigVersion,
    ],
  );

  return result.rows[0];
}

async function finalizeTrainingRunFailure({ trainingRunId, errorMessage }) {
  if (!trainingRunId) return null;

  const result = await pool.query(
    `
      UPDATE training_runs
      SET
        status = 'failed',
        summary = jsonb_set(COALESCE(summary, '{}'::jsonb), '{error}', to_jsonb($2::text), true),
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        label,
        objective,
        symbol_scope AS "symbolScope",
        window_days AS "windowDays",
        status,
        summary,
        suggested_config_override AS "suggestedConfigOverride",
        requested_by AS "requestedBy",
        apply_suggested_weights AS "applySuggestedWeights",
        applied_config_version AS "appliedConfigVersion",
        created_at AS "createdAt"
    `,
    [trainingRunId, String(errorMessage || 'training_run_failed')],
  );

  return result.rows[0] || null;
}

async function persistTrainingArtifacts({ trainingRunId, symbolScope, windowDays, qualitySummary, expertEvaluations, suggestedWeights, driftSummary }) {
  await pool.query(
    `
      INSERT INTO expert_evaluation_reports (training_run_id, window_days, summary, created_at)
      VALUES ($1, $2, $3::jsonb, NOW())
    `,
    [trainingRunId, windowDays, JSON.stringify({ experts: expertEvaluations, suggestedWeights })],
  );

  await pool.query(
    `
      INSERT INTO model_quality_reports (training_run_id, window_days, quality_status, summary, created_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
    `,
    [trainingRunId, windowDays, String(qualitySummary.qualityStatus || 'warning'), JSON.stringify(qualitySummary)],
  );

  await pool.query(
    `
      INSERT INTO model_drift_reports (training_run_id, symbol_scope, drift_level, summary, created_at)
      VALUES ($1, $2::jsonb, $3, $4::jsonb, NOW())
    `,
    [trainingRunId, JSON.stringify(symbolScope || []), String(driftSummary.driftLevel || 'low'), JSON.stringify(driftSummary)],
  );
}

async function deriveTrainingInsight({ windowDays = 14, symbolScope = null } = {}) {
  const activeConfigRow = await getActiveConfig();
  const config = activeConfigRow?.config || {};
  const symbols = normalizeArray(symbolScope && symbolScope.length ? symbolScope : config?.trading?.symbols || []);
  const interval = config?.trading?.primaryTimeframe || config?.backtest?.defaultInterval || '5m';
  const expertWeights = config?.ai?.expertWeights || {};

  const [decisionRows, driftRows] = await Promise.all([
    fetchDecisionWindow({ windowDays, symbolScope: symbols }),
    fetchDriftRows({ symbolScope: symbols, interval, pointsPerSymbol: 80 }),
  ]);

  const qualitySummary = computeQualityMetrics(decisionRows);
  const expertEvaluations = computeExpertEvaluations(decisionRows, expertWeights);
  const suggestedWeights = buildSuggestedWeights(expertEvaluations, expertWeights);
  const driftSummary = computeDriftSummary(driftRows);

  return {
    configVersion: activeConfigRow?.version || 0,
    symbols,
    interval,
    windowDays: Math.max(1, Math.min(Number(windowDays || 14), 180)),
    generatedAt: new Date().toISOString(),
    qualitySummary,
    expertEvaluations,
    suggestedWeights,
    driftSummary,
    stats: {
      decisionsAnalyzed: decisionRows.length,
      driftRowsAnalyzed: driftRows.length,
    },
  };
}

async function runTrainingAssistance({
  label = 'manual-training-assistance',
  objective = 'quality_assistance',
  windowDays = 14,
  symbolScope = null,
  requestedBy = 'dashboard',
  applySuggestedWeights = false,
} = {}) {
  const normalizedScope = normalizeArray(symbolScope);
  const requestedWindow = Math.max(1, Math.min(Number(windowDays || 14), 180));
  const run = await createTrainingRun({
    label,
    objective,
    symbolScope: normalizedScope,
    windowDays: requestedWindow,
    requestedBy,
    applySuggestedWeights,
  });

  try {
    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'info',
      stepKey: 'start',
      message: 'Treinamento assistido iniciado.',
      payload: { label, objective, windowDays: requestedWindow, requestedBy, applySuggestedWeights, symbolScope: normalizedScope },
    });

    const insight = await deriveTrainingInsight({ windowDays: requestedWindow, symbolScope: normalizedScope });
    const activeConfigRow = await getActiveConfig();
    const trainingConfig = activeConfigRow?.config?.training || {};

    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'info',
      stepKey: 'input_window',
      message: 'Janela de avaliação carregada.',
      payload: {
        configVersion: insight.configVersion,
        symbols: insight.symbols,
        interval: insight.interval,
        decisionsAnalyzed: insight.stats.decisionsAnalyzed,
        driftRowsAnalyzed: insight.stats.driftRowsAnalyzed,
      },
    });

    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'info',
      stepKey: 'quality_analysis',
      message: 'Métricas de qualidade calculadas.',
      payload: insight.qualitySummary,
    });

    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'info',
      stepKey: 'expert_analysis',
      message: 'Avaliação dos experts concluída.',
      payload: {
        topExperts: insight.expertEvaluations.slice(0, 5),
        suggestedWeights: insight.suggestedWeights,
      },
    });

    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: insight.driftSummary.driftLevel === 'high' ? 'warning' : 'info',
      stepKey: 'drift_analysis',
      message: 'Drift de mercado analisado.',
      payload: insight.driftSummary,
    });

    let appliedConfigVersion = null;
    if (applySuggestedWeights) {
      const minQualityScoreForApply = toNumber(trainingConfig.minQualityScoreForApply, 0.56);
      const allowHighDriftApply = Boolean(trainingConfig.maxHighDriftForApply);

      await appendTrainingRunLog({
        trainingRunId: run.id,
        level: 'info',
        stepKey: 'apply_validation',
        message: 'Validando aplicação automática dos pesos sugeridos.',
        payload: {
          minQualityScoreForApply,
          allowHighDriftApply,
          qualityScore: insight.qualitySummary.qualityScore,
          driftLevel: insight.driftSummary.driftLevel,
        },
      });

      if (!Boolean(trainingConfig.allowSuggestedWeightsApply ?? true)) {
        throw new Error('training_apply_disabled_in_config');
      }

      if (toNumber(insight.qualitySummary.qualityScore, 0) < minQualityScoreForApply) {
        throw new Error(`training_quality_score_too_low:${insight.qualitySummary.qualityScore}`);
      }

      if (!allowHighDriftApply && String(insight.driftSummary.driftLevel || '').toLowerCase() === 'high') {
        throw new Error('training_apply_blocked_by_high_drift');
      }

      const nextConfig = deepMerge(activeConfigRow?.config || {}, {
        ai: {
          expertWeights: insight.suggestedWeights,
        },
      });

      const updated = await updateActiveConfig(nextConfig, {
        actionType: 'training_weights_applied',
        actor: requestedBy,
        sourceType: 'training_run',
        reason: 'Aplicação assistida de pesos sugeridos pelos experts.',
        metadata: {
          label,
          objective,
          windowDays: insight.windowDays,
          symbols: insight.symbols,
          qualityScore: insight.qualitySummary.qualityScore,
          driftLevel: insight.driftSummary.driftLevel,
        },
      });

      appliedConfigVersion = Number(updated?.version || 0);
      await appendTrainingRunLog({
        trainingRunId: run.id,
        level: 'info',
        stepKey: 'weights_applied',
        message: 'Pesos sugeridos aplicados na configuração ativa.',
        payload: {
          appliedConfigVersion,
          expertWeights: insight.suggestedWeights,
        },
      });
    } else {
      await appendTrainingRunLog({
        trainingRunId: run.id,
        level: 'info',
        stepKey: 'weights_not_applied',
        message: 'Run executado apenas para análise. Nenhuma alteração foi aplicada na configuração.',
        payload: {
          expertWeights: insight.suggestedWeights,
        },
      });
    }

    await persistTrainingArtifacts({
      trainingRunId: run.id,
      symbolScope: insight.symbols,
      windowDays: insight.windowDays,
      qualitySummary: insight.qualitySummary,
      expertEvaluations: insight.expertEvaluations,
      suggestedWeights: insight.suggestedWeights,
      driftSummary: insight.driftSummary,
    });

    const finalizedRun = await finalizeTrainingRunSuccess({
      trainingRunId: run.id,
      qualitySummary: insight.qualitySummary,
      expertEvaluations: insight.expertEvaluations,
      suggestedWeights: insight.suggestedWeights,
      driftSummary: insight.driftSummary,
      appliedConfigVersion,
    });

    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'info',
      stepKey: 'completed',
      message: 'Treinamento assistido concluído com sucesso.',
      payload: {
        trainingRunId: run.id,
        appliedConfigVersion,
        qualityStatus: insight.qualitySummary.qualityStatus,
        driftLevel: insight.driftSummary.driftLevel,
      },
    });

    return {
      ...finalizedRun,
      summary: {
        quality: insight.qualitySummary,
        experts: insight.expertEvaluations,
        drift: insight.driftSummary,
      },
      suggestedConfigOverride: {
        ai: {
          expertWeights: insight.suggestedWeights,
        },
      },
      appliedConfigVersion,
    };
  } catch (error) {
    await appendTrainingRunLog({
      trainingRunId: run.id,
      level: 'error',
      stepKey: 'failed',
      message: 'Treinamento assistido falhou.',
      payload: {
        error: error.message,
      },
    });
    await finalizeTrainingRunFailure({ trainingRunId: run.id, errorMessage: error.message });
    throw error;
  }
}

async function listTrainingRuns({ limit = 10 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        label,
        objective,
        symbol_scope AS "symbolScope",
        window_days AS "windowDays",
        status,
        summary,
        suggested_config_override AS "suggestedConfigOverride",
        requested_by AS "requestedBy",
        apply_suggested_weights AS "applySuggestedWeights",
        applied_config_version AS "appliedConfigVersion",
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        created_at AS "createdAt"
      FROM training_runs
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 10), 100))],
  );

  return result.rows;
}

async function listTrainingRunLogs({ limit = 80, trainingRunId = null } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        training_run_id AS "trainingRunId",
        level,
        step_key AS "stepKey",
        message,
        payload,
        created_at AS "createdAt"
      FROM training_run_logs
      WHERE ($1::bigint IS NULL OR training_run_id = $1)
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [trainingRunId ? Number(trainingRunId) : null, Math.max(1, Math.min(Number(limit || 80), 500))],
  );

  return result.rows;
}

async function listExpertEvaluationReports({ limit = 10 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        training_run_id AS "trainingRunId",
        window_days AS "windowDays",
        summary,
        created_at AS "createdAt"
      FROM expert_evaluation_reports
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 10), 100))],
  );

  return result.rows;
}

async function listModelQualityReports({ limit = 10 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        training_run_id AS "trainingRunId",
        window_days AS "windowDays",
        quality_status AS "qualityStatus",
        summary,
        created_at AS "createdAt"
      FROM model_quality_reports
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 10), 100))],
  );

  return result.rows;
}

async function listModelDriftReports({ limit = 10 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        training_run_id AS "trainingRunId",
        symbol_scope AS "symbolScope",
        drift_level AS "driftLevel",
        summary,
        created_at AS "createdAt"
      FROM model_drift_reports
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 10), 100))],
  );

  return result.rows;
}

async function getTrainingSummary() {
  const [liveInsight, recentRuns, qualityReports, driftReports, expertReports, recentLogs] = await Promise.all([
    deriveTrainingInsight({}),
    listTrainingRuns({ limit: 5 }),
    listModelQualityReports({ limit: 5 }),
    listModelDriftReports({ limit: 5 }),
    listExpertEvaluationReports({ limit: 5 }),
    listTrainingRunLogs({ limit: 25 }),
  ]);

  return {
    summary: liveInsight,
    latestRun: recentRuns[0] || null,
    latestQualityReport: qualityReports[0] || null,
    latestDriftReport: driftReports[0] || null,
    latestExpertReport: expertReports[0] || null,
    recentRuns,
    recentQualityReports: qualityReports,
    recentDriftReports: driftReports,
    recentExpertEvaluations: expertReports,
    recentLogs,
  };
}

module.exports = {
  deriveTrainingInsight,
  runTrainingAssistance,
  listTrainingRuns,
  listTrainingRunLogs,
  listExpertEvaluationReports,
  listModelQualityReports,
  listModelDriftReports,
  getTrainingSummary,
};
