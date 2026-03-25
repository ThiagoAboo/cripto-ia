const crypto = require('crypto');
const env = require('../config/env');
const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { publish } = require('./eventBus.service');
const { executePaperOrder } = require('./execution.service');
const { getTickers, getSymbols } = require('./market.service');
const { getRuntimeControl } = require('./control.service');
const { getLatestReadinessReport } = require('./readiness.service');
const { listActiveAlerts } = require('./alerts.service');

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function roundDownToStep(value, step) {
  const numericValue = Number(value || 0);
  const numericStep = Number(step || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  if (!Number.isFinite(numericStep) || numericStep <= 0) return Number(numericValue.toFixed(8));
  const factor = Math.floor(numericValue / numericStep);
  const decimals = Math.max(0, (String(step).split('.')[1] || '').length);
  return Number((factor * numericStep).toFixed(decimals));
}

function sanitizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildPreviewHash({
  symbol,
  side,
  normalizedNotional = 0,
  normalizedQuantity = 0,
  configVersion = 0,
}) {
  const raw = [
    String(symbol || '').toUpperCase(),
    String(side || '').toUpperCase(),
    Number(normalizedNotional || 0).toFixed(8),
    Number(normalizedQuantity || 0).toFixed(8),
    String(configVersion || 0),
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createPreviewTicket({
  actor = 'dashboard',
  symbol,
  side,
  previewHash,
  previewPayload = {},
}) {
  const ttlSec = Math.max(60, Number(env.execution.previewTicketTtlSec || 600));
  const result = await pool.query(
    `
      INSERT INTO execution_preview_tickets (
        actor, symbol, side, preview_hash, preview_payload, expires_at, created_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW() + ($6::text || ' seconds')::interval,NOW())
      RETURNING id, actor, symbol, side, preview_hash AS "previewHash", expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"
    `,
    [actor, String(symbol).toUpperCase(), String(side).toUpperCase(), previewHash, JSON.stringify(previewPayload || {}), String(ttlSec)],
  );
  return result.rows[0];
}

async function consumePreviewTicket({ id, previewHash }) {
  const result = await pool.query(
    `
      UPDATE execution_preview_tickets
      SET used_at = NOW()
      WHERE id = $1
        AND preview_hash = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING id, actor, symbol, side, preview_hash AS "previewHash", preview_payload AS "previewPayload", expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"
    `,
    [id, previewHash],
  );
  return result.rows[0] || null;
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
  const supervised = liveConfig.supervised ?? true;
  const requireExplicitConfirmation = liveConfig.requireExplicitConfirmation ?? true;
  const confirmationPhrase = String(liveConfig.confirmationPhrase || 'EXECUTAR_LIVE_TESTNET');
  const maxOrderNotional = sanitizeNumber(liveConfig.maxOrderNotional || 0, 0);

  return {
    mode: tradingMode,
    backendLiveEnabled,
    liveConfigEnabled,
    liveReady: backendLiveEnabled && liveConfigEnabled && liveKeysPresent,
    provider,
    dryRun: Boolean(dryRun),
    useTestnet: Boolean(useTestnet),
    supervised: Boolean(supervised),
    requireExplicitConfirmation,
    confirmationPhrase,
    maxOrderNotional,
    capabilities: {
      paper: true,
      liveAdapterAvailable: provider === 'binance_spot',
      liveKeysPresent,
      liveCanSubmit: backendLiveEnabled && liveConfigEnabled && liveKeysPresent,
      liveUsesSignedRequests: true,
      liveRecommended: false,
      healthchecksAvailable: true,
      reconciliationAvailable: provider === 'binance_spot',
      previewAvailable: provider === 'binance_spot',
      supervisedLiveSubmitAvailable: provider === 'binance_spot',
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

async function createExecutionActionLog({
  actionType,
  actor = 'system',
  mode = 'paper',
  symbol = null,
  side = null,
  status = 'info',
  confirmationRequired = false,
  payload = {},
}) {
  const result = await pool.query(
    `
      INSERT INTO execution_action_logs (
        action_type,
        actor,
        mode,
        symbol,
        side,
        status,
        confirmation_required,
        payload,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
      RETURNING
        id,
        action_type AS "actionType",
        actor,
        mode,
        symbol,
        side,
        status,
        confirmation_required AS "confirmationRequired",
        payload,
        created_at AS "createdAt"
    `,
    [
      actionType,
      actor,
      mode,
      symbol,
      side,
      status,
      Boolean(confirmationRequired),
      JSON.stringify(payload || {}),
    ],
  );

  return result.rows[0] || null;
}

async function listExecutionActionLogs({ limit = 30 } = {}) {
  const result = await pool.query(
    `
      SELECT
        id,
        action_type AS "actionType",
        actor,
        mode,
        symbol,
        side,
        status,
        confirmation_required AS "confirmationRequired",
        payload,
        created_at AS "createdAt"
      FROM execution_action_logs
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 30), 200))],
  );
  return result.rows;
}

async function getSymbolTradingRules(symbol) {
  if (!symbol) {
    throw new Error('symbol_required');
  }

  let result = await pool.query(
    `
      SELECT symbol, raw, updated_at AS "updatedAt"
      FROM market_symbols
      WHERE symbol = $1
      LIMIT 1
    `,
    [String(symbol).toUpperCase()],
  );

  if (!result.rows[0]) {
    await getSymbols({ quoteAsset: 'USDT', refresh: true });
    result = await pool.query(
      `
        SELECT symbol, raw, updated_at AS "updatedAt"
        FROM market_symbols
        WHERE symbol = $1
        LIMIT 1
      `,
      [String(symbol).toUpperCase()],
    );
  }

  const row = result.rows[0];
  const raw = row?.raw || {};
  const filters = Array.isArray(raw.filters) ? raw.filters : [];
  const filterByType = Object.fromEntries(filters.map((item) => [item.filterType, item]));

  return {
    symbol: raw.symbol || String(symbol).toUpperCase(),
    baseAsset: raw.baseAsset || null,
    quoteAsset: raw.quoteAsset || null,
    status: raw.status || 'UNKNOWN',
    permissions: raw.permissions || [],
    orderTypes: raw.orderTypes || [],
    filters: {
      lotSize: filterByType.LOT_SIZE || null,
      marketLotSize: filterByType.MARKET_LOT_SIZE || null,
      minNotional: filterByType.MIN_NOTIONAL || filterByType.NOTIONAL || null,
      priceFilter: filterByType.PRICE_FILTER || null,
    },
    raw,
  };
}

async function getCurrentPrice(symbol) {
  const tickers = await getTickers({ symbols: [symbol], refresh: true });
  const ticker = tickers[0];
  return sanitizeNumber(ticker?.price || 0, 0);
}

async function buildOrderPreview({
  symbol,
  side,
  requestedNotional = null,
  requestedQuantity = null,
  actor = 'dashboard',
}) {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedSide = String(side || '').toUpperCase();

  if (!normalizedSymbol || !normalizedSide) {
    throw new Error('symbol_and_side_required');
  }

  const [rules, price] = await Promise.all([
    getSymbolTradingRules(normalizedSymbol),
    getCurrentPrice(normalizedSymbol),
  ]);

  const warnings = [];
  const confirmations = [];
  const minNotional = sanitizeNumber(rules?.filters?.minNotional?.minNotional || rules?.filters?.minNotional?.notional || 0, 0);
  const stepSize = sanitizeNumber(
    rules?.filters?.marketLotSize?.stepSize || rules?.filters?.lotSize?.stepSize || 0,
    0,
  );
  const minQty = sanitizeNumber(
    rules?.filters?.marketLotSize?.minQty || rules?.filters?.lotSize?.minQty || 0,
    0,
  );
  const maxQty = sanitizeNumber(
    rules?.filters?.marketLotSize?.maxQty || rules?.filters?.lotSize?.maxQty || 0,
    0,
  );

  let normalizedNotional = sanitizeNumber(requestedNotional, 0);
  let normalizedQuantity = sanitizeNumber(requestedQuantity, 0);

  if (normalizedSide === 'BUY') {
    if (!normalizedNotional && normalizedQuantity && price > 0) {
      normalizedNotional = normalizedQuantity * price;
    }
    if (!normalizedNotional) {
      warnings.push('buy_missing_notional');
    }
    if (minNotional > 0 && normalizedNotional > 0 && normalizedNotional < minNotional) {
      warnings.push(`buy_notional_below_min:${minNotional}`);
    }
  }

  if (normalizedSide === 'SELL') {
    if (!normalizedQuantity && normalizedNotional && price > 0) {
      normalizedQuantity = normalizedNotional / price;
    }
    if (!normalizedQuantity) {
      warnings.push('sell_missing_quantity');
    }
    const roundedQuantity = roundDownToStep(normalizedQuantity, stepSize);
    if (roundedQuantity !== normalizedQuantity) {
      warnings.push(`sell_quantity_rounded_to_step:${stepSize}`);
    }
    normalizedQuantity = roundedQuantity;
    if (minQty > 0 && normalizedQuantity > 0 && normalizedQuantity < minQty) {
      warnings.push(`sell_quantity_below_min:${minQty}`);
    }
    if (maxQty > 0 && normalizedQuantity > maxQty) {
      warnings.push(`sell_quantity_above_max:${maxQty}`);
    }
    normalizedNotional = price > 0 ? normalizedQuantity * price : normalizedNotional;
  }

  if (summary.mode === 'live' || summary.liveConfigEnabled) {
    confirmations.push('review_execution_mode_before_submit');
  }
  if (summary.requireExplicitConfirmation) {
    confirmations.push(`type_confirmation_phrase:${summary.confirmationPhrase}`);
  }
  if (summary.maxOrderNotional > 0 && normalizedNotional > summary.maxOrderNotional) {
    warnings.push(`notional_above_config_limit:${summary.maxOrderNotional}`);
  }
  if (!summary.backendLiveEnabled) {
    warnings.push('backend_live_flag_disabled');
  }
  if (!summary.capabilities.liveKeysPresent) {
    warnings.push('missing_binance_api_credentials');
  }
  if (summary.dryRun) {
    warnings.push('dry_run_enabled');
  }

  const previewHash = buildPreviewHash({
    symbol: normalizedSymbol,
    side: normalizedSide,
    normalizedNotional,
    normalizedQuantity,
    configVersion: configRow?.version || 0,
  });

  const preview = {
    mode: summary.mode,
    provider: summary.provider,
    useTestnet: summary.useTestnet,
    dryRun: summary.dryRun,
    supervised: summary.supervised,
    symbol: normalizedSymbol,
    side: normalizedSide,
    actor,
    price,
    requestedNotional: sanitizeNumber(requestedNotional, 0),
    requestedQuantity: sanitizeNumber(requestedQuantity, 0),
    normalizedNotional,
    normalizedQuantity,
    estimatedNotional: normalizedSide === 'BUY' ? normalizedNotional : normalizedQuantity * price,
    confirmationsRequired: confirmations,
    warnings,
    canSubmitLive: summary.liveReady && warnings.filter((item) => item.startsWith('buy_missing') || item.startsWith('sell_missing') || item.includes('below_min')).length === 0,
    symbolRules: {
      minNotional,
      stepSize,
      minQty,
      maxQty,
      quoteAsset: rules.quoteAsset,
      baseAsset: rules.baseAsset,
      orderTypes: rules.orderTypes,
    },
    configVersion: configRow?.version || 0,
    previewHash,
  };

  const previewTicket = await createPreviewTicket({
    actor,
    symbol: normalizedSymbol,
    side: normalizedSide,
    previewHash,
    previewPayload: preview,
  });

  const logRow = await createExecutionActionLog({
    actionType: 'preview_order',
    actor,
    mode: summary.mode,
    symbol: normalizedSymbol,
    side: normalizedSide,
    status: warnings.length ? 'warning' : 'ok',
    confirmationRequired: summary.requireExplicitConfirmation,
    payload: preview,
  });

  publish('execution.preview', {
    preview,
    log: logRow,
  });

  return {
    ...preview,
    previewTicket,
    log,
  };
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
  actor = 'worker',
  confirmationPhrase = '',
  previewTicketId = null,
}) {
  const liveModeEnabled = configSummary.backendLiveEnabled && configSummary.liveConfigEnabled;
  const provider = configSummary.provider;
  const preview = await buildOrderPreview({ symbol, side, requestedNotional, requestedQuantity, actor });

  if (configSummary.supervised && !previewTicketId) {
    const rejected = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'preview_ticket_required',
      linkedDecisionId,
      payload: { ...payload, preview },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'rejected',
      confirmationRequired: true,
      payload: { rejectionReason: 'preview_ticket_required', preview },
    });
    return rejected;
  }

  const previewTicket = configSummary.supervised
    ? await consumePreviewTicket({ id: Number(previewTicketId), previewHash: preview.previewHash })
    : null;

  if (configSummary.supervised && !previewTicket) {
    const rejected = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'preview_ticket_invalid_or_expired',
      linkedDecisionId,
      payload: { ...payload, preview, previewTicketId },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'rejected',
      confirmationRequired: true,
      payload: { rejectionReason: 'preview_ticket_invalid_or_expired', preview, previewTicketId },
    });
    return rejected;
  }

  const [runtimeControl, latestReadiness, activeAlerts] = await Promise.all([
    getRuntimeControl(),
    getLatestReadinessReport(),
    listActiveAlerts({ limit: 50, status: 'open' }),
  ]);

  const readinessFreshEnough = latestReadiness?.createdAt
    ? (Date.now() - new Date(latestReadiness.createdAt).getTime()) <= Math.max(1, Number(env.execution.readinessFreshnessMinutes || 30)) * 60 * 1000
    : false;

  const criticalAlerts = activeAlerts.filter((item) => String(item.severity || '').toLowerCase() === 'critical');

  if (runtimeControl.emergencyStop || runtimeControl.maintenanceMode || !readinessFreshEnough || latestReadiness?.status === 'blocked' || criticalAlerts.length) {
    const rejected = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: runtimeControl.emergencyStop
        ? 'runtime_emergency_stop'
        : runtimeControl.maintenanceMode
          ? 'runtime_maintenance_mode'
          : !readinessFreshEnough
            ? 'readiness_not_recent'
            : latestReadiness?.status === 'blocked'
              ? 'readiness_blocked'
              : 'critical_alerts_open',
      linkedDecisionId,
      payload: {
        ...payload,
        preview,
        runtime: runtimeControl,
        latestReadiness,
        criticalAlertsCount: criticalAlerts.length,
        previewTicketId,
      },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'rejected',
      confirmationRequired: true,
      payload: {
        rejectionReason: rejected.rejectionReason,
        preview,
        runtime: runtimeControl,
        latestReadiness,
        criticalAlertsCount: criticalAlerts.length,
        previewTicketId,
      },
    });
    return rejected;
  }

  if (configSummary.requireExplicitConfirmation && String(confirmationPhrase || '') !== String(configSummary.confirmationPhrase || '')) {
    const rejected = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'explicit_confirmation_required',
      linkedDecisionId,
      payload: { ...payload, preview },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'rejected',
      confirmationRequired: true,
      payload: { rejectionReason: 'explicit_confirmation_required', preview },
    });
    return rejected;
  }

  if (configSummary.maxOrderNotional > 0 && Number(preview.estimatedNotional || 0) > configSummary.maxOrderNotional) {
    const rejected = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'max_order_notional_exceeded',
      linkedDecisionId,
      payload: { ...payload, preview },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'rejected',
      confirmationRequired: configSummary.requireExplicitConfirmation,
      payload: { rejectionReason: 'max_order_notional_exceeded', preview },
    });
    return rejected;
  }

  if (!liveModeEnabled) {
    return createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'live_mode_disabled',
      linkedDecisionId,
      payload: { ...payload, preview },
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
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'missing_binance_api_credentials',
      linkedDecisionId,
      payload: { ...payload, preview },
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
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'backend_live_flag_disabled',
      linkedDecisionId,
      payload: { ...payload, preview },
    });
  }

  const params = {
    symbol: String(symbol).toUpperCase(),
    side: String(side).toUpperCase(),
    type: 'MARKET',
    timestamp: Date.now(),
    recvWindow: env.execution.binance.recvWindow,
    newOrderRespType: configSummary.dryRun ? undefined : 'RESULT',
  };

  if (params.side === 'BUY') {
    params.quoteOrderQty = Number(preview.normalizedNotional || 0);
  } else {
    params.quantity = Number(preview.normalizedQuantity || 0);
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
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: 'live_order_missing_quantity_or_notional',
      linkedDecisionId,
      payload: { ...payload, preview },
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
    const failed = await createLiveOrderAttempt({
      provider,
      workerName,
      symbol,
      side,
      status: 'REJECTED',
      liveModeEnabled,
      dryRun: configSummary.dryRun,
      requestedNotional: Number(preview.normalizedNotional || 0),
      requestedQuantity: Number(preview.normalizedQuantity || 0),
      reason,
      rejectionReason: `binance_live_request_failed:${response.status}`,
      linkedDecisionId,
      payload: { ...payload, preview, binance: parsed },
    });
    await createExecutionActionLog({
      actionType: 'submit_live_order',
      actor,
      mode: 'live',
      symbol,
      side,
      status: 'error',
      confirmationRequired: configSummary.requireExplicitConfirmation,
      payload: { responseStatus: response.status, preview, binance: parsed },
    });
    return failed;
  }

  const accepted = await createLiveOrderAttempt({
    provider,
    workerName,
    symbol,
    side,
    status: configSummary.dryRun ? 'ACCEPTED_DRY_RUN' : 'SUBMITTED',
    liveModeEnabled,
    dryRun: configSummary.dryRun,
    requestedNotional: Number(preview.normalizedNotional || 0),
    requestedQuantity: Number(preview.normalizedQuantity || 0),
    executedNotional: Number(parsed.cummulativeQuoteQty || 0),
    executedQuantity: Number(parsed.executedQty || 0),
    price: Number(parsed.price || 0),
    feeAmount: 0,
    reason,
    linkedDecisionId,
    externalOrderId: parsed.orderId ? String(parsed.orderId) : null,
    payload: { ...payload, preview, binance: parsed },
  });

  await createExecutionActionLog({
    actionType: 'submit_live_order',
    actor,
    mode: 'live',
    symbol,
    side,
    status: configSummary.dryRun ? 'dry_run' : 'submitted',
    confirmationRequired: configSummary.requireExplicitConfirmation,
    payload: { preview, result: accepted },
  });

  return accepted;
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
  actor = 'worker',
  confirmationPhrase = '',
  previewTicketId = null,
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
      actor,
      confirmationPhrase,
      previewTicketId,
    });
  }

  throw new Error(`unsupported_execution_mode:${mode}`);
}

async function getExecutionStatus() {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);

  const [recentLiveAttempts, recentHealthChecks, recentReconciliations, recentActionLogs] = await Promise.all([
    pool.query(
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
    ),
    pool.query(
      `
        SELECT id, provider, mode, status, severity, requested_by AS "requestedBy", summary, created_at AS "createdAt"
        FROM execution_health_checks
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ),
    pool.query(
      `
        SELECT id, provider, mode, status, requested_by AS "requestedBy", summary, created_at AS "createdAt"
        FROM execution_reconciliation_runs
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ),
    pool.query(
      `
        SELECT id, action_type AS "actionType", actor, mode, symbol, side, status, confirmation_required AS "confirmationRequired", payload, created_at AS "createdAt"
        FROM execution_action_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 20
      `,
    ),
  ]);

  return {
    ...summary,
    configVersion: configRow?.version || 0,
    latestHealthCheck: recentHealthChecks.rows[0] || null,
    recentHealthChecks: recentHealthChecks.rows,
    recentReconciliations: recentReconciliations.rows,
    recentActionLogs: recentActionLogs.rows,
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.execution.healthcheckTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = { raw: text };
  }
  return { ok: response.ok, status: response.status, payload };
}

async function binancePublicGet(path, configSummary) {
  const baseUrl = buildTradeApiBaseUrl(configSummary);
  return fetchJson(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
}

async function binanceSignedGet(path, params, configSummary) {
  const baseUrl = buildTradeApiBaseUrl(configSummary);
  const finalParams = {
    ...params,
    timestamp: Date.now(),
    recvWindow: env.execution.binance.recvWindow,
  };
  const { serialized, signature } = signParams(finalParams);
  return fetchJson(`${baseUrl}${path}?${serialized}&signature=${signature}`, {
    headers: {
      Accept: 'application/json',
      'X-MBX-APIKEY': env.execution.binance.apiKey,
    },
  });
}

async function insertExecutionHealthCheck({ provider, mode, status, severity, requestedBy, summary }) {
  const result = await pool.query(
    `
      INSERT INTO execution_health_checks (provider, mode, status, severity, requested_by, summary, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      RETURNING id, provider, mode, status, severity, requested_by AS "requestedBy", summary, created_at AS "createdAt"
    `,
    [provider, mode, status, severity, requestedBy, JSON.stringify(summary || {})],
  );
  return result.rows[0];
}

async function insertExecutionReconciliation({ provider, mode, status, requestedBy, summary }) {
  const result = await pool.query(
    `
      INSERT INTO execution_reconciliation_runs (provider, mode, status, requested_by, summary, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      RETURNING id, provider, mode, status, requested_by AS "requestedBy", summary, created_at AS "createdAt"
    `,
    [provider, mode, status, requestedBy, JSON.stringify(summary || {})],
  );
  return result.rows[0];
}

async function listExecutionHealthChecks({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id, provider, mode, status, severity, requested_by AS "requestedBy", summary, created_at AS "createdAt"
      FROM execution_health_checks
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 20), 100))],
  );
  return result.rows;
}

async function listExecutionReconciliations({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id, provider, mode, status, requested_by AS "requestedBy", summary, created_at AS "createdAt"
      FROM execution_reconciliation_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 20), 100))],
  );
  return result.rows;
}

async function runExecutionHealthCheck({ requestedBy = 'dashboard' } = {}) {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);
  const checks = [];
  let status = 'ok';
  let severity = 'positive';

  const startedAt = Date.now();
  const timeResponse = await binancePublicGet('/api/v3/time', summary);
  checks.push({
    check: 'server_time',
    ok: Boolean(timeResponse.ok),
    httpStatus: timeResponse.status,
    latencyMs: Date.now() - startedAt,
  });

  if (!timeResponse.ok) {
    status = 'error';
    severity = 'danger';
  }

  let exchangeInfoResponse = null;
  try {
    exchangeInfoResponse = await binancePublicGet('/api/v3/exchangeInfo?permissions=%5B%22SPOT%22%5D', summary);
    checks.push({
      check: 'exchange_info',
      ok: Boolean(exchangeInfoResponse.ok),
      httpStatus: exchangeInfoResponse.status,
      symbolsCount: Array.isArray(exchangeInfoResponse.payload?.symbols) ? exchangeInfoResponse.payload.symbols.length : 0,
    });
    if (!exchangeInfoResponse.ok && status !== 'error') {
      status = 'warning';
      severity = 'warning';
    }
  } catch (_error) {
    checks.push({ check: 'exchange_info', ok: false, reason: 'exchange_info_fetch_failed' });
    if (status !== 'error') {
      status = 'warning';
      severity = 'warning';
    }
  }

  let accountSnapshot = null;
  if (env.execution.binance.apiKey && env.execution.binance.apiSecret) {
    const accountResponse = await binanceSignedGet('/api/v3/account', {}, summary);
    accountSnapshot = accountResponse.payload;
    checks.push({
      check: 'account_read',
      ok: Boolean(accountResponse.ok),
      httpStatus: accountResponse.status,
      canTrade: Boolean(accountResponse.payload?.canTrade),
      balancesCount: Array.isArray(accountResponse.payload?.balances) ? accountResponse.payload.balances.length : 0,
    });

    if (!accountResponse.ok && status !== 'error') {
      status = 'warning';
      severity = 'warning';
    }
  } else {
    checks.push({
      check: 'account_read',
      ok: false,
      skipped: true,
      reason: 'missing_binance_api_credentials',
    });
    if (status !== 'error') {
      status = 'warning';
      severity = 'warning';
    }
  }

  const row = await insertExecutionHealthCheck({
    provider: summary.provider,
    mode: summary.mode,
    status,
    severity,
    requestedBy,
    summary: {
      configVersion: configRow?.version || 0,
      useTestnet: summary.useTestnet,
      dryRun: summary.dryRun,
      supervised: summary.supervised,
      checks,
      account: accountSnapshot && typeof accountSnapshot === 'object' ? {
        canTrade: Boolean(accountSnapshot.canTrade),
        balancesCount: Array.isArray(accountSnapshot.balances) ? accountSnapshot.balances.length : 0,
        permissions: accountSnapshot.permissions || [],
      } : null,
    },
  });

  publish('execution.healthcheck', row);
  return row;
}

async function runExecutionReconciliation({ requestedBy = 'dashboard', symbols = [] } = {}) {
  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const summary = buildExecutionSummary(config);

  if (!env.execution.binance.apiKey || !env.execution.binance.apiSecret) {
    const row = await insertExecutionReconciliation({
      provider: summary.provider,
      mode: summary.mode,
      status: 'skipped',
      requestedBy,
      summary: {
        reason: 'missing_binance_api_credentials',
        configVersion: configRow?.version || 0,
      },
    });
    publish('execution.reconciliation', row);
    return row;
  }

  const [accountResponse, openOrdersResponse, localPositionsResult] = await Promise.all([
    binanceSignedGet('/api/v3/account', {}, summary),
    binanceSignedGet('/api/v3/openOrders', {}, summary),
    pool.query(
      `
        SELECT symbol, quantity, status, updated_at AS "updatedAt"
        FROM paper_positions
        WHERE status = 'OPEN'
      `,
    ),
  ]);

  const lookbackHours = env.execution.reconciliationLookbackHours;
  const recentAttemptsResult = await pool.query(
    `
      SELECT id, symbol, side, status, external_order_id AS "externalOrderId", created_at AS "createdAt"
      FROM live_order_attempts
      WHERE created_at >= NOW() - ($1::text || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT 200
    `,
    [String(lookbackHours)],
  );

  const recentAttempts = recentAttemptsResult.rows;
  const balances = Array.isArray(accountResponse.payload?.balances) ? accountResponse.payload.balances : [];
  const nonZeroBalances = balances
    .map((item) => ({ asset: item.asset, free: Number(item.free || 0), locked: Number(item.locked || 0) }))
    .filter((item) => (item.free + item.locked) > 0);

  const openOrders = Array.isArray(openOrdersResponse.payload) ? openOrdersResponse.payload : [];
  const filteredOpenOrders = symbols.length
    ? openOrders.filter((item) => symbols.includes(String(item.symbol || '').toUpperCase()))
    : openOrders;

  const trackedSymbols = new Set((config?.trading?.symbols || []).map((item) => String(item).toUpperCase()));
  symbols.forEach((item) => trackedSymbols.add(String(item).toUpperCase()));
  const baseCurrency = String(config?.trading?.baseCurrency || 'USDT').toUpperCase();

  const unmatchedBalances = nonZeroBalances
    .filter((item) => item.asset !== baseCurrency)
    .filter((item) => !trackedSymbols.has(`${item.asset}${baseCurrency}`))
    .slice(0, 20);

  const localPositions = localPositionsResult.rows.map((row) => ({
    symbol: row.symbol,
    quantity: Number(row.quantity || 0),
    status: row.status,
    updatedAt: row.updatedAt,
  }));

  const balanceBySymbol = new Map(nonZeroBalances.map((item) => [`${item.asset}${baseCurrency}`, item]));
  const localOnlyPositions = localPositions.filter((position) => !balanceBySymbol.has(position.symbol));
  const remoteOnlyBalances = nonZeroBalances
    .filter((item) => item.asset !== baseCurrency)
    .map((item) => `${item.asset}${baseCurrency}`)
    .filter((symbol) => !localPositions.some((position) => position.symbol === symbol));

  const status = (accountResponse.ok && openOrdersResponse.ok)
    ? (unmatchedBalances.length || localOnlyPositions.length || remoteOnlyBalances.length ? 'warning' : 'ok')
    : 'error';

  const row = await insertExecutionReconciliation({
    provider: summary.provider,
    mode: summary.mode,
    status,
    requestedBy,
    summary: {
      configVersion: configRow?.version || 0,
      useTestnet: summary.useTestnet,
      dryRun: summary.dryRun,
      recentAttemptsCount: recentAttempts.length,
      remoteOpenOrdersCount: filteredOpenOrders.length,
      remoteNonZeroBalancesCount: nonZeroBalances.length,
      unmatchedBalances,
      localOnlyPositions: localOnlyPositions.slice(0, 20),
      remoteOnlySymbols: remoteOnlyBalances.slice(0, 20),
      mismatchCounts: {
        unmatchedBalances: unmatchedBalances.length,
        localOnlyPositions: localOnlyPositions.length,
        remoteOnlySymbols: remoteOnlyBalances.length,
      },
      openOrdersPreview: filteredOpenOrders.slice(0, 20).map((item) => ({
        symbol: item.symbol,
        side: item.side,
        type: item.type,
        status: item.status,
        origQty: Number(item.origQty || 0),
        executedQty: Number(item.executedQty || 0),
      })),
      recentAttempts: recentAttempts.slice(0, 20),
      checks: [
        { check: 'account_read', ok: Boolean(accountResponse.ok), httpStatus: accountResponse.status },
        { check: 'open_orders_read', ok: Boolean(openOrdersResponse.ok), httpStatus: openOrdersResponse.status },
      ],
    },
  });

  publish('execution.reconciliation', row);
  return row;
}

module.exports = {
  executeOrder,
  getExecutionStatus,
  buildExecutionSummary,
  buildOrderPreview,
  listExecutionActionLogs,
  runExecutionHealthCheck,
  listExecutionHealthChecks,
  runExecutionReconciliation,
  listExecutionReconciliations,
};
