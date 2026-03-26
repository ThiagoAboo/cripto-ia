import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumber,
  formatPercent,
  formatMoney,
  formatDateTime,
  formatList,
} from './format.js';

test('formatNumber and formatPercent use pt-BR conventions', () => {
  assert.equal(formatNumber(1234.5, 2), '1.234,50');
  assert.equal(formatPercent(12.3456, 2), '12,35%');
});

test('formatMoney supports BRL and generic quote assets', () => {
  assert.match(formatMoney(1500, 'BRL'), /R\$\s?1\.500,00/);
  assert.equal(formatMoney(1500, 'USDT'), 'USDT 1.500,00');
});

test('formatDateTime handles empty and invalid values safely', () => {
  assert.equal(formatDateTime(''), '—');
  assert.equal(formatDateTime('not-a-date'), '—');
  assert.notEqual(formatDateTime('2026-03-26T12:30:00.000Z'), '—');
});

test('formatList returns a human readable list or dash fallback', () => {
  assert.equal(formatList(['BTC', 'ETH', 'SOL']), 'BTC, ETH, SOL');
  assert.equal(formatList([]), '—');
});
