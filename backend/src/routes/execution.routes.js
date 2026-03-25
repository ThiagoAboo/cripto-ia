const express = require('express');
const {
  getExecutionStatus,
  runExecutionHealthCheck,
  listExecutionHealthChecks,
  runExecutionReconciliation,
  listExecutionReconciliations,
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
