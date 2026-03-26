import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeValidationBadge,
  runWalkForwardValidation,
} from './backtest-validation.js';

test('summarizeValidationBadge classifica score alto como robusto', () => {
  assert.deepEqual(summarizeValidationBadge({ stabilityScore: 79.4 }), {
    tone: 'success',
    label: 'Robusto',
  });
});

test('runWalkForwardValidation envia POST json', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: 11, status: 'completed' }),
    };
  };

  const result = await runWalkForwardValidation({ symbol: 'BTCUSDT', candleLimit: 600 }, fakeFetch);

  assert.equal(result.id, 11);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/backtests\/walk-forward$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    symbol: 'BTCUSDT',
    candleLimit: 600,
  });
});
