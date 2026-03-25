const express = require('express');
const {
  getExecutionStatus,
  buildOrderPreview,
  listExecutionActionLogs,
  runExecutionHealthCheck,
  listExecutionHealthChecks,
  runExecutionReconciliation,
  listExecutionReconciliations,
  executeOrder,
} = require('../services/executionAdapter.service');

const router = express.Router();

router.get('/status', async (_request, response, next) => {
  try {
    const status = await getExecutionStatus();
    response.json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/action-logs', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listExecutionActionLogs({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/preview', async (request, response, next) => {
  try {
    const { symbol, side, requestedNotional = null, requestedQuantity = null, actor = 'dashboard' } = request.body || {};
    const preview = await buildOrderPreview({ symbol, side, requestedNotional, requestedQuantity, actor });
    response.status(201).json(preview);
  } catch (error) {
    next(error);
  }
});

router.post('/live-submit', async (request, response, next) => {
  try {
    const {
      symbol,
      side,
      requestedNotional = null,
      requestedQuantity = null,
      requestedBy = 'dashboard',
      reason = 'manual_supervised_live_submit',
      confirmationPhrase = '',
      payload = {},
      previewTicketId = null,
    } = request.body || {};

    if (!symbol || !side) {
      response.status(400).json({ error: 'symbol_and_side_required' });
      return;
    }

    const result = await executeOrder({
      workerName: String(requestedBy || 'dashboard-live-supervisor'),
      symbol,
      side,
      requestedNotional,
      requestedQuantity,
      reason,
      payload,
      forceMode: 'live',
      actor: requestedBy,
      confirmationPhrase,
      previewTicketId,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/healthchecks', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listExecutionHealthChecks({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/healthcheck', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || 'dashboard';
    const result = await runExecutionHealthCheck({ requestedBy });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/reconciliations', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listExecutionReconciliations({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/reconcile', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || 'dashboard';
    const symbols = Array.isArray(request.body?.symbols) ? request.body.symbols : [];
    const result = await runExecutionReconciliation({ requestedBy, symbols });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
