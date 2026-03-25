const express = require('express');
const {
  getTrainingSummary,
  listTrainingRuns,
  listTrainingRunLogs,
  listExpertEvaluationReports,
  listModelQualityReports,
  listModelDriftReports,
  runTrainingAssistance,
} = require('../services/training.service');

const router = express.Router();

router.get('/summary', async (_request, response, next) => {
  try {
    const summary = await getTrainingSummary();
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/logs', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 80);
    const trainingRunId = request.query.trainingRunId ? Number(request.query.trainingRunId) : null;
    const items = await listTrainingRunLogs({ limit, trainingRunId });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/runs', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 10);
    const items = await listTrainingRuns({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:id/logs', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 80);
    const trainingRunId = Number(request.params.id);
    const items = await listTrainingRunLogs({ limit, trainingRunId });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/quality-reports', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 10);
    const items = await listModelQualityReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/drift-reports', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 10);
    const items = await listModelDriftReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/expert-reports', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 10);
    const items = await listExpertEvaluationReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/run', async (request, response, next) => {
  try {
    const {
      label = 'manual-training-assistance',
      objective = 'quality_assistance',
      windowDays = 14,
      symbolScope = null,
      requestedBy = 'dashboard',
      applySuggestedWeights = false,
    } = request.body || {};

    const result = await runTrainingAssistance({
      label,
      objective,
      windowDays,
      symbolScope,
      requestedBy,
      applySuggestedWeights,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
