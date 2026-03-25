const express = require('express');
const env = require('../config/env');
const pool = require('../db/pool');
const { publish, publishStatusSnapshot } = require('../services/eventBus.service');
const { executeOrder } = require('../services/executionAdapter.service');
const { syncPaperPositionRisk } = require('../services/execution.service');
const {
  upsertSocialScores,
  createSocialAlert,
  upsertProviderStatus,
} = require('../services/social.service');
const { getSystemStatus } = require('../services/status.service');

const router = express.Router();

router.use((request, response, next) => {
  const apiKey = request.header('x-internal-api-key');

  if (apiKey !== env.internalApiKey) {
    response.status(401).json({ error: 'unauthorized_internal_call' });
    return;
  }

  next();
});

router.post('/heartbeat', async (request, response, next) => {
  try {
    const { workerName, status = 'running', payload = {} } = request.body || {};

    if (!workerName) {
      response.status(400).json({ error: 'workerName is required' });
      return;
    }

    await pool.query(
      `
        INSERT INTO worker_heartbeats (worker_name, status, payload, last_seen_at, updated_at)
        VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        ON CONFLICT (worker_name)
        DO UPDATE SET
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          last_seen_at = NOW(),
          updated_at = NOW()
      `,
      [workerName, status, JSON.stringify(payload)],
    );

    publish('worker.heartbeat', {
      workerName,
      status,
      payload,
      timestamp: new Date().toISOString(),
    });

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/events', async (request, response, next) => {
  try {
    const { eventType, source = 'unknown', payload = {} } = request.body || {};

    if (!eventType) {
      response.status(400).json({ error: 'eventType is required' });
      return;
    }

    const result = await pool.query(
      `
        INSERT INTO system_events (event_type, source, payload)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id, event_type, source, payload, created_at
      `,
      [eventType, source, JSON.stringify(payload)],
    );

    publish('system.event', result.rows[0]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/decisions', async (request, response, next) => {
  try {
    const {
      workerName,
      symbol,
      action,
      confidence = 0,
      blocked = false,
      reason = null,
      payload = {},
    } = request.body || {};

    if (!workerName || !symbol || !action) {
      response.status(400).json({ error: 'workerName, symbol and action are required' });
      return;
    }

    const result = await pool.query(
      `
        INSERT INTO ai_decisions (worker_name, symbol, action, confidence, blocked, reason, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id, worker_name, symbol, action, confidence, blocked, reason, payload, created_at
      `,
      [workerName, symbol, action, confidence, blocked, reason, JSON.stringify(payload)],
    );

    publish('ai.decision', result.rows[0]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

async function handleExecutionRequest(request, response, next, forceMode = null) {
  try {
    const {
      workerName,
      symbol,
      side,
      reason = null,
      linkedDecisionId = null,
      requestedNotional = null,
      requestedQuantity = null,
      payload = {},
      actor = 'worker',
      confirmationPhrase = '',
    } = request.body || {};

    if (!workerName || !symbol || !side) {
      response.status(400).json({ error: 'workerName, symbol and side are required' });
      return;
    }

    const order = await executeOrder({
      workerName,
      symbol,
      side,
      reason,
      linkedDecisionId,
      requestedNotional,
      requestedQuantity,
      payload,
      forceMode,
      actor,
      confirmationPhrase,
    });

    const eventName = forceMode === 'paper' || order.accountKey ? 'paper.order' : 'execution.order';
    publish(eventName, order);
    publish('portfolio.updated', {
      symbol: order.symbol,
      side: order.side,
      status: order.status,
      orderId: order.id,
      mode: forceMode || null,
      timestamp: new Date().toISOString(),
    });

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    response.status(201).json(order);
  } catch (error) {
    next(error);
  }
}

router.post('/orders/execute', (request, response, next) => handleExecutionRequest(request, response, next));
router.post('/orders/paper', (request, response, next) => handleExecutionRequest(request, response, next, 'paper'));

router.post('/positions/risk-sync', async (request, response, next) => {
  try {
    const {
      symbol,
      highestPrice = null,
      trailingStopPrice = null,
      stopLossPrice = null,
      takeProfitPrice = null,
      riskStatus = null,
      metadataPatch = {},
    } = request.body || {};

    if (!symbol) {
      response.status(400).json({ error: 'symbol is required' });
      return;
    }

    const result = await syncPaperPositionRisk({
      symbol,
      highestPrice,
      trailingStopPrice,
      stopLossPrice,
      takeProfitPrice,
      riskStatus,
      metadataPatch,
    });

    if (result) {
      publish('portfolio.risk', result);
    }

    response.json({ ok: true, item: result });
  } catch (error) {
    next(error);
  }
});

router.post('/social/scores', async (request, response, next) => {
  try {
    const items = Array.isArray(request.body?.items) ? request.body.items : [];
    const saved = await upsertSocialScores(items);

    for (const item of saved) {
      publish('social.update', item);
    }

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    response.status(201).json({ count: saved.length, items: saved });
  } catch (error) {
    next(error);
  }
});

router.post('/social/alerts', async (request, response, next) => {
  try {
    const {
      symbol,
      alertType,
      severity,
      action = null,
      message,
      payload = {},
    } = request.body || {};

    if (!symbol || !alertType || !severity || !message) {
      response.status(400).json({ error: 'symbol, alertType, severity and message are required' });
      return;
    }

    const alert = await createSocialAlert({
      symbol,
      alertType,
      severity,
      action,
      message,
      payload,
    });

    publish('social.alert', alert);

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    response.status(201).json(alert);
  } catch (error) {
    next(error);
  }
});

router.post('/social/providers/status', async (request, response, next) => {
  try {
    const {
      providerKey,
      providerName,
      status,
      mode = 'free',
      lastHttpStatus = null,
      retryAfterAt = null,
      payload = {},
    } = request.body || {};

    if (!providerKey || !status) {
      response.status(400).json({ error: 'providerKey and status are required' });
      return;
    }

    const item = await upsertProviderStatus({
      providerKey,
      providerName,
      status,
      mode,
      lastHttpStatus,
      retryAfterAt,
      payload,
    });

    publish('social.provider', item);

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
