const pool = require('./pool');

const DEFAULT_BOT_CONFIG = {
  trading: {
    enabled: false,
    mode: 'paper',
    baseCurrency: 'USDT',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    timeframe: '5m',
    maxOpenPositions: 5,
  },
  risk: {
    maxRiskPerTradePct: 1,
    maxPortfolioExposurePct: 35,
    stopLossAtr: 1.8,
    takeProfitAtr: 2.6,
    allowAveragingDown: false,
  },
  ai: {
    loopIntervalSec: 15,
    minConfidenceToBuy: 0.62,
    minConfidenceToSell: 0.55,
    useSocialBlockOnly: true,
    socialExtremeRiskThreshold: 85,
  },
  social: {
    enabled: true,
    sources: ['coingecko', 'reddit'],
    blockOnlyOnExtremeRisk: true,
  },
  frontend: {
    refreshIntervalSec: 5,
  },
};

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_configs (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_name TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_decisions (
      id BIGSERIAL PRIMARY KEY,
      worker_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence NUMERIC(10, 6) NOT NULL DEFAULT 0,
      blocked BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO bot_configs (config_key, version, config)
    VALUES ('active', 1, $1::jsonb)
    ON CONFLICT (config_key) DO NOTHING;
  `, [JSON.stringify(DEFAULT_BOT_CONFIG)]);
}

module.exports = {
  DEFAULT_BOT_CONFIG,
  initializeDatabase,
};
