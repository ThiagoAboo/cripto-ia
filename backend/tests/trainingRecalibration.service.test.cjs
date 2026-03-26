const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

const servicePath = path.resolve(__dirname, '../src/services/trainingRecalibration.service.js');

function loadService() {
  return loadWithMocks(servicePath, {
    '../db/pool': { query: async () => ({ rows: [] }) },
    '../config/env': { scheduling: { trainingRecalibrationIntervalSec: 3600 } },
    './config.service': {
      getActiveConfig: async () => ({ version: 3, config: { ai: { expertWeights: { trend: 0.2, momentum: 0.2, volatility: 0.1, liquidity: 0.1, regime: 0.15, pattern: 0.1, risk: 0.15 } }, training: {} } }),
      updateActiveConfig: async () => ({ version: 4, config: {} }),
      deepMerge: (left, right) => ({ ...left, ...right }),
    },
    './training.service': {
      deriveTrainingInsight: async () => ({
        windowDays: 14,
        symbols: ['BTCUSDT'],
        qualitySummary: { qualityScore: 0.7, qualityStatus: 'healthy' },
        driftSummary: { driftScore: 0.2, driftLevel: 'low' },
        suggestedWeights: { trend: 0.28, momentum: 0.21, volatility: 0.1, liquidity: 0.1, regime: 0.13, pattern: 0.08, risk: 0.1 },
        expertEvaluations: [],
        stats: { decisionsAnalyzed: 40 },
      }),
    },
    './trainingAdaptation.service': {
      getTrainingSettings: async () => ({ settings: { minQualityScoreForApply: 0.56, allowApplyWithWarning: false, maxWeightShiftPerRun: 0.15 } }),
    },
    './trainingRuntime.service': {
      getTrainingRuntimeState: async () => ({ runtime: { currentRegime: 'mixed', effectiveExpertWeights: { trend: 0.22, momentum: 0.18, volatility: 0.14, liquidity: 0.12, regime: 0.12, pattern: 0.12, risk: 0.1 } } }),
    },
  });
}

test('limitWeightShift caps deltas and keeps normalization', () => {
  const { _internals } = loadService();
  const next = _internals.limitWeightShift(
    { trend: 0.2, momentum: 0.2, volatility: 0.1, liquidity: 0.1, regime: 0.15, pattern: 0.1, risk: 0.15 },
    { trend: 0.6, momentum: 0.1, volatility: 0.05, liquidity: 0.05, regime: 0.1, pattern: 0.05, risk: 0.05 },
    0.1,
  );

  assert.ok(next.trend > 0.2, 'trend should increase');
  assert.ok(next.risk < 0.15, 'risk should decrease');
  const total = Object.values(next).reduce((sum, value) => sum + value, 0);
  assert.equal(Number(total.toFixed(4)), 1);
});

test('normalizeExpertSignalsFromPayload understands buy/sell expert payload', () => {
  const { _internals } = loadService();
  const signals = _internals.normalizeExpertSignalsFromPayload({
    experts: {
      trend: { buy: 0.8, sell: 0.1 },
      risk: { buy: 0.0, sell: 1.0, label: 'max_risk_block' },
    },
  });

  assert.equal(Number(signals.trend.numeric.toFixed(4)), 0.7);
  assert.equal(signals.trend.confidence, 0.8);
  assert.equal(signals.risk.numeric, -1);
});

test('buildRecommendationSummary flags guardrails and degraded experts', () => {
  const { _internals } = loadService();
  const summary = _internals.buildRecommendationSummary({
    insight: {
      windowDays: 14,
      symbols: ['BTCUSDT'],
      qualitySummary: { qualityScore: 0.72, qualityStatus: 'healthy' },
      driftSummary: { driftScore: 0.28, driftLevel: 'low' },
      suggestedWeights: { trend: 0.3, momentum: 0.2, volatility: 0.09, liquidity: 0.1, regime: 0.11, pattern: 0.08, risk: 0.12 },
      expertEvaluations: [
        { expert: 'trend', currentWeight: 0.2, qualityScore: 0.82, qualityLabel: 'healthy', contributionScore: 0.22, supportRate: 0.7, hitRate: 0.68 },
        { expert: 'risk', currentWeight: 0.15, qualityScore: 0.32, qualityLabel: 'poor', contributionScore: -0.12, supportRate: 0.4, hitRate: 0.3 },
      ],
      stats: { decisionsAnalyzed: 50 },
    },
    performance: { regimes: [], expertsByRegime: [] },
    settings: { settings: { minQualityScoreForApply: 0.56, maxWeightShiftPerRun: 0.1, allowApplyWithWarning: false } },
    activeConfig: { ai: { expertWeights: { trend: 0.2, momentum: 0.2, volatility: 0.1, liquidity: 0.1, regime: 0.15, pattern: 0.1, risk: 0.15 } }, training: {} },
    runtimePayload: { runtime: { currentRegime: 'trend_bull', effectiveExpertWeights: { trend: 0.22, momentum: 0.18, volatility: 0.14, liquidity: 0.12, regime: 0.12, pattern: 0.12, risk: 0.1 } } },
  });

  assert.equal(summary.safeToApply, true);
  assert.ok(summary.degradedExperts.includes('risk'));
  assert.equal(summary.currentRegime, 'trend_bull');
  assert.ok(summary.weightDiff.some((item) => item.expertKey === 'trend' && item.delta > 0));
});
