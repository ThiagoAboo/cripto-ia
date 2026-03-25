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
const { getActiveConfig, updateActiveConfig } = require('../services/config.service');

const router = express.Router();

const DEFAULT_TRAINING_SETTINGS = {
  minQualityScoreForApply: 0.56,
  autoApplyMode: 'guarded',
  allowApplyWithWarning: false,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractTrainingSettings(config = {}) {
  const training = config?.training || {};
  return {
    ...DEFAULT_TRAINING_SETTINGS,
    ...training,
    minQualityScoreForApply: toNumber(
      training?.minQualityScoreForApply,
      DEFAULT_TRAINING_SETTINGS.minQualityScoreForApply,
    ),
    allowApplyWithWarning: Boolean(training?.allowApplyWithWarning),
    autoApplyMode: String(training?.autoApplyMode || DEFAULT_TRAINING_SETTINGS.autoApplyMode),
  };
}

async function getNormalizedTrainingSettings() {
  const activeConfig = await getActiveConfig();
  return {
    configVersion: activeConfig?.version || null,
    settings: extractTrainingSettings(activeConfig?.config || {}),
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
    const result = await getNormalizedTrainingSettings();
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (request, response, next) => {
  try {
    const current = await getActiveConfig();
    const nextSettings = {
      ...extractTrainingSettings(current?.config || {}),
      ...(request.body || {}),
    };

    const nextConfig = {
      ...(current?.config || {}),
      training: {
        ...(current?.config?.training || {}),
        minQualityScoreForApply: toNumber(
          nextSettings.minQualityScoreForApply,
          DEFAULT_TRAINING_SETTINGS.minQualityScoreForApply,
        ),
        autoApplyMode: String(nextSettings.autoApplyMode || DEFAULT_TRAINING_SETTINGS.autoApplyMode),
        allowApplyWithWarning: Boolean(nextSettings.allowApplyWithWarning),
      },
    };

    const updated = await updateActiveConfig(nextConfig, {
      actor: 'dashboard',
      actionType: 'training_settings_update',
      reason: 'training_settings_update',
      metadata: {
        source: 'training_page',
      },
    });

    response.json({
      ok: true,
      configVersion: updated?.version || null,
      settings: extractTrainingSettings(updated?.config || {}),
      message: 'Configurações de treinamento atualizadas com sucesso.',
    });
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

    response.status(201).json({
      ok: true,
      warning: false,
      status: 'completed',
      ...result,
    });
  } catch (error) {
    const message = String(error?.message || '');

    if (message.startsWith('training_quality_score_too_low:')) {
      try {
        const qualityScore = Number(message.split(':')[1] || 0);
        const { settings } = await getNormalizedTrainingSettings();

        response.status(200).json({
          ok: true,
          warning: true,
          status: 'completed_with_warning',
          code: 'training_quality_score_too_low',
          qualityScore,
          minRequired: settings.minQualityScoreForApply,
          applySuggestedWeightsApplied: false,
          message:
            'O treinamento terminou, mas os pesos sugeridos não foram aplicados automaticamente porque a pontuação de qualidade ficou abaixo do mínimo configurado.',
          recommendation:
            'Rode novamente sem aplicação automática ou diminua o limiar com bastante cautela após revisar os relatórios.',
        });
        return;
      } catch (_fallbackError) {
        response.status(200).json({
          ok: true,
          warning: true,
          status: 'completed_with_warning',
          code: 'training_quality_score_too_low',
          message:
            'O treinamento terminou, mas a aplicação automática dos pesos foi bloqueada pela regra mínima de qualidade.',
        });
        return;
      }
    }

    next(error);
  }
});

module.exports = router;
