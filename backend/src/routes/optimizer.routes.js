
const express = require('express');
const { listOptimizationRuns, getOptimizationRunById, runOptimization } = require('../services/optimizer.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 10);
    const items = await listOptimizationRuns({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/run', async (request, response, next) => {
  try {
    const { label, symbols, interval, confirmationInterval, limit, objective, maxCandidates } = request.body || {};
    const result = await runOptimization({ label, symbols, interval, confirmationInterval, limit, objective, maxCandidates, persist: true });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  try {
    const item = await getOptimizationRunById(Number(request.params.id));
    if (!item) {
      response.status(404).json({ error: 'optimization_not_found' });
      return;
    }
    response.json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
