const dotenv = require('dotenv');

dotenv.config();

function getEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function getBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

module.exports = {
  port: Number(getEnv('PORT', 4000)),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  corsOrigin: getEnv('CORS_ORIGIN', '*'),
  db: {
    host: getEnv('DB_HOST', 'localhost'),
    port: Number(getEnv('DB_PORT', 5432)),
    database: getEnv('DB_NAME', 'criptoia'),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', 'postgres'),
  },
  internalApiKey: getEnv('INTERNAL_API_KEY', 'troque-esta-chave'),
  market: {
    binanceApiBaseUrl: getEnv('BINANCE_API_BASE_URL', 'https://api.binance.com').replace(/\/$/, ''),
    cacheTtlSec: Number(getEnv('MARKET_CACHE_TTL_SEC', 20)),
    defaultCandleLimit: Number(getEnv('CANDLE_DEFAULT_LIMIT', 300)),
  },
  health: {
    workerStaleAfterSec: Number(getEnv('WORKER_STALE_AFTER_SEC', 90)),
    sseSnapshotIntervalSec: Number(getEnv('SSE_SNAPSHOT_INTERVAL_SEC', 15)),
  },
  scheduling: {
    enabled: getBooleanEnv('SCHEDULER_ENABLED', true),
    healthcheckIntervalSec: Number(getEnv('SCHEDULER_HEALTHCHECK_INTERVAL_SEC', 300)),
    reconciliationIntervalSec: Number(getEnv('SCHEDULER_RECONCILIATION_INTERVAL_SEC', 900)),
    readinessIntervalSec: Number(getEnv('SCHEDULER_READINESS_INTERVAL_SEC', 600)),
    alertScanIntervalSec: Number(getEnv('SCHEDULER_ALERT_SCAN_INTERVAL_SEC', 120)),
  },
  execution: {
    liveEnabled: getBooleanEnv('EXECUTION_LIVE_ENABLED', false),
    defaultMode: getEnv('EXECUTION_DEFAULT_MODE', 'paper'),
    healthcheckTimeoutMs: Number(getEnv('EXECUTION_HEALTHCHECK_TIMEOUT_MS', 12000)),
    reconciliationLookbackHours: Number(getEnv('EXECUTION_RECONCILIATION_LOOKBACK_HOURS', 24)),
    binance: {
      apiBaseUrl: getEnv('BINANCE_TRADE_API_BASE_URL', 'https://api.binance.com').replace(/\/$/, ''),
      apiKey: getEnv('BINANCE_API_KEY', ''),
      apiSecret: getEnv('BINANCE_API_SECRET', ''),
      recvWindow: Number(getEnv('BINANCE_RECV_WINDOW', 5000)),
      testnet: getBooleanEnv('BINANCE_TESTNET', true),
      dryRun: getBooleanEnv('BINANCE_DRY_RUN', true),
    },
  },
};
