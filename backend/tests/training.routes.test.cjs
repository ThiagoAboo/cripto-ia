const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

async function createServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/training', router);

  return await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test('GET /api/training/summary retorna o resumo atual do treinamento', async () => {
  const router = loadWithMocks(
    path.resolve(__dirname, '../src/routes/training.routes.js'),
    {
      '../services/training.service': {
        getTrainingSummary: async () => ({ ok: true, source: 'mock' }),
        listTrainingRuns: async () => [],
        listTrainingRunLogs: async () => [],
        listExpertEvaluationReports: async () => [],
        listModelQualityReports: async () => [],
        listModelDriftReports: async () => [],
        runTrainingAssistance: async () => ({ ok: true }),
      },
      '../services/trainingAdaptation.service': {
        getTrainingSettings: async () => ({ settings: { minQualityScoreForApply: 0.56 } }),
        updateTrainingSettings: async () => ({ ok: true }),
        listRegimePresets: async () => [],
        applyRegimePreset: async () => ({ ok: true }),
      },
      '../services/trainingRuntime.service': {
        getTrainingRuntimeState: async () => ({ ok: true }),
        activateRuntimeRegime: async () => ({ ok: true }),
        syncRuntimeWithActivePreset: async () => ({ ok: true }),
        reportWorkerRuntime: async () => ({ ok: true }),
      },
    },
  );

  const { server, baseUrl } = await createServer(router);
  try {
    const response = await fetch(`${baseUrl}/api/training/summary`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true, source: 'mock' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/training/run converte guardrail de qualidade em warning amigável', async () => {
  const router = loadWithMocks(
    path.resolve(__dirname, '../src/routes/training.routes.js'),
    {
      '../services/training.service': {
        getTrainingSummary: async () => ({ ok: true }),
        listTrainingRuns: async () => [],
        listTrainingRunLogs: async () => [],
        listExpertEvaluationReports: async () => [],
        listModelQualityReports: async () => [],
        listModelDriftReports: async () => [],
        runTrainingAssistance: async () => {
          throw new Error('training_quality_score_too_low:0.44');
        },
      },
      '../services/trainingAdaptation.service': {
        getTrainingSettings: async () => ({ settings: { minQualityScoreForApply: 0.56 } }),
        updateTrainingSettings: async () => ({ ok: true }),
        listRegimePresets: async () => [],
        applyRegimePreset: async () => ({ ok: true }),
      },
      '../services/trainingRuntime.service': {
        getTrainingRuntimeState: async () => ({ ok: true }),
        activateRuntimeRegime: async () => ({ ok: true }),
        syncRuntimeWithActivePreset: async () => ({ ok: true }),
        reportWorkerRuntime: async () => ({ ok: true }),
      },
    },
  );

  const { server, baseUrl } = await createServer(router);
  try {
    const response = await fetch(`${baseUrl}/api/training/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applySuggestedWeights: true }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.warning, true);
    assert.equal(payload.status, 'completed_with_warning');
    assert.equal(payload.qualityScore, 0.44);
    assert.equal(payload.minRequired, 0.56);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
