import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  mergeConfigWithDefaults,
  updateAtPath,
  parseNumberInput,
  traduzirRegime,
  traduzirEspecialista,
  traduzirSimNao,
} from './dashboard.js';

test('mergeConfigWithDefaults preserves defaults and applies nested overrides', () => {
  const merged = mergeConfigWithDefaults({
    trading: {
      enabled: true,
      symbols: ['BTCUSDT'],
    },
    training: {
      minQualityScoreForApply: 0.66,
    },
  });

  assert.equal(merged.trading.enabled, true);
  assert.deepEqual(merged.trading.symbols, ['BTCUSDT']);
  assert.equal(merged.training.minQualityScoreForApply, 0.66);
  assert.equal(merged.execution.live.enabled, DEFAULT_CONFIG.execution.live.enabled);
});

test('updateAtPath updates nested fields without mutating the original object', () => {
  const original = mergeConfigWithDefaults();
  const updated = updateAtPath(original, 'risk.maxRiskPerTradePct', 2.5);

  assert.notEqual(updated, original);
  assert.equal(updated.risk.maxRiskPerTradePct, 2.5);
  assert.equal(original.risk.maxRiskPerTradePct, DEFAULT_CONFIG.risk.maxRiskPerTradePct);
});

test('parseNumberInput returns fallback for invalid values', () => {
  assert.equal(parseNumberInput('42.5', 0), 42.5);
  assert.equal(parseNumberInput('abc', 7), 7);
});

test('translation helpers map known keys to labels in pt-BR', () => {
  assert.equal(traduzirRegime('trend_bull'), 'tendência de alta');
  assert.equal(traduzirEspecialista('risk'), 'risco');
  assert.equal(traduzirSimNao(true), 'sim');
  assert.equal(traduzirSimNao(false), 'não');
});
