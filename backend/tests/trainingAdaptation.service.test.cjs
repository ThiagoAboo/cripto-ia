const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

const TARGET = path.resolve(__dirname, '../../src/services/trainingAdaptation.service.js');

function buildService(overrides = {}) {
  const updateCalls = [];

  const defaultMocks = {
    './config.service': {
      getActiveConfig: async () => ({
        version: 7,
        updated_at: '2026-03-26T12:00:00.000Z',
        config: {
          training: {
            expertWeights: {
              trend: 0.2,
              momentum: 0.2,
              volatility: 0.1,
              liquidity: 0.1,
              regime: 0.15,
              pattern: 0.15,
              risk: 0.1,
            },
            activeRegimePreset: 'mixed',
            adaptiveExpertsEnabled: true,
            adaptiveRegimePresetsEnabled: true,
            regimeExpertPresets: {},
          },
        },
      }),
      updateActiveConfig: async (nextConfig, audit) => {
        updateCalls.push({ nextConfig, audit });
        return {
          version: 8,
          config: nextConfig,
        };
      },
    },
    './training.service': {
      listExpertEvaluationReports: async () => ([
        { expertKey: 'trend', suggestedWeight: 0.31, contributionScore: 0.31 },
        { expertKey: 'trend', suggestedWeight: 0.29, contributionScore: 0.29 },
        { expertKey: 'momentum', suggestedWeight: 0.22, contributionScore: 0.22 },
        { expertKey: 'volatility', suggestedWeight: 0.12, contributionScore: 0.12 },
        { expertKey: 'liquidity', suggestedWeight: 0.08, contributionScore: 0.08 },
        { expertKey: 'regime', suggestedWeight: 0.09, contributionScore: 0.09 },
        { expertKey: 'pattern', suggestedWeight: 0.08, contributionScore: 0.08 },
        { expertKey: 'risk', suggestedWeight: 0.1, contributionScore: 0.1 },
      ]),
      listModelQualityReports: async () => ([
        { qualityScore: 0.82, qualityStatus: 'healthy' },
      ]),
      listModelDriftReports: async () => ([
        { driftScore: 0.12, driftStatus: 'low' },
      ]),
    },
    ...overrides,
  };

  const service = loadWithMocks(TARGET, defaultMocks);
  return { service, updateCalls };
}

function sumWeights(weights) {
  return Object.values(weights).reduce((acc, value) => acc + Number(value || 0), 0);
}

test('listRegimePresets returns all supported presets with normalized weights', async () => {
  const { service } = buildService();

  const result = await service.listRegimePresets({ limit: 10 });

  assert.ok(result.baseWeights);
  assert.ok(result.suggestedBase);
  assert.equal(result.presets.length, 5);

  const presetKeys = result.presets.map((item) => item.regimeKey).sort();
  assert.deepEqual(presetKeys, ['mixed', 'range', 'trend_bear', 'trend_bull', 'volatile']);

  for (const preset of result.presets) {
    const total = sumWeights(preset.weights);
    assert.ok(Math.abs(total - 1) < 0.02, `weights for ${preset.regimeKey} should be normalized`);
    assert.equal(typeof preset.intensity, 'number');
  }

  const mixedPreset = result.presets.find((item) => item.regimeKey === 'mixed');
  assert.equal(mixedPreset.isApplied, true);
});

test('applyRegimePreset updates active config with selected preset and audit metadata', async () => {
  const { service, updateCalls } = buildService();

  const result = await service.applyRegimePreset({ regimeKey: 'trend_bull', requestedBy: 'unit-test' });

  assert.equal(result.preset.regimeKey, 'trend_bull');
  assert.equal(result.configVersion, 8);
  assert.equal(updateCalls.length, 1);

  const [{ nextConfig, audit }] = updateCalls;
  assert.equal(nextConfig.training.activeRegimePreset, 'trend_bull');
  assert.ok(nextConfig.training.expertWeights);
  assert.equal(audit.actionType, 'training_regime_preset_apply');
  assert.equal(audit.actor, 'unit-test');
  assert.equal(audit.metadata.regimeKey, 'trend_bull');
});

test('updateTrainingSettings merges defaults, current config and incoming patch', async () => {
  const { service, updateCalls } = buildService();

  const result = await service.updateTrainingSettings(
    {
      minQualityScoreForApply: 0.67,
      maxWeightShiftPerRun: 0.05,
    },
    { requestedBy: 'unit-test' },
  );

  assert.equal(result.settings.minQualityScoreForApply, 0.67);
  assert.equal(result.settings.maxWeightShiftPerRun, 0.05);
  assert.equal(result.settings.autoApplyMode, 'guarded');

  assert.equal(updateCalls.length, 1);
  const [{ audit }] = updateCalls;
  assert.equal(audit.actionType, 'training_settings_update');
  assert.equal(audit.actor, 'unit-test');
  assert.deepEqual(audit.metadata.changedKeys.sort(), ['maxWeightShiftPerRun', 'minQualityScoreForApply']);
});
