const express = require('express');
const {
  runBacktest,
  compareBacktests,
  listBacktestRuns,
  getBacktestRunById,
} = require('../services/backtest.service');
const {
  DEFAULT_VALIDATION_SETTINGS,
  runWalkForwardValidation,
  runRobustnessSweep,
  listValidationRuns,
  getValidationRunById,
} = require('../services/backtestValidation.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listBacktestRuns({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/validation/defaults', async (request, response, next) => {
  try {
    response.json(DEFAULT_VALIDATION_SETTINGS);
  } catch (error) {
    next(error);
  }
});

router.get('/validation-runs', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listValidationRuns({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/run', async (request, response, next) => {
  try {
    const { label, symbol, interval, confirmationInterval, limit, configOverride } = request.body || {};
    const result = await runBacktest({
      label,
      symbol,
      interval,
      confirmationInterval,
      limit,
      configOverride,
      persist: true,
      meta: { initiatedBy: 'dashboard' },
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/compare', async (request, response, next) => {
  try {
    const { symbol, interval, confirmationInterval, limit, challengerConfig, baseConfig } = request.body || {};
    const result = await compareBacktests({
      symbol,
      interval,
      confirmationInterval,
      limit,
      challengerConfig,
      baseConfig,
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/walk-forward', async (request, response, next) => {
  try {
    const {
      label,
      symbol,
      interval,
      confirmationInterval,
      candleLimit,
      objective,
      minTrainCandles,
      minTestCandles,
      stepCandles,
      maxWindows,
      configOverride,
    } = request.body || {};

    const result = await runWalkForwardValidation({
      label,
      symbol,
      interval,
      confirmationInterval,
      candleLimit,
      objective,
      minTrainCandles,
      minTestCandles,
      stepCandles,
      maxWindows,
      configOverride,
      persist: true,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/robustness', async (request, response, next) => {
  try {
    const {
      label,
      symbols,
      interval,
      confirmationInterval,
      candleLimits,
      objective,
      configOverride,
    } = request.body || {};

    const result = await runRobustnessSweep({
      label,
      symbols,
      interval,
      confirmationInterval,
      candleLimits,
      objective,
      configOverride,
      persist: true,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/validation-runs/:id', async (request, response, next) => {
  try {
    const run = await getValidationRunById(Number(request.params.id));
    if (!run) {
      response.status(404).json({ error: 'validation_run_not_found' });
      return;
    }
    response.json(run);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  try {
    const run = await getBacktestRunById(Number(request.params.id));
    if (!run) {
      response.status(404).json({ error: 'backtest_not_found' });
      return;
    }
    response.json(run);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
