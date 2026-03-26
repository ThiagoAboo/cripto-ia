import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatNumber,
  formatPercent,
  formatMoney,
  formatDateTime,
  formatList,
} from './format.js';

test('formatNumber e formatPercent usam locale pt-BR', () => {
  assert.equal(formatNumber(1234.5, 1), '1.234,5');
  assert.equal(formatPercent(12.3456, 2), '12,35%');
});

test('formatMoney suporta BRL e fallback textual para outros ativos', () => {
  assert.match(formatMoney(25, 'BRL'), /R\$\s?25,00/);
  assert.equal(formatMoney(25, 'USDT'), 'USDT 25,00');
});

test('formatDateTime protege valores inválidos e formatList trata vazios', () => {
  assert.equal(formatDateTime(''), '—');
  assert.equal(formatDateTime('invalid-date'), '—');
  assert.equal(formatList([]), '—');
  assert.equal(formatList(['BTC', 'ETH']), 'BTC, ETH');
});
