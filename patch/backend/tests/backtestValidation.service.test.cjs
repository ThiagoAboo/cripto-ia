const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

const fakeCandles = Array.from({ length: 720 }, (_, index) => ({
  openTime: (index + 1) * 60_000,
  closeTime: (index + 2) * 60_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 10 + index,
}));

test('buildWalkForwardWindows cria janelas coerentes', () => {
  const service = loadWithMocks(path.join(__dirname, '../src/services/backtestValidation.service'), {
    '../db/pool': { connect: async () => ({ query: async () => ({}), release() {} }), query: async () => ({ rows: [] }) },
    './config.service': { getActiveConfig: async () => ({ config: {} }) },
    './market.service': { getCandles: async () => ({ candles: fakeCandles }) },
    './backtest.service': { runBacktestFromCandles: async () => ({}), deepMerge: (base, override) => ({ ...base, ...override }) },
  });

  const windows = service.buildWalkForwardWindows({
    totalCandles: 700,
    minTrainCandles: 180,
    minTestCandles: 80,
    stepCandles: 80,
    maxWindows: 4,
  });

  assert.equal(windows.length, 4);
  assert.deepEqual(windows[0], {
    key: 'wf_1',
    index: 0,
    trainStart: 0,
    trainEnd: 180,
    testStart: 180,
    testEnd: 260,
    trainCandles: 180,
    testCandles: 80,
    totalCandles: 260,
  });
});

test('summarizeValidationSegments agrega métricas e recomendação', () => {
  const service = loadWithMocks(path.join(__dirname, '../src/services/backtestValidation.service'), {
    '../db/pool': { connect: async () => ({ query: async () => ({}), release() {} }), query: async () => ({ rows: [] }) },
    './config.service': { getActiveConfig: async () => ({ config: {} }) },
    './market.service': { getCandles: async () => ({ candles: fakeCandles }) },
    './backtest.service': { runBacktestFromCandles: async () => ({}), deepMerge: (base, override) => ({ ...base, ...override }) },
  });

  const summary = service.summarizeValidationSegments([
    { symbol: 'BTCUSDT', regimeLabel: 'trend_bull', metrics: { totalReturnPct: 8, maxDrawdownPct: 4, performanceScore: 0.78 } },
    { symbol: 'BTCUSDT', regimeLabel: 'mixed', metrics: { totalReturnPct: 3, maxDrawdownPct: 5, performanceScore: 0.61 } },
    { symbol: 'ETHUSDT', regimeLabel: 'range', metrics: { totalReturnPct: -1, maxDrawdownPct: 3, performanceScore: 0.52 } },
  ], { mode: 'robustness', objective: 'balanced' });

  assert.equal(summary.mode, 'robustness');
  assert.equal(summary.segmentsCount, 3);
  assert.equal(summary.profitableWindows, 2);
  assert.deepEqual(summary.symbolsCovered, ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(summary.regimesCovered, ['trend_bull', 'mixed', 'range']);
  assert.match(summary.recommendation, /candidate_for_promotion|needs_review/);
});

test('runWalkForwardValidation executa segmentos e retorna summary', async () => {
  const runCalls = [];
  const service = loadWithMocks(path.join(__dirname, '../src/services/backtestValidation.service'), {
    '../db/pool': {
      connect: async () => ({ query: async () => ({ rows: [{ id: 99 }] }), release() {}, }),
      query: async () => ({ rows: [] }),
    },
    './config.service': {
      getActiveConfig: async () => ({
        config: {
          trading: {
            symbols: ['BTCUSDT'],
            primaryTimeframe: '5m',
            confirmationTimeframes: ['15m'],
            lookbackCandles: 700,
          },
        },
      }),
    },
    './market.service': {
      getCandles: async () => ({ candles: fakeCandles }),
    },
    './backtest.service': {
      deepMerge: (base, override) => ({ ...base, ...override }),
      runBacktestFromCandles: async (payload) => {
        runCalls.push(payload);
        return {
          label: payload.label,
          metrics: {
            totalReturnPct: 5,
            maxDrawdownPct: 3,
            performanceScore: 0.71,
            regimeLabel: 'mixed',
          },
        };
      },
    },
  });

  const result = await service.runWalkForwardValidation({
    symbol: 'BTCUSDT',
    candleLimit: 700,
    maxWindows: 3,
    persist: false,
  });

  assert.equal(result.mode, 'walk_forward');
  assert.equal(result.segments.length, 3);
  assert.equal(runCalls.length, 3);
  assert.equal(runCalls[0].evaluationStartIndex, 180);
  assert.equal(result.summary.profitableWindows, 3);
});
