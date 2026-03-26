const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { getCandles } = require('./market.service');
const { runBacktestFromCandles, deepMerge } = require('./backtest.service');

const DEFAULT_VALIDATION_SETTINGS = {
  objective: 'balanced',
  maxWindows: 4,
  minTrainCandles: 180,
  minTestCandles: 80,
  stepCandles: 80,
  robustnessLimits: [240, 360, 480],
};

function roundTo(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function stddev(values = []) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (Number(value || 0) - avg) ** 2));
  return Math.sqrt(variance);
}

function clampInt(value, min, max) {
  const parsed = Math.trunc(Number(value || 0));
  return Math.max(min, Math.min(max, parsed));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function buildWalkForwardWindows({ totalCandles, minTrainCandles, minTestCandles, stepCandles, maxWindows }) {
  const total = Math.trunc(Number(totalCandles || 0));
  const train = Math.max(120, Math.trunc(Number(minTrainCandles || DEFAULT_VALIDATION_SETTINGS.minTrainCandles)));
  const test = Math.max(40, Math.trunc(Number(minTestCandles || DEFAULT_VALIDATION_SETTINGS.minTestCandles)));
  const step = Math.max(20, Math.trunc(Number(stepCandles || DEFAULT_VALIDATION_SETTINGS.stepCandles)));
  const max = Math.max(1, Math.trunc(Number(maxWindows || DEFAULT_VALIDATION_SETTINGS.maxWindows)));

  if (total < train + test + 2) {
    return [];
  }

  const windows = [];
  for (let trainStart = 0; trainStart + train + test <= total && windows.length < max; trainStart += step) {
    const trainEnd = trainStart + train;
    const testEnd = trainEnd + test;
    windows.push({
      key: `wf_${windows.length + 1}`,
      index: windows.length,
      trainStart,
      trainEnd,
      testStart: trainEnd,
      testEnd,
      trainCandles: train,
      testCandles: test,
      totalCandles: train + test,
    });
  }

  if (!windows.length) {
    windows.push({
      key: 'wf_1',
      index: 0,
      trainStart: 0,
      trainEnd: total - test,
      testStart: total - test,
      testEnd: total,
      trainCandles: total - test,
      testCandles: test,
      totalCandles: total,
    });
  }

  return windows;
}

function selectConfirmationCandles(confirmationCandles = [], startTime, endTime) {
  return confirmationCandles.filter((item) => {
    const openTime = Number(item.openTime || 0);
    return openTime >= startTime && openTime <= endTime;
  });
}

function computeStabilityScore(segments = []) {
  if (!segments.length) return 0;
  const returns = segments.map((item) => Number(item.metrics?.totalReturnPct || 0));
  const drawdowns = segments.map((item) => Math.abs(Number(item.metrics?.maxDrawdownPct || 0)));
  const scores = segments.map((item) => Number(item.metrics?.performanceScore || 0));
  const profitableRatio = segments.filter((item) => Number(item.metrics?.totalReturnPct || 0) > 0).length / segments.length;

  const dispersionPenalty = (stddev(returns) * 1.8) + (stddev(drawdowns) * 1.2) + (stddev(scores) * 4.5);
  const base = 72 + (profitableRatio * 18);

  return roundTo(Math.max(0, Math.min(100, base - dispersionPenalty)), 2);
}

function summarizeValidationSegments(segments = [], { mode = 'walk_forward', objective = 'balanced' } = {}) {
  const returns = segments.map((item) => Number(item.metrics?.totalReturnPct || 0));
  const drawdowns = segments.map((item) => Number(item.metrics?.maxDrawdownPct || 0));
  const scores = segments.map((item) => Number(item.metrics?.performanceScore || 0));
  const regimesCovered = unique(segments.map((item) => item.regimeLabel || item.metrics?.regimeLabel));
  const symbolsCovered = unique(segments.map((item) => item.symbol));
  const profitableWindows = segments.filter((item) => Number(item.metrics?.totalReturnPct || 0) > 0).length;
  const strongWindows = segments.filter((item) => Number(item.metrics?.performanceScore || 0) >= 0.6).length;
  const stabilityScore = computeStabilityScore(segments);

  return {
    mode,
    objective,
    segmentsCount: segments.length,
    symbolsCovered,
    regimesCovered,
    profitableWindows,
    strongWindows,
    positiveRatioPct: roundTo(segments.length ? (profitableWindows / segments.length) * 100 : 0, 2),
    strongRatioPct: roundTo(segments.length ? (strongWindows / segments.length) * 100 : 0, 2),
    avgReturnPct: roundTo(average(returns), 4),
    medianLikeReturnPct: roundTo(returns.slice().sort((a, b) => a - b)[Math.floor(returns.length / 2)] || 0, 4),
    worstReturnPct: roundTo(Math.min(...returns, 0), 4),
    avgDrawdownPct: roundTo(average(drawdowns), 4),
    worstDrawdownPct: roundTo(Math.max(...drawdowns, 0), 4),
    avgPerformanceScore: roundTo(average(scores), 4),
    minPerformanceScore: roundTo(Math.min(...scores, 0), 4),
    maxPerformanceScore: roundTo(Math.max(...scores, 0), 4),
    returnStdDev: roundTo(stddev(returns), 4),
    drawdownStdDev: roundTo(stddev(drawdowns), 4),
    scoreStdDev: roundTo(stddev(scores), 4),
    stabilityScore,
    recommendation: stabilityScore >= 72 && profitableWindows >= Math.ceil(Math.max(segments.length, 1) * 0.6)
      ? 'candidate_for_promotion'
      : stabilityScore >= 58
        ? 'needs_review'
        : 'reject_for_now',
  };
}

async function persistValidationRun(client, payload) {
  const summary = payload.summary || {};
  const insertRun = await client.query(
    `
      INSERT INTO backtest_validation_runs (
        label,
        mode,
        symbol,
        interval,
        confirmation_interval,
        objective,
        candle_limit,
        status,
        summary,
        payload,
        stability_score
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
      RETURNING id
    `,
    [
      payload.label,
      payload.mode,
      payload.symbol,
      payload.interval,
      payload.confirmationInterval,
      payload.objective,
      payload.candleLimit,
      payload.status || 'completed',
      JSON.stringify(summary),
      JSON.stringify(payload.payload || {}),
      Number(summary.stabilityScore || 0),
    ],
  );

  const validationRunId = insertRun.rows[0]?.id;

  for (const segment of payload.segments || []) {
    await client.query(
      `
        INSERT INTO backtest_validation_segments (
          validation_run_id,
          segment_key,
          segment_index,
          role,
          symbol,
          regime_label,
          candle_limit,
          metrics,
          payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
      `,
      [
        validationRunId,
        segment.segmentKey,
        segment.segmentIndex,
        segment.role,
        segment.symbol,
        segment.regimeLabel || 'mixed',
        segment.candleLimit,
        JSON.stringify(segment.metrics || {}),
        JSON.stringify(segment.payload || {}),
      ],
    );
  }

  return validationRunId;
}

async function runWalkForwardValidation({
  label,
  symbol,
  interval,
  confirmationInterval,
  candleLimit,
  objective = DEFAULT_VALIDATION_SETTINGS.objective,
  minTrainCandles = DEFAULT_VALIDATION_SETTINGS.minTrainCandles,
  minTestCandles = DEFAULT_VALIDATION_SETTINGS.minTestCandles,
  stepCandles = DEFAULT_VALIDATION_SETTINGS.stepCandles,
  maxWindows = DEFAULT_VALIDATION_SETTINGS.maxWindows,
  configOverride = null,
  persist = true,
}) {
  const activeConfigRow = await getActiveConfig();
  const activeConfig = activeConfigRow?.config || {};
  const finalConfig = configOverride ? deepMerge(activeConfig, configOverride) : activeConfig;
  const finalSymbol = String(symbol || finalConfig?.trading?.symbols?.[0] || '').toUpperCase();
  const finalInterval = interval || finalConfig?.trading?.primaryTimeframe || '5m';
  const finalConfirmationInterval = confirmationInterval || finalConfig?.trading?.confirmationTimeframes?.[0] || '15m';
  const finalLimit = clampInt(candleLimit || finalConfig?.trading?.lookbackCandles || 600, 320, 3000);

  if (!finalSymbol) {
    throw new Error('validation_symbol_required');
  }

  const [primaryPayload, confirmationPayload] = await Promise.all([
    getCandles({ symbol: finalSymbol, interval: finalInterval, limit: finalLimit, refresh: false }),
    getCandles({ symbol: finalSymbol, interval: finalConfirmationInterval, limit: finalLimit, refresh: false }),
  ]);

  const primaryCandles = primaryPayload?.candles || [];
  const confirmationCandles = confirmationPayload?.candles || [];
  const windows = buildWalkForwardWindows({
    totalCandles: primaryCandles.length,
    minTrainCandles,
    minTestCandles,
    stepCandles,
    maxWindows,
  });

  if (!windows.length) {
    throw new Error('not_enough_candles_for_walk_forward_validation');
  }

  const segments = [];
  for (const window of windows) {
    const primarySlice = primaryCandles.slice(window.trainStart, window.testEnd);
    const startTime = Number(primarySlice[0]?.openTime || 0);
    const endTime = Number(primarySlice[primarySlice.length - 1]?.openTime || 0);
    const confirmationSlice = selectConfirmationCandles(confirmationCandles, startTime, endTime);

    const result = await runBacktestFromCandles({
      label: `${label || 'wf'}:${window.key}`,
      symbol: finalSymbol,
      interval: finalInterval,
      confirmationInterval: finalConfirmationInterval,
      primaryCandles: primarySlice,
      confirmationCandles: confirmationSlice,
      config: finalConfig,
      persist: false,
      evaluationStartIndex: window.trainCandles,
      meta: {
        objective,
        validationKind: 'walk_forward',
        window,
      },
    });

    segments.push({
      segmentKey: window.key,
      segmentIndex: window.index,
      role: 'walk_forward_window',
      symbol: finalSymbol,
      regimeLabel: result.metrics?.regimeLabel || result.regimeLabel,
      candleLimit: primarySlice.length,
      metrics: result.metrics,
      payload: {
        window,
        runLabel: result.label,
      },
    });
  }

  const summary = summarizeValidationSegments(segments, { mode: 'walk_forward', objective });
  const response = {
    label: label || `Walk-forward ${finalSymbol} ${finalInterval}`,
    mode: 'walk_forward',
    symbol: finalSymbol,
    interval: finalInterval,
    confirmationInterval: finalConfirmationInterval,
    objective,
    candleLimit: finalLimit,
    status: 'completed',
    summary,
    segments,
    payload: {
      generatedAt: new Date().toISOString(),
      settings: { minTrainCandles, minTestCandles, stepCandles, maxWindows },
    },
  };

  if (!persist) {
    return response;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await persistValidationRun(client, response);
    await client.query('COMMIT');
    return { id, ...response };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runRobustnessSweep({
  label,
  symbols = [],
  interval,
  confirmationInterval,
  candleLimits = DEFAULT_VALIDATION_SETTINGS.robustnessLimits,
  objective = DEFAULT_VALIDATION_SETTINGS.objective,
  configOverride = null,
  persist = true,
}) {
  const activeConfigRow = await getActiveConfig();
  const activeConfig = activeConfigRow?.config || {};
  const finalConfig = configOverride ? deepMerge(activeConfig, configOverride) : activeConfig;
  const finalSymbols = unique((symbols.length ? symbols : finalConfig?.trading?.symbols || []).map((item) => String(item || '').toUpperCase()));
  const finalInterval = interval || finalConfig?.trading?.primaryTimeframe || '5m';
  const finalConfirmationInterval = confirmationInterval || finalConfig?.trading?.confirmationTimeframes?.[0] || '15m';
  const finalLimits = unique((candleLimits || []).map((item) => clampInt(item, 160, 1200)));

  if (!finalSymbols.length) {
    throw new Error('robustness_symbols_required');
  }

  const segments = [];
  for (const symbolItem of finalSymbols) {
    for (const limitItem of finalLimits) {
      const result = await require('./backtest.service').runBacktest({
        label: `${label || 'robust'}:${symbolItem}:${limitItem}`,
        symbol: symbolItem,
        interval: finalInterval,
        confirmationInterval: finalConfirmationInterval,
        limit: limitItem,
        configOverride: finalConfig,
        persist: false,
        meta: {
          objective,
          validationKind: 'robustness',
          candleLimit: limitItem,
        },
      });

      segments.push({
        segmentKey: `${symbolItem}_${limitItem}`,
        segmentIndex: segments.length,
        role: 'robustness_case',
        symbol: symbolItem,
        regimeLabel: result.metrics?.regimeLabel || result.regimeLabel,
        candleLimit: limitItem,
        metrics: result.metrics,
        payload: {
          runLabel: result.label,
        },
      });
    }
  }

  const summary = summarizeValidationSegments(segments, { mode: 'robustness', objective });
  const response = {
    label: label || `Robustness ${finalSymbols.join(',')}`,
    mode: 'robustness',
    symbol: finalSymbols[0],
    interval: finalInterval,
    confirmationInterval: finalConfirmationInterval,
    objective,
    candleLimit: Math.max(...finalLimits, 0),
    status: 'completed',
    summary,
    segments,
    payload: {
      generatedAt: new Date().toISOString(),
      settings: { symbols: finalSymbols, candleLimits: finalLimits },
    },
  };

  if (!persist) {
    return response;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await persistValidationRun(client, response);
    await client.query('COMMIT');
    return { id, ...response };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listValidationRuns({ limit = 20 } = {}) {
  const safeLimit = clampInt(limit, 1, 100);
  const result = await pool.query(
    `
      SELECT
        id,
        label,
        mode,
        symbol,
        interval,
        confirmation_interval AS "confirmationInterval",
        objective,
        candle_limit AS "candleLimit",
        status,
        summary,
        stability_score AS "stabilityScore",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM backtest_validation_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows.map((row) => ({ ...row, stabilityScore: Number(row.stabilityScore || 0) }));
}

async function getValidationRunById(id) {
  const runResult = await pool.query(
    `
      SELECT
        id,
        label,
        mode,
        symbol,
        interval,
        confirmation_interval AS "confirmationInterval",
        objective,
        candle_limit AS "candleLimit",
        status,
        summary,
        payload,
        stability_score AS "stabilityScore",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM backtest_validation_runs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  const run = runResult.rows[0] || null;
  if (!run) return null;

  const segmentsResult = await pool.query(
    `
      SELECT
        id,
        segment_key AS "segmentKey",
        segment_index AS "segmentIndex",
        role,
        symbol,
        regime_label AS "regimeLabel",
        candle_limit AS "candleLimit",
        metrics,
        payload,
        created_at AS "createdAt"
      FROM backtest_validation_segments
      WHERE validation_run_id = $1
      ORDER BY segment_index ASC, id ASC
    `,
    [id],
  );

  return {
    ...run,
    stabilityScore: Number(run.stabilityScore || 0),
    segments: segmentsResult.rows,
  };
}

module.exports = {
  DEFAULT_VALIDATION_SETTINGS,
  buildWalkForwardWindows,
  summarizeValidationSegments,
  computeStabilityScore,
  runWalkForwardValidation,
  runRobustnessSweep,
  listValidationRuns,
  getValidationRunById,
};
