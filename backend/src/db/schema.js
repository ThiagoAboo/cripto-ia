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
    maxSymbolExposurePct: 12,
    stopLossAtr: 1.8,
    takeProfitAtr: 2.6,
    trailingStopAtr: 1.2,
    enableTrailingStop: true,
    allowAveragingDown: false,
    cooldownMinutesAfterLoss: 45,
    cooldownMinutesAfterStopLoss: 90,
    maxConsecutiveLosses: 3,
    dailyMaxLossPct: 3,
    autoPauseOnCircuitBreaker: true,
  },
  execution: {
    paper: {
      initialCapital: 10000,
      orderSizePct: 10,
      minOrderNotional: 50,
      feePct: 0.1,
      slippagePct: 0.05,
      allowMultipleEntriesPerSymbol: false,
      sellFractionOnSignal: 1,
    },
    live: {
      enabled: false,
      provider: 'binance_spot',
      useTestnet: true,
      dryRun: true,
      requireBackendLiveFlag: true,
      recvWindow: 5000,
    },
  },
  ai: {
    loopIntervalSec: 15,
    minDataPoints: 120,
    minConfidenceToBuy: 0.64,
    minConfidenceToSell: 0.60,
    decisionMargin: 0.05,
    respectRuntimePause: true,
    respectSymbolCooldowns: true,
    expertWeights: {
      trend: 0.21,
      momentum: 0.19,
      volatility: 0.12,
      liquidity: 0.12,
      regime: 0.15,
      pattern: 0.11,
      risk: 0.10,
    },
    useSocialBlockOnly: true,
    socialExtremeRiskThreshold: 85,
  },
  social: {
    enabled: true,
    blockOnlyOnExtremeRisk: true,
    extremeRiskThreshold: 85,
    strongScoreThreshold: 72,
    promisingScoreThreshold: 58,
    refreshIntervalSec: 600,
    sources: ['coingecko'],
    reddit: {
      enabled: false,
      subreddits: ['CryptoCurrency', 'CryptoMarkets'],
      limitPerSubreddit: 25,
    },
    coingecko: {
      enabled: true,
      useDemo: true,
      cacheFallbackEnabled: true,
      attributionRequired: true,
      minRetryAfterSec: 900,
    },
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
  optimizer: {
    enabled: true,
    maxCandidatesPerRun: 8,
    defaultObjective: 'balanced',
    objectives: ['balanced', 'return', 'risk_adjusted', 'defensive'],
    symbols: [],
  },
  backtest: {
    defaultLimit: 400,
    defaultInterval: '5m',
    defaultConfirmationInterval: '15m',
    persistEquityCurve: true,
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
    CREATE TABLE IF NOT EXISTS bot_config_versions (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (config_key, version)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_runtime_controls (
      control_key TEXT PRIMARY KEY,
      is_paused BOOLEAN NOT NULL DEFAULT FALSE,
      emergency_stop BOOLEAN NOT NULL DEFAULT FALSE,
      pause_reason TEXT,
      updated_by TEXT NOT NULL DEFAULT 'system',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS symbol_cooldowns (
      symbol TEXT PRIMARY KEY,
      cooldown_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      active_until TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_symbol_cooldowns_active_until
    ON symbol_cooldowns (active_until DESC);
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
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at
    ON ai_decisions (created_at DESC);
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
    CREATE TABLE IF NOT EXISTS paper_accounts (
      account_key TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'paper',
      base_currency TEXT NOT NULL,
      starting_balance NUMERIC(28, 12) NOT NULL,
      cash_balance NUMERIC(28, 12) NOT NULL,
      realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      fees_paid NUMERIC(28, 12) NOT NULL DEFAULT 0,
      last_equity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_positions (
      account_key TEXT NOT NULL REFERENCES paper_accounts(account_key) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      quantity NUMERIC(28, 12) NOT NULL,
      avg_entry_price NUMERIC(28, 12) NOT NULL,
      cost_basis NUMERIC(28, 12) NOT NULL DEFAULT 0,
      last_price NUMERIC(28, 12) NOT NULL DEFAULT 0,
      market_value NUMERIC(28, 12) NOT NULL DEFAULT 0,
      unrealized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_key, symbol)
    );
  `);

  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS stop_loss_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS take_profit_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS trailing_stop_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS highest_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS atr_at_entry NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'NORMAL';`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_orders (
      id BIGSERIAL PRIMARY KEY,
      account_key TEXT NOT NULL REFERENCES paper_accounts(account_key) ON DELETE CASCADE,
      worker_name TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_notional NUMERIC(28, 12) NOT NULL DEFAULT 0,
      executed_notional NUMERIC(28, 12) NOT NULL DEFAULT 0,
      requested_quantity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      executed_quantity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      price NUMERIC(28, 12) NOT NULL DEFAULT 0,
      fee_amount NUMERIC(28, 12) NOT NULL DEFAULT 0,
      slippage_pct NUMERIC(18, 8) NOT NULL DEFAULT 0,
      realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      pnl_pct NUMERIC(18, 8) NOT NULL DEFAULT 0,
      reason TEXT,
      rejection_reason TEXT,
      linked_decision_id BIGINT REFERENCES ai_decisions(id) ON DELETE SET NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS pnl_pct NUMERIC(18, 8) NOT NULL DEFAULT 0;`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_paper_orders_created_at
    ON paper_orders (created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id BIGSERIAL PRIMARY KEY,
      account_key TEXT NOT NULL REFERENCES paper_accounts(account_key) ON DELETE CASCADE,
      cash_balance NUMERIC(28, 12) NOT NULL DEFAULT 0,
      positions_value NUMERIC(28, 12) NOT NULL DEFAULT 0,
      equity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      unrealized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      open_positions_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_account_created_at
    ON portfolio_snapshots (account_key, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_asset_scores (
      symbol TEXT PRIMARY KEY,
      social_score NUMERIC(10, 4) NOT NULL DEFAULT 0,
      social_risk NUMERIC(10, 4) NOT NULL DEFAULT 0,
      classification TEXT NOT NULL DEFAULT 'NEUTRA',
      sentiment NUMERIC(10, 4) NOT NULL DEFAULT 0,
      momentum NUMERIC(10, 4) NOT NULL DEFAULT 0,
      spam_risk NUMERIC(10, 4) NOT NULL DEFAULT 0,
      source_count INTEGER NOT NULL DEFAULT 0,
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_alerts (
      id BIGSERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      action TEXT,
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_social_alerts_created_at
    ON social_alerts (created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_provider_statuses (
      provider_key TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      mode TEXT NOT NULL DEFAULT 'free',
      last_success_at TIMESTAMPTZ,
      last_failure_at TIMESTAMPTZ,
      last_http_status INTEGER,
      retry_after_at TIMESTAMPTZ,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_order_attempts (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      worker_name TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      status TEXT NOT NULL,
      live_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      dry_run BOOLEAN NOT NULL DEFAULT TRUE,
      requested_notional NUMERIC(28, 12) NOT NULL DEFAULT 0,
      requested_quantity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      executed_notional NUMERIC(28, 12) NOT NULL DEFAULT 0,
      executed_quantity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      price NUMERIC(28, 12) NOT NULL DEFAULT 0,
      fee_amount NUMERIC(28, 12) NOT NULL DEFAULT 0,
      reason TEXT,
      rejection_reason TEXT,
      linked_decision_id BIGINT REFERENCES ai_decisions(id) ON DELETE SET NULL,
      external_order_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_live_order_attempts_created_at
    ON live_order_attempts (created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      confirmation_interval TEXT NOT NULL,
      candle_limit INTEGER NOT NULL DEFAULT 0,
      config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'completed',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_created_at
    ON backtest_runs (created_at DESC);
  `);


await pool.query(`ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS regime_label TEXT NOT NULL DEFAULT 'mixed';`);
await pool.query(`ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS performance_score NUMERIC(18, 8) NOT NULL DEFAULT 0;`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_backtest_runs_symbol_regime_score
  ON backtest_runs (symbol, regime_label, performance_score DESC, created_at DESC);
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS optimization_runs (
    id BIGSERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT 'balanced',
    status TEXT NOT NULL DEFAULT 'completed',
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_runs_created_at
  ON optimization_runs (created_at DESC);
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS optimization_results (
    id BIGSERIAL PRIMARY KEY,
    optimization_run_id BIGINT NOT NULL REFERENCES optimization_runs(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL DEFAULT 0,
    symbol TEXT NOT NULL,
    regime_label TEXT NOT NULL DEFAULT 'mixed',
    objective TEXT NOT NULL DEFAULT 'balanced',
    score NUMERIC(18, 8) NOT NULL DEFAULT 0,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    config_override JSONB NOT NULL DEFAULT '{}'::jsonb,
    backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_results_run_rank
  ON optimization_results (optimization_run_id, rank ASC);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_results_symbol_regime_score
  ON optimization_results (symbol, regime_label, score DESC, created_at DESC);
`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backtest_trades (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      reason TEXT,
      decision_action TEXT,
      confidence NUMERIC(10, 6) NOT NULL DEFAULT 0,
      price NUMERIC(28, 12) NOT NULL DEFAULT 0,
      quantity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      notional NUMERIC(28, 12) NOT NULL DEFAULT 0,
      fee_amount NUMERIC(28, 12) NOT NULL DEFAULT 0,
      realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0,
      pnl_pct NUMERIC(18, 8) NOT NULL DEFAULT 0,
      candle_time TIMESTAMPTZ NOT NULL,
      execution_time TIMESTAMPTZ NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_trades_run_id
    ON backtest_trades (run_id, execution_time ASC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backtest_equity_points (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
      point_time TIMESTAMPTZ NOT NULL,
      equity NUMERIC(28, 12) NOT NULL DEFAULT 0,
      cash_balance NUMERIC(28, 12) NOT NULL DEFAULT 0,
      positions_value NUMERIC(28, 12) NOT NULL DEFAULT 0,
      drawdown_pct NUMERIC(18, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_equity_points_run_id
    ON backtest_equity_points (run_id, point_time ASC);
  `);

  await pool.query(
    `
      INSERT INTO bot_configs (config_key, version, config)
      VALUES ('active', 1, $1::jsonb)
      ON CONFLICT (config_key) DO NOTHING;
    `,
    [JSON.stringify(DEFAULT_BOT_CONFIG)],
  );

  await pool.query(
    `
      INSERT INTO bot_config_versions (config_key, version, config)
      SELECT config_key, version, config
      FROM bot_configs
      WHERE config_key = 'active'
      ON CONFLICT (config_key, version) DO NOTHING;
    `,
  );

  await pool.query(
    `
      INSERT INTO bot_runtime_controls (control_key, is_paused, emergency_stop, pause_reason, updated_by, metadata)
      VALUES ('active', FALSE, FALSE, NULL, 'system', '{}'::jsonb)
      ON CONFLICT (control_key) DO NOTHING;
    `,
  );
}

module.exports = {
  DEFAULT_BOT_CONFIG,
  initializeDatabase,
};
