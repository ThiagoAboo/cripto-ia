const crypto = require('crypto');
const env = require('../config/env');
const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { executePaperOrder } = require('./execution.service');

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function buildExecutionSummary(config = {}) {
  const tradingMode = String(config?.trading?.mode || env.execution.defaultMode || 'paper').toLowerCase();
  const liveConfig = config?.execution?.live || {};
  const liveKeysPresent = Boolean(env.execution.binance.apiKey && env.execution.binance.apiSecret);
  const backendLiveEnabled = Boolean(env.execution.liveEnabled);
  const liveConfigEnabled = Boolean(liveConfig.enabled);
  const provider = String(liveConfig.provider || 'binance_spot');
  const dryRun = liveConfig.dryRun ?? env.execution.binance.dryRun;
  const useTestnet = liveConfig.useTestnet ?? env.execution.binance.testnet;

  return {
    mode: tradingMode,
    backendLiveEnabled,
    liveConfigEnabled,
    liveReady: backendLiveEnabled && liveConfigEnabled && liveKeysPresent,
    provider,
    dryRun: Boolean(dryRun),
    useTestnet: Boolean(useTestnet),
    capabilities: {
      paper: true,
      liveAdapterAvailable: provider === 'binance_spot',
      liveKeysPresent,
      liveCanSubmit: backendLiveEnabled && liveConfigEnabled && liveKeysPresent,
      liveUsesSignedRequests: true,
      liveRecommended: false,
    },
  };
}

function getSignedHeaders(signature) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-MBX-APIKEY': env.execution.binance.apiKey,
    'X-MBX-SIGNATURE': signature,
  };
}

function buildTradeApiBaseUrl(configSummary) {
  const isTestnet = configSummary.useTestnet;
  if (isTestnet) {
    return 'https://testnet.binance.vision';
  }
  return env.execution.binance.apiBaseUrl;
}

function signParams(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  const signature = crypto
    .createHmac('sha256', env.execution.binance.apiSecret)
    .update(serialized)
    .digest('hex');
  return { serialized, signature };
}

async function createLiveOrderAttempt({
  provider,
  workerName,
  symbol,
  side,
  status,
  liveModeEnabled,
  dryRun,
  requestedNotional = 0,
  requestedQuantity = 0,
  executedNotional = 0,
  executedQuantity = 0,
  price = 0,
  feeAmount = 0,
  reason = null,
  rejectionReason = null,
  linkedDecisionId = null,
  externalOrderId = null,
  payload = {},
}) {
  const result = await pool.query(
    `
      INSERT INTO live_order_attempts (
        provider,
        worker_name,
        symbol,
        side,
        status,
        live_mode_enabled,
        dry_run,
        requested_notional,
        requested_quantity,
        executed_notional,
        executed_quantity,
        price,
        fee_amount,
        reason,
        rejection_reason,
        linked_decision_id,
        external_order_id,
        payload,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,NOW(),NOW())
      RETURNING
        id,
        provider,
        worker_name AS "workerName",
        symbol,
        side,
        status,
        live_mode_enabled AS "liveModeEnabled",
        dry_run AS "dryRun",
        requested_notional AS "requestedNotional",
        requested_quantity AS "requestedQuantity",
        executed_notional AS "executedNotional",
        executed_quantity AS "executedQuantity",
        price,
        fee_amount AS "feeAmount",
        reason,
        rejection_reason AS "rejectionReason",
        linked_decision_id AS "linkedDecisionId",
        external_order_id AS "externalOrderId",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      provider,
      workerName,
      symbol,
      side,
      status,
      liveModeEnabled,
      dryRun,
      requestedNotional,
      requestedQuantity,
      executedNotional,
      executedQuantity,
      price,
      feeAmount,
      reason,
      rejectionReason,
      linkedDecisionId,
      externalOrderId,
      JSON.stringify(payload),
    ],
  );

  const row = result.rows[0];
  return {
    ...row,
    requestedNotional: Number(row.requestedNotional),
    requestedQuantity: Number(row.requestedQuantity),
    executedNotional: Number(row.executedNotional),
    executedQuantity: Number(row.executedQuantity),
    price: Number(row.price),
    feeAmount: Number(row.feeAmount),
  };
}

async function submitBinanceLiveOrder({
  configSummary,
  workerName,
  symbol,
  side,
  requestedNotional = null,
  requestedQuantity = null,
  reason = null,
  linkedDecisionId = null,
  payload = {},
}) {
  const liveModeEnabled = configSummary.backendLiveEnabled && configSummary.liveConfigEnabled;
  const provider = configSummary.provider;

  if (!liveModeEnabled) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(requestedNotional || 0),
      requestedQuantity: Number(requestedQuantity || 0),
      reason,
      rejectionReason: 'live_mode_disabled',
      linkedDecisionId,
      payload,
    });
  }

  if (!env.execution.binance.apiKey || !env.execution.binance.apiSecret) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(requestedNotional || 0),
      requestedQuantity: Number(requestedQuantity || 0),
      reason,
      rejectionReason: 'missing_binance_api_credentials',
      linkedDecisionId,
      payload,
    });
  }

  if (!env.execution.liveEnabled) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(requestedNotional || 0),
      requestedQuantity: Number(requestedQuantity || 0),
      reason,
      rejectionReason: 'backend_live_flag_disabled',
      linkedDecisionId,
      payload,
    });
  }

  const params = {
    symbol,
    side: String(side).toUpperCase(),
    type: 'MARKET',
    timestamp: Date.now(),
    recvWindow: env.execution.binance.recvWindow,
    newOrderRespType: configSummary.dryRun ? undefined : 'RESULT',
  };

  if (params.side === 'BUY') {
    params.quoteOrderQty = Number(requestedNotional || 0);
  } else {
    params.quantity = Number(requestedQuantity || 0);
  }

  if ((!params.quoteOrderQty && params.side === 'BUY') || (!params.quantity && params.side === 'SELL')) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(requestedNotional || 0),
      requestedQuantity: Number(requestedQuantity || 0),
      reason,
      rejectionReason: 'live_order_missing_quantity_or_notional',
      linkedDecisionId,
      payload,
    });
  }

  const { serialized, signature } = signParams(params);
  const endpoint = configSummary.dryRun ? '/api/v3/order/test' : '/api/v3/order';
  const url = `${buildTradeApiBaseUrl(configSummary)}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getSignedHeaders(signature),
    body: `${serialized}&signature=${signature}`,
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_error) {
    parsed = { rawText: text };
  }

  if (!response.ok) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(requestedNotional || 0),
      requestedQuantity: Number(requestedQuantity || 0),
      reason,
      rejectionReason: `binance_live_request_failed:${response.status}`,
      linkedDecisionId,
      payload: { ...payload, binance: parsed },
    });
  }

  return createLiveOrderAttempt({
    provider,
    workerName,
    symbol,
    side,
    status: configSummary.dryRun ? 'ACCEPTED_DRY_RUN' : 'SUBMITTED',
    liveModeEnabled,
    dryRun: configSummary.dryRun,
    requestedNotional: Number(requestedNotional || 0),
    requestedQuantity: Number(requestedQuantity || 0),
    executedNotional: Number(parsed.cummulativeQuoteQty || 0),
    executedQuantity: Number(parsed.executedQty || 0),
    price: Number(parsed.price || 0),
    feeAmount: 0,
    reason,
    linkedDecisionId,
    externalOrderId: parsed.orderId ? String(parsed.orderId) : null,
    payload: { ...payload, binance: parsed },
  });
}

async function executeOrder({
  workerName,
  symbol,
  side,
  reason = null,
  linkedDecisionId = null,
  requestedNotional = null,
  requestedQuantity = null,
  payload = {},
  forceMode = null,
}) {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);
  const mode = String(forceMode || summary.mode || 'paper').toLowerCase();

  if (mode === 'paper') {
    return executePaperOrder({
      workerName,
      symbol,
      side,
      reason,
      linkedDecisionId,
      requestedNotional,
      requestedQuantity,
      payload,
    });
  }

  if (mode === 'live') {
    return submitBinanceLiveOrder({
      configSummary: summary,
      workerName,
      symbol,
      side,
      reason,
      linkedDecisionId,
      requestedNotional,
      requestedQuantity,
      payload,
    });
  }

  throw new Error(`unsupported_execution_mode:${mode}`);
}

async function getExecutionStatus() {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);

  const recentLiveAttempts = await pool.query(
    `
      SELECT
        id,
        provider,
        worker_name AS "workerName",
        symbol,
        side,
        status,
        live_mode_enabled AS "liveModeEnabled",
        dry_run AS "dryRun",
        requested_notional AS "requestedNotional",
        requested_quantity AS "requestedQuantity",
        executed_notional AS "executedNotional",
        executed_quantity AS "executedQuantity",
        price,
        reason,
        rejection_reason AS "rejectionReason",
        external_order_id AS "externalOrderId",
        created_at AS "createdAt"
      FROM live_order_attempts
      ORDER BY created_at DESC
      LIMIT 20
    `,
  );

  return {
    ...summary,
    configVersion: configRow?.version || 0,
    recentLiveAttempts: recentLiveAttempts.rows.map((row) => ({
      ...row,
      requestedNotional: Number(row.requestedNotional),
      requestedQuantity: Number(row.requestedQuantity),
      executedNotional: Number(row.executedNotional),
      executedQuantity: Number(row.executedQuantity),
      price: Number(row.price),
    })),
  };
}

module.exports = {
  executeOrder,
  getExecutionStatus,
};
