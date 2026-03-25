
const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { runBacktest, deepMerge, computePerformanceScore } = require('./backtest.service');

function roundTo(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

function buildWeightVariants(baseWeights = {}) {
  const defaults = {
    trend: Number(baseWeights.trend || 0.21),
    momentum: Number(baseWeights.momentum || 0.19),
    volatility: Number(baseWeights.volatility || 0.12),
    liquidity: Number(baseWeights.liquidity || 0.12),
    regime: Number(baseWeights.regime || 0.15),
    pattern: Number(baseWeights.pattern || 0.11),
    risk: Number(baseWeights.risk || 0.10),
  };

  return [
    defaults,
    { ...defaults, trend: roundTo(defaults.trend + 0.05), regime: roundTo(defaults.regime + 0.03), momentum: roundTo(Math.max(0.05, defaults.momentum - 0.04)) },
    { ...defaults, momentum: roundTo(defaults.momentum + 0.06), pattern: roundTo(defaults.pattern + 0.03), trend: roundTo(Math.max(0.05, defaults.trend - 0.04)) },
    { ...defaults, volatility: roundTo(defaults.volatility + 0.05), risk: roundTo(defaults.risk + 0.04), momentum: roundTo(Math.max(0.05, defaults.momentum - 0.03)) },
  ].map((weights) => {
    const total = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
    return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, roundTo(Number(value || 0) / total, 4)]));
  });
}

function buildCandidateOverrides(activeConfig, maxCandidates = 8) {
  const baseBuy = Number(activeConfig?.ai?.minConfidenceToBuy || 0.64);
  const baseSell = Number(activeConfig?.ai?.minConfidenceToSell || 0.60);
  const baseMargin = Number(activeConfig?.ai?.decisionMargin || 0.05);
  const baseOrderSize = Number(activeConfig?.execution?.paper?.orderSizePct || 10);
  const baseStop = Number(activeConfig?.risk?.stopLossAtr || 1.8);
  const baseTake = Number(activeConfig?.risk?.takeProfitAtr || 2.6);
  const baseTrail = Number(activeConfig?.risk?.trailingStopAtr || 1.2);
  const weightsVariants = buildWeightVariants(activeConfig?.ai?.expertWeights || {});

  const templates = [
    {
      name: 'balanced_base',
      objectiveHint: 'balanced',
      override: {},
    },
    {
      name: 'trend_conviction',
      objectiveHint: 'balanced',
      override: {
        ai: {
          minConfidenceToBuy: roundTo(baseBuy + 0.03, 4),
          decisionMargin: roundTo(baseMargin + 0.02, 4),
          expertWeights: weightsVariants[1],
        },
        risk: {
          takeProfitAtr: roundTo(baseTake + 0.4, 4),
          trailingStopAtr: roundTo(Math.max(0.6, baseTrail + 0.2), 4),
        },
      },
    },
    {
      name: 'momentum_fast',
      objectiveHint: 'return',
      override: {
        ai: {
          minConfidenceToBuy: roundTo(baseBuy - 0.03, 4),
          minConfidenceToSell: roundTo(baseSell - 0.02, 4),
          decisionMargin: roundTo(Math.max(0.01, baseMargin - 0.01), 4),
          expertWeights: weightsVariants[2],
        },
        execution: {
          paper: {
            orderSizePct: roundTo(baseOrderSize * 1.15, 4),
          },
        },
      },
    },
    {
      name: 'defensive_risk',
      objectiveHint: 'defensive',
      override: {
        ai: {
          minConfidenceToBuy: roundTo(baseBuy + 0.04, 4),
          minConfidenceToSell: roundTo(baseSell + 0.02, 4),
          decisionMargin: roundTo(baseMargin + 0.02, 4),
          expertWeights: weightsVariants[3],
        },
        risk: {
          stopLossAtr: roundTo(Math.max(1.0, baseStop - 0.2), 4),
          takeProfitAtr: roundTo(Math.max(1.6, baseTake - 0.3), 4),
          trailingStopAtr: roundTo(Math.max(0.8, baseTrail - 0.1), 4),
        },
        execution: {
          paper: {
            orderSizePct: roundTo(Math.max(4, baseOrderSize * 0.75), 4),
          },
        },
      },
    },
    {
      name: 'wider_targets',
      objectiveHint: 'return',
      override: {
        risk: {
          stopLossAtr: roundTo(baseStop + 0.2, 4),
          takeProfitAtr: roundTo(baseTake + 0.7, 4),
          trailingStopAtr: roundTo(baseTrail + 0.2, 4),
        },
      },
    },
    {
      name: 'tight_protection',
      objectiveHint: 'risk_adjusted',
      override: {
        risk: {
          stopLossAtr: roundTo(Math.max(0.8, baseStop - 0.5), 4),
          takeProfitAtr: roundTo(Math.max(1.2, baseTake - 0.6), 4),
          trailingStopAtr: roundTo(Math.max(0.6, baseTrail - 0.2), 4),
        },
        ai: {
          minConfidenceToBuy: roundTo(baseBuy + 0.02, 4),
          expertWeights: weightsVariants[0],
        },
      },
    },
    {
      name: 'size_up_selective',
      objectiveHint: 'balanced',
      override: {
        execution: {
          paper: {
            orderSizePct: roundTo(Math.min(25, baseOrderSize * 1.3), 4),
          },
        },
        ai: {
          minConfidenceToBuy: roundTo(baseBuy + 0.02, 4),
        },
      },
    },
    {
      name: 'size_down_high_quality',
      objectiveHint: 'risk_adjusted',
      override: {
        execution: {
          paper: {
            orderSizePct: roundTo(Math.max(3, baseOrderSize * 0.65), 4),
          },
        },
        ai: {
          minConfidenceToBuy: roundTo(baseBuy + 0.05, 4),
          minConfidenceToSell: roundTo(baseSell + 0.03, 4),
          decisionMargin: roundTo(baseMargin + 0.02, 4),
        },
      },
    },
  ];

  return templates.slice(0, Math.max(1, Math.min(Number(maxCandidates) || 8, templates.length)));
}

function buildRunSummary({ results, objective }) {
  const sorted = [...results].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const bySymbol = {};
  const byRegime = {};

  sorted.forEach((item, index) => {
    const symbolBucket = bySymbol[item.symbol] || [];
    symbolBucket.push({ rank: index + 1, ...item });
    bySymbol[item.symbol] = symbolBucket;

    const regimeBucket = byRegime[item.regimeLabel] || [];
    regimeBucket.push({ rank: index + 1, ...item });
    byRegime[item.regimeLabel] = regimeBucket;
  });

  Object.keys(bySymbol).forEach((key) => {
    bySymbol[key] = bySymbol[key].slice(0, 5);
  });
  Object.keys(byRegime).forEach((key) => {
    byRegime[key] = byRegime[key].slice(0, 5);
  });

  return {
    objective,
    totalCandidates: results.length,
    bestOverall: sorted[0] || null,
    bestBySymbol: bySymbol,
    bestByRegime: byRegime,
    averageScore: roundTo(sorted.length ? sorted.reduce((sum, item) => sum + Number(item.score || 0), 0) / sorted.length : 0, 4),
  };
}

async function persistOptimizationRun({ label, objective, scope, summary, payload, rankedResults }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const header = await client.query(
      `
        INSERT INTO optimization_runs (label, objective, status, scope, summary, payload, created_at, updated_at)
        VALUES ($1, $2, 'completed', $3::jsonb, $4::jsonb, $5::jsonb, NOW(), NOW())
        RETURNING id
      `,
      [label, objective, JSON.stringify(scope || {}), JSON.stringify(summary || {}), JSON.stringify(payload || {})],
    );
    const runId = header.rows[0].id;

    for (const item of rankedResults) {
      await client.query(
        `
          INSERT INTO optimization_results (
            optimization_run_id,
            rank,
            symbol,
            regime_label,
            objective,
            score,
            metrics,
            config_override,
            backtest_run_id,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, NOW())
        `,
        [
          runId,
          item.rank,
          item.symbol,
          item.regimeLabel,
          objective,
          Number(item.score || 0),
          JSON.stringify(item.metrics || {}),
          JSON.stringify(item.configOverride || {}),
          item.backtestRunId || null,
        ],
      );
    }

    await client.query('COMMIT');
    return runId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runOptimization({ label, symbols = [], interval, confirmationInterval, limit, objective = 'balanced', maxCandidates = 8, candidateOverrides = null, persist = true }) {
  const configRow = await getActiveConfig();
  const activeConfig = configRow?.config || {};
  const targetSymbols = (symbols.length ? symbols : (activeConfig?.optimizer?.symbols?.length ? activeConfig.optimizer.symbols : activeConfig?.trading?.symbols || []))
    .map((item) => String(item || '').toUpperCase())
    .filter(Boolean);

  if (!targetSymbols.length) {
    throw new Error('optimizer_symbols_required');
  }

  const finalInterval = interval || activeConfig?.backtest?.defaultInterval || activeConfig?.trading?.primaryTimeframe || '5m';
  const finalConfirmationInterval = confirmationInterval || activeConfig?.backtest?.defaultConfirmationInterval || activeConfig?.trading?.confirmationTimeframes?.[0] || '15m';
  const finalLimit = Math.min(Math.max(Number(limit || activeConfig?.backtest?.defaultLimit || 400), 150), 1000);
  const candidates = Array.isArray(candidateOverrides) && candidateOverrides.length ? candidateOverrides : buildCandidateOverrides(activeConfig, maxCandidates);

  const rawResults = [];
  for (const symbol of targetSymbols) {
    for (const candidate of candidates) {
      const mergedConfig = deepMerge(activeConfig, candidate.override || {});
      const result = await runBacktest({
        label: `${candidate.name}:${symbol}`,
        symbol,
        interval: finalInterval,
        confirmationInterval: finalConfirmationInterval,
        limit: finalLimit,
        configOverride: mergedConfig,
        persist: true,
        meta: {
          optimizationCandidate: candidate.name,
          optimizationObjective: objective,
          objectiveHint: candidate.objectiveHint || objective,
        },
      });

      const score = computePerformanceScore(result.metrics, objective);
      rawResults.push({
        candidateName: candidate.name,
        objectiveHint: candidate.objectiveHint || objective,
        symbol,
        regimeLabel: result.metrics.regimeLabel || 'mixed',
        score,
        metrics: { ...result.metrics, performanceScore: score },
        configOverride: candidate.override || {},
        backtestRunId: result.id,
      });
    }
  }

  rawResults.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const rankedResults = rawResults.map((item, index) => ({ rank: index + 1, ...item }));
  const summary = buildRunSummary({ results: rankedResults, objective });

  let runId = null;
  if (persist) {
    runId = await persistOptimizationRun({
      label: label || `Optimization ${targetSymbols.join(',')}`,
      objective,
      scope: { symbols: targetSymbols, interval: finalInterval, confirmationInterval: finalConfirmationInterval, candleLimit: finalLimit, candidates: candidates.map((item) => item.name) },
      summary,
      payload: { generatedAt: new Date().toISOString() },
      rankedResults,
    });
  }

  return {
    id: runId,
    label: label || `Optimization ${targetSymbols.join(',')}`,
    objective,
    symbols: targetSymbols,
    interval: finalInterval,
    confirmationInterval: finalConfirmationInterval,
    candleLimit: finalLimit,
    summary,
    items: rankedResults,
  };
}

async function listOptimizationRuns({ limit = 10 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const result = await pool.query(
    `
      SELECT
        id,
        label,
        objective,
        status,
        scope,
        summary,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM optimization_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

async function getOptimizationRunById(id) {
  const header = await pool.query(
    `
      SELECT
        id,
        label,
        objective,
        status,
        scope,
        summary,
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM optimization_runs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (!header.rows[0]) return null;

  const results = await pool.query(
    `
      SELECT
        id,
        rank,
        symbol,
        regime_label AS "regimeLabel",
        objective,
        score,
        metrics,
        config_override AS "configOverride",
        backtest_run_id AS "backtestRunId",
        created_at AS "createdAt"
      FROM optimization_results
      WHERE optimization_run_id = $1
      ORDER BY rank ASC, id ASC
    `,
    [id],
  );

  return {
    ...header.rows[0],
    items: results.rows.map((row) => ({ ...row, score: Number(row.score || 0) })),
  };
}

module.exports = {
  buildCandidateOverrides,
  runOptimization,
  listOptimizationRuns,
  getOptimizationRunById,
};
