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
      bnbFeePct: 0.075,
      useBnbFeeDiscount: true,
      minBnbReserveQty: 0.05,
      slippagePct: 0.05,
      allowMultipleEntriesPerSymbol: false,
      sellFractionOnSignal: 1,
    },
    live: {
      enabled: false,
      provider: 'binance_spot',
      useTestnet: true,
      dryRun: true,
      supervised: true,
      requireBackendLiveFlag: true,
      requireExplicitConfirmation: true,
      confirmationPhrase: 'EXECUTAR_LIVE_TESTNET',
      maxOrderNotional: 250,
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
  operations: {
    maintenanceMode: false,
    maintenanceScope: 'system',
    maintenanceReason: '',
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
  training: {
    enabled: true,
    evaluationWindowDays: 14,
    allowSuggestedWeightsApply: true,
    minQualityScoreForApply: 0.56,
    maxHighDriftForApply: false,
  },
};

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [4815162342]);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_configs (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_config_versions (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (config_key, version)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS training_runtime_state (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL UNIQUE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_training_runtime_state_updated_at
    ON training_runtime_state (updated_at DESC);
  `);

  await client.query(`
    INSERT INTO training_runtime_state (config_key, state, created_at, updated_at)
    SELECT 'active', COALESCE(config->'training'->'runtime', '{}'::jsonb), NOW(), NOW()
    FROM bot_configs
    WHERE config_key = 'active'
    ON CONFLICT (config_key) DO NOTHING;
  `);

  await client.query(`
    INSERT INTO training_runtime_state (config_key, state, created_at, updated_at)
    VALUES ('active', '{}'::jsonb, NOW(), NOW())
    ON CONFLICT (config_key) DO NOTHING;
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS config_change_audit (
      id BIGSERIAL PRIMARY KEY,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      source_type TEXT,
      source_id BIGINT,
      from_version INTEGER,
      to_version INTEGER,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_config_change_audit_created_at
    ON config_change_audit (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS config_promotions (
      id BIGSERIAL PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_run_id BIGINT,
      source_result_rank INTEGER NOT NULL DEFAULT 1,
      target_channel TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_by TEXT NOT NULL DEFAULT 'system',
      reason TEXT,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      config_override JSONB NOT NULL DEFAULT '{}'::jsonb,
      promoted_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      applied_version INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMPTZ
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_config_promotions_created_at
    ON config_promotions (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS promotion_approval_requests (
      id BIGSERIAL PRIMARY KEY,
      request_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_run_id BIGINT,
      source_result_rank INTEGER NOT NULL DEFAULT 1,
      target_channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL DEFAULT 'dashboard',
      approved_by TEXT,
      rejected_by TEXT,
      reason TEXT,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      config_override JSONB NOT NULL DEFAULT '{}'::jsonb,
      promoted_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      simulation JSONB NOT NULL DEFAULT '{}'::jsonb,
      approval_note TEXT,
      rejection_note TEXT,
      applied_promotion_id BIGINT,
      applied_version INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_promotion_approval_requests_created_at
    ON promotion_approval_requests (created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_promotion_approval_requests_status
    ON promotion_approval_requests (status, created_at DESC);
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS execution_action_logs (
      id BIGSERIAL PRIMARY KEY,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      mode TEXT NOT NULL DEFAULT 'paper',
      symbol TEXT,
      side TEXT,
      status TEXT NOT NULL DEFAULT 'info',
      confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_action_logs_created_at
    ON execution_action_logs (created_at DESC);
  `);

  await client.query(`
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

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_symbol_cooldowns_active_until
    ON symbol_cooldowns (active_until DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_name TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS system_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at
    ON ai_decisions (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS market_symbols (
      symbol TEXT PRIMARY KEY,
      base_asset TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      status TEXT NOT NULL,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_interval_time
    ON market_candles (symbol, interval, open_time DESC);
  `);

  await client.query(`
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

  await client.query(`
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

  await client.query(`
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

  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS stop_loss_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS take_profit_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS trailing_stop_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS highest_price NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS atr_at_entry NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'NORMAL';`);

  await client.query(`
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

  await client.query(`ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(28, 12) NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS pnl_pct NUMERIC(18, 8) NOT NULL DEFAULT 0;`);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_paper_orders_created_at
    ON paper_orders (created_at DESC);
  `);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_account_created_at
    ON portfolio_snapshots (account_key, created_at DESC);
  `);

  await client.query(`
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

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_social_alerts_created_at
    ON social_alerts (created_at DESC);
  `);

  await client.query(`
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

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_live_order_attempts_created_at
    ON live_order_attempts (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS execution_health_checks (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'paper',
      status TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      requested_by TEXT NOT NULL DEFAULT 'system',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_health_checks_created_at
    ON execution_health_checks (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS execution_reconciliation_runs (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'paper',
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL DEFAULT 'system',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_reconciliation_runs_created_at
    ON execution_reconciliation_runs (created_at DESC);
  `);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_created_at
    ON backtest_runs (created_at DESC);
  `);


await client.query(`ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS regime_label TEXT NOT NULL DEFAULT 'mixed';`);
await client.query(`ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS performance_score NUMERIC(18, 8) NOT NULL DEFAULT 0;`);

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_backtest_runs_symbol_regime_score
  ON backtest_runs (symbol, regime_label, performance_score DESC, created_at DESC);
`);

await client.query(`
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

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_runs_created_at
  ON optimization_runs (created_at DESC);
`);

await client.query(`
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

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_results_run_rank
  ON optimization_results (optimization_run_id, rank ASC);
`);

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_optimization_results_symbol_regime_score
  ON optimization_results (symbol, regime_label, score DESC, created_at DESC);
`);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_trades_run_id
    ON backtest_trades (run_id, execution_time ASC);
  `);

  await client.query(`
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

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_equity_points_run_id
    ON backtest_equity_points (run_id, point_time ASC);
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      id BIGSERIAL PRIMARY KEY,
      job_key TEXT NOT NULL,
      trigger_source TEXT NOT NULL DEFAULT 'scheduler',
      requested_by TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'running',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_key
    ON scheduled_job_runs (job_key, started_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS active_alerts (
      alert_key TEXT PRIMARY KEY,
      severity TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'active',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by TEXT,
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_active_alerts_status
    ON active_alerts (status, severity, updated_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS readiness_reports (
      id BIGSERIAL PRIMARY KEY,
      requested_by TEXT NOT NULL DEFAULT 'system',
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_readiness_reports_created_at
    ON readiness_reports (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS training_runs (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      objective TEXT NOT NULL DEFAULT 'quality_assistance',
      symbol_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
      window_days INTEGER NOT NULL DEFAULT 14,
      status TEXT NOT NULL DEFAULT 'completed',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      suggested_config_override JSONB NOT NULL DEFAULT '{}'::jsonb,
      requested_by TEXT NOT NULL DEFAULT 'system',
      apply_suggested_weights BOOLEAN NOT NULL DEFAULT FALSE,
      applied_config_version INTEGER,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_training_runs_created_at
    ON training_runs (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS training_run_logs (
      id BIGSERIAL PRIMARY KEY,
      training_run_id BIGINT REFERENCES training_runs(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'info',
      step_key TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_training_run_logs_created_at
    ON training_run_logs (created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_training_run_logs_run_id
    ON training_run_logs (training_run_id, created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS expert_evaluation_reports (
      id BIGSERIAL PRIMARY KEY,
      training_run_id BIGINT REFERENCES training_runs(id) ON DELETE SET NULL,
      window_days INTEGER NOT NULL DEFAULT 14,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_expert_evaluation_reports_created_at
    ON expert_evaluation_reports (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS model_quality_reports (
      id BIGSERIAL PRIMARY KEY,
      training_run_id BIGINT REFERENCES training_runs(id) ON DELETE SET NULL,
      window_days INTEGER NOT NULL DEFAULT 14,
      quality_status TEXT NOT NULL DEFAULT 'warning',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_model_quality_reports_created_at
    ON model_quality_reports (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS model_drift_reports (
      id BIGSERIAL PRIMARY KEY,
      training_run_id BIGINT REFERENCES training_runs(id) ON DELETE SET NULL,
      symbol_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
      drift_level TEXT NOT NULL DEFAULT 'low',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_model_drift_reports_created_at
    ON model_drift_reports (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS training_recalibration_history (
      id BIGSERIAL PRIMARY KEY,
      requested_by TEXT NOT NULL DEFAULT 'system',
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      window_days INTEGER NOT NULL DEFAULT 14,
      applied BOOLEAN NOT NULL DEFAULT FALSE,
      applied_config_version INTEGER,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_training_recalibration_history_created_at
    ON training_recalibration_history (created_at DESC);
  `);

  await client.query(
    `
      INSERT INTO bot_configs (config_key, version, config)
      VALUES ('active', 1, $1::jsonb)
      ON CONFLICT (config_key) DO NOTHING;
    `,
    [JSON.stringify(DEFAULT_BOT_CONFIG)],
  );

  await client.query(
    `
      INSERT INTO bot_config_versions (config_key, version, config)
      SELECT config_key, version, config
      FROM bot_configs
      WHERE config_key = 'active'
      ON CONFLICT (config_key, version) DO NOTHING;
    `,
  );


  await client.query(`
    ALTER TABLE bot_runtime_controls
    ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await client.query(`
    ALTER TABLE bot_runtime_controls
    ADD COLUMN IF NOT EXISTS maintenance_reason TEXT
  `);

  await client.query(`
    ALTER TABLE bot_runtime_controls
    ADD COLUMN IF NOT EXISTS maintenance_scope TEXT NOT NULL DEFAULT 'system'
  `);

  await client.query(`
    ALTER TABLE bot_runtime_controls
    ADD COLUMN IF NOT EXISTS maintenance_until TIMESTAMPTZ
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT,
      destination TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_payload JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at
    ON notification_deliveries (created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS policy_gate_reports (
      id BIGSERIAL PRIMARY KEY,
      gate_type TEXT NOT NULL,
      target_channel TEXT,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL DEFAULT 'system',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_policy_gate_reports_created_at
    ON policy_gate_reports (created_at DESC);
  `);



  await client.query(`
    CREATE TABLE IF NOT EXISTS execution_preview_tickets (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT NOT NULL DEFAULT 'system',
      symbol VARCHAR(20) NOT NULL,
      side VARCHAR(10) NOT NULL,
      preview_hash TEXT NOT NULL,
      preview_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_preview_tickets_created_at
    ON execution_preview_tickets (created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_execution_preview_tickets_expires_at
    ON execution_preview_tickets (expires_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS observability_metric_snapshots (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'system',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_observability_metric_snapshots_created_at
    ON observability_metric_snapshots (created_at DESC);
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS backtest_validation_runs (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      mode TEXT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      interval VARCHAR(20) NOT NULL,
      confirmation_interval VARCHAR(20) NOT NULL,
      objective TEXT NOT NULL DEFAULT 'balanced',
      candle_limit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      stability_score NUMERIC(18, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_validation_runs_created_at
    ON backtest_validation_runs (created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_validation_runs_mode_score
    ON backtest_validation_runs (mode, stability_score DESC, created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS backtest_validation_segments (
      id BIGSERIAL PRIMARY KEY,
      validation_run_id BIGINT NOT NULL REFERENCES backtest_validation_runs(id) ON DELETE CASCADE,
      segment_key TEXT NOT NULL,
      segment_index INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      regime_label TEXT NOT NULL DEFAULT 'mixed',
      candle_limit INTEGER NOT NULL DEFAULT 0,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_backtest_validation_segments_run_idx
    ON backtest_validation_segments (validation_run_id, segment_index ASC, created_at ASC);
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS operational_governance_reports (
      id BIGSERIAL PRIMARY KEY,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      requested_by TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'healthy',
      score NUMERIC(18, 8) NOT NULL DEFAULT 0,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_operational_governance_reports_created_at
    ON operational_governance_reports (created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_operational_governance_reports_status_created
    ON operational_governance_reports (status, created_at DESC);
  `);

await client.query(`
  CREATE TABLE IF NOT EXISTS operational_runbooks (
    runbook_key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    description TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    detection_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    recovery_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS incident_drills (
    id BIGSERIAL PRIMARY KEY,
    scenario_key TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    status TEXT NOT NULL DEFAULT 'simulated',
    triggered_by TEXT NOT NULL DEFAULT 'dashboard',
    notes TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS recovery_actions (
    id BIGSERIAL PRIMARY KEY,
    runbook_key TEXT NOT NULL,
    action_key TEXT NOT NULL,
    action_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    actor TEXT NOT NULL DEFAULT 'dashboard',
    notes TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS testnet_supervision_reports (
    id BIGSERIAL PRIMARY KEY,
    trigger_source TEXT NOT NULL DEFAULT 'scheduler',
    requested_by TEXT NOT NULL DEFAULT 'scheduler',
    status TEXT NOT NULL DEFAULT 'healthy',
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_testnet_supervision_reports_created_at
  ON testnet_supervision_reports (created_at DESC);
`);

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_testnet_supervision_reports_status_created
  ON testnet_supervision_reports (status, created_at DESC);
`);


await client.query(`
  CREATE TABLE IF NOT EXISTS dashboard_preferences (
    preference_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);


  await client.query(
    `
      INSERT INTO bot_runtime_controls (control_key, is_paused, emergency_stop, pause_reason, updated_by, metadata)
      VALUES ('active', FALSE, FALSE, NULL, 'system', '{}'::jsonb)
      ON CONFLICT (control_key) DO NOTHING;
    `,
  );
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [4815162342]);
    } finally {
      client.release();
    }
  }
}

module.exports = {
  DEFAULT_BOT_CONFIG,
  initializeDatabase,
};
