const express = require('express');
const env = require('../config/env');
const pool = require('../db/pool');
const { publish, publishStatusSnapshot } = require('../services/eventBus.service');
const { executePaperOrder } = require('../services/execution.service');
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

router.post('/orders/paper', async (request, response, next) => {
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
    } = request.body || {};

    if (!workerName || !symbol || !side) {
      response.status(400).json({ error: 'workerName, symbol and side are required' });
      return;
    }

    const order = await executePaperOrder({
      workerName,
      symbol,
      side,
      reason,
      linkedDecisionId,
      requestedNotional,
      requestedQuantity,
      payload,
    });

    publish('paper.order', order);
    publish('portfolio.updated', {
      accountKey: order.accountKey,
      symbol: order.symbol,
      side: order.side,
      status: order.status,
      orderId: order.id,
      timestamp: new Date().toISOString(),
    });

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    response.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
