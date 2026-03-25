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
const {
  getTrainingSettings,
  updateTrainingSettings,
  listRegimePresets,
  applyRegimePreset,
} = require('../services/trainingAdaptation.service');
const {
  getTrainingRuntimeState,
  activateRuntimeRegime,
  syncRuntimeWithActivePreset,
  reportWorkerRuntime,
} = require('../services/trainingRuntime.service');

const router = express.Router();

function parseTrainingGuardrailError(error) {
  const message = String(error?.message || '');
  const match = message.match(/^training_quality_score_too_low:(.+)$/i);
  if (!match) return null;
  return {
    qualityScore: Number(match[1]),
    minRequired: null,
  };
}

router.get('/summary', async (_request, response, next) => {
  try {
    const summary = await getTrainingSummary();
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (_request, response, next) => {
  try {
    const payload = await getTrainingSettings();
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (request, response, next) => {
  try {
    const { requestedBy = 'dashboard', ...rest } = request.body || {};
    const payload = await updateTrainingSettings(rest, { requestedBy });
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/regime-presets', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listRegimePresets({ limit });
    response.json(items);
  } catch (error) {
    next(error);
  }
});

router.post('/regime-presets/apply', async (request, response, next) => {
  try {
    const { regimeKey, requestedBy = 'dashboard' } = request.body || {};
    const payload = await applyRegimePreset({ regimeKey, requestedBy });
    response.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/runtime', async (_request, response, next) => {
  try {
    const payload = await getTrainingRuntimeState();
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/runtime/activate-regime', async (request, response, next) => {
  try {
    const { regimeKey, requestedBy = 'dashboard' } = request.body || {};
    const payload = await activateRuntimeRegime({ regimeKey, requestedBy });
    response.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/runtime/sync', async (request, response, next) => {
  try {
    const { requestedBy = 'dashboard' } = request.body || {};
    const payload = await syncRuntimeWithActivePreset({ requestedBy });
    response.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/runtime/worker-sync', async (request, response, next) => {
  try {
    const payload = await reportWorkerRuntime(request.body || {});
    response.status(201).json(payload);
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
    const parsed = parseTrainingGuardrailError(error);
    if (!parsed) {
      next(error);
      return;
    }

    let settings = null;
    try {
      settings = await getTrainingSettings();
    } catch (_settingsError) {
      settings = null;
    }

    response.status(201).json({
      ok: true,
      warning: true,
      status: 'completed_with_warning',
      message:
        'O treinamento foi concluído, mas a aplicação automática dos pesos foi bloqueada pelo limiar mínimo de qualidade.',
      qualityScore: parsed.qualityScore,
      minRequired: settings?.settings?.minQualityScoreForApply ?? null,
      settings: settings?.settings || null,
    });
  }
});

module.exports = router;
