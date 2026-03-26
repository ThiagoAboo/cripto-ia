import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONFIG,
  deepMerge,
  mergeConfigWithDefaults,
  updateAtPath,
  parseNumberInput,
  traduzirRegime,
  traduzirEspecialista,
  traduzirChaveJob,
} from './dashboard.js';

test('deepMerge preserva base e aplica override apenas onde necessário', () => {
  const result = deepMerge(
    { a: 1, nested: { enabled: true, threshold: 10 } },
    { nested: { threshold: 25 } },
  );

  assert.deepEqual(result, {
    a: 1,
    nested: { enabled: true, threshold: 25 },
  });
});

test('mergeConfigWithDefaults aplica defaults nas chaves ausentes', () => {
  const result = mergeConfigWithDefaults({
    trading: { enabled: true },
    training: { enabled: false },
  });

  assert.equal(result.trading.enabled, true);
  assert.equal(result.trading.mode, DEFAULT_CONFIG.trading.mode);
  assert.equal(result.training.enabled, false);
  assert.equal(result.training.evaluationWindowDays, DEFAULT_CONFIG.training.evaluationWindowDays);
});

test('updateAtPath atualiza caminho profundo sem mutar o objeto base', () => {
  const base = mergeConfigWithDefaults();
  const next = updateAtPath(base, 'training.minQualityScoreForApply', 0.73);

  assert.equal(base.training.minQualityScoreForApply, 0.56);
  assert.equal(next.training.minQualityScoreForApply, 0.73);
});

test('parseNumberInput retorna fallback para valores inválidos', () => {
  assert.equal(parseNumberInput('12.5', 0), 12.5);
  assert.equal(parseNumberInput('abc', 9), 9);
});

test('tradutores principais retornam rótulos em português', () => {
  assert.equal(traduzirRegime('trend_bull'), 'tendência de alta');
  assert.equal(traduzirEspecialista('volatility'), 'volatilidade');
  assert.equal(traduzirChaveJob('observability_snapshot'), 'instantâneo de observabilidade');
});
