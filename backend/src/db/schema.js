const pool = require('./pool');

const DEFAULT_BOT_CONFIG = {
  trading: {
    enabled: false,
    mode: 'paper',
    baseCurrency: 'USDT',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    primaryTimeframe: '5m',
    confirmationTimeframes: ['15m', '1h'],
    lookbackCandles: 240,
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
    minDataPoints: 120,
    minConfidenceToBuy: 0.64,
    minConfidenceToSell: 0.60,
    decisionMargin: 0.05,
    expertWeights: {
      trend: 0.28,
      momentum: 0.24,
      volatility: 0.14,
      liquidity: 0.16,
      regime: 0.18,
    },
    useSocialBlockOnly: true,
    socialExtremeRiskThreshold: 85,
  },
  social: {
    enabled: true,
    sources: ['coingecko', 'reddit'],
    blockOnlyOnExtremeRisk: true,
  },
  market: {
    source: 'binance_spot',
    symbolsQuoteAsset: 'USDT',
    defaultCandleLimit: 300,
    candleCacheTtlSec: 20,
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
    CREATE TABLE IF NOT EXISTS market_symbols (
      symbol TEXT PRIMARY KEY,
      base_asset TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      status TEXT NOT NULL,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_candles (
      source TEXT NOT NULL,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      open_time BIGINT NOT NULL,
      close_time BIGINT NOT NULL,
      open NUMERIC(28, 12) NOT NULL,
      high NUMERIC(28, 12) NOT NULL,
      low NUMERIC(28, 12) NOT NULL,
      close NUMERIC(28, 12) NOT NULL,
      volume NUMERIC(28, 12) NOT NULL,
      quote_volume NUMERIC(28, 12) NOT NULL DEFAULT 0,
      trades INTEGER NOT NULL DEFAULT 0,
      taker_buy_base_volume NUMERIC(28, 12) NOT NULL DEFAULT 0,
      taker_buy_quote_volume NUMERIC(28, 12) NOT NULL DEFAULT 0,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source, symbol, interval, open_time)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_interval_time
    ON market_candles (symbol, interval, open_time DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_tickers (
      source TEXT NOT NULL,
      symbol TEXT PRIMARY KEY,
      price NUMERIC(28, 12) NOT NULL DEFAULT 0,
      price_change_percent NUMERIC(18, 8) NOT NULL DEFAULT 0,
      volume NUMERIC(28, 12) NOT NULL DEFAULT 0,
      quote_volume NUMERIC(28, 12) NOT NULL DEFAULT 0,
      trade_count BIGINT NOT NULL DEFAULT 0,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at
    ON ai_decisions (created_at DESC);
  `);

  await pool.query(
    `
      INSERT INTO bot_configs (config_key, version, config)
      VALUES ('active', 1, $1::jsonb)
      ON CONFLICT (config_key) DO NOTHING;
    `,
    [JSON.stringify(DEFAULT_BOT_CONFIG)],
  );
}

module.exports = {
  DEFAULT_BOT_CONFIG,
  initializeDatabase,
};
