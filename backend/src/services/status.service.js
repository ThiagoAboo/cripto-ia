const pool = require('../db/pool');
const { getActiveConfig, getConfigHistory } = require('./config.service');
const { getPaperSummary, listPaperOrders } = require('./portfolio.service');
const { getSocialSummary, getSocialScores, listSocialAlerts } = require('./social.service');
const { getExecutionStatus } = require('./executionAdapter.service');
const { getRuntimeControl, listCooldowns, getRiskGuardrailSummary } = require('./control.service');
const { listBacktestRuns } = require('./backtest.service');
const { listOptimizationRuns } = require('./optimizer.service');

async function getSystemStatus() {
  const [
    configRow,
    configHistory,
    workers,
    recentEvents,
    recentDecisions,
    marketSummary,
    portfolio,
    recentOrders,
    socialSummary,
    topSocialScores,
    recentSocialAlerts,
    execution,
    control,
    cooldowns,
    guardrails,
    recentBacktests,
    recentOptimizations,
  ] = await Promise.all([
    getActiveConfig(),
    getConfigHistory({ limit: 5 }),
    pool.query(
      `
        SELECT worker_name, status, last_seen_at, payload
        FROM worker_heartbeats
        ORDER BY worker_name ASC
      `,
    ),
    pool.query(
      `
        SELECT id, event_type, source, payload, created_at
        FROM system_events
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ),
    pool.query(
      `
        SELECT id, worker_name, symbol, action, confidence, blocked, reason, payload, created_at
        FROM ai_decisions
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ),
    pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM market_symbols) AS symbols_count,
          (SELECT COUNT(*) FROM market_tickers) AS tickers_count,
          (SELECT COUNT(*) FROM market_candles) AS candles_count,
          (SELECT MAX(updated_at) FROM market_tickers) AS last_ticker_update,
          (SELECT MAX(updated_at) FROM market_candles) AS last_candle_update
      `,
    ),
    getPaperSummary(),
    listPaperOrders({ limit: 20 }),
    getSocialSummary(),
    getSocialScores({ limit: 12 }),
    listSocialAlerts({ limit: 20 }),
    getExecutionStatus(),
    getRuntimeControl(),
    listCooldowns({ activeOnly: true, limit: 20 }),
    getRiskGuardrailSummary(),
    listBacktestRuns({ limit: 5 }),
    listOptimizationRuns({ limit: 5 }),
  ]);

  return {
    configVersion: configRow?.version ?? 0,
    configHistory,
    control: {
      ...control,
      activeCooldowns: cooldowns,
      guardrails,
    },
    workers: workers.rows,
    recentEvents: recentEvents.rows,
    recentDecisions: recentDecisions.rows.map((row) => ({
      ...row,
      confidence: Number(row.confidence),
    })),
    recentOrders,
    portfolio,
    execution,
    market: {
      symbolsCount: Number(marketSummary.rows[0]?.symbols_count || 0),
      tickersCount: Number(marketSummary.rows[0]?.tickers_count || 0),
      candlesCount: Number(marketSummary.rows[0]?.candles_count || 0),
      lastTickerUpdate: marketSummary.rows[0]?.last_ticker_update || null,
      lastCandleUpdate: marketSummary.rows[0]?.last_candle_update || null,
    },
    social: {
      ...socialSummary,
      topScores: topSocialScores,
      recentAlerts: recentSocialAlerts,
    },
    recentBacktests,
    recentOptimizations,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getSystemStatus,
};
