const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

function createExpressMock() {
  return {
    Router() {
      const stack = [];
      return {
        stack,
        get(path, handler) {
          stack.push({ route: { path, methods: { get: true }, stack: [{ handle: handler }] } });
        },
        post(path, handler) {
          stack.push({ route: { path, methods: { post: true }, stack: [{ handle: handler }] } });
        },
      };
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

function getRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method]);
  if (!layer) {
    throw new Error(`route_not_found:${method}:${path}`);
  }
  return layer.route.stack[0].handle;
}

test('POST /walk-forward retorna 201 com payload da validação', async () => {
  const router = loadWithMocks(path.join(__dirname, '../src/routes/backtests.routes'), {
    express: createExpressMock(),
    '../services/backtest.service': {
      runBacktest: async () => ({}),
      compareBacktests: async () => ({}),
      listBacktestRuns: async () => [],
      getBacktestRunById: async () => null,
    },
    '../services/backtestValidation.service': {
      DEFAULT_VALIDATION_SETTINGS: { maxWindows: 4 },
      runWalkForwardValidation: async (payload) => ({ id: 17, ...payload, status: 'completed' }),
      runRobustnessSweep: async () => ({}),
      listValidationRuns: async () => [],
      getValidationRunById: async () => null,
    },
  });

  const handler = getRouteHandler(router, 'post', '/walk-forward');
  const request = { body: { symbol: 'BTCUSDT', candleLimit: 600 } };
  const response = createResponse();
  let nextError = null;

  await handler(request, response, (error) => { nextError = error; });

  assert.equal(nextError, null);
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.id, 17);
  assert.equal(response.payload.symbol, 'BTCUSDT');
});

test('GET /validation/defaults expõe defaults', async () => {
  const router = loadWithMocks(path.join(__dirname, '../src/routes/backtests.routes'), {
    express: createExpressMock(),
    '../services/backtest.service': {
      runBacktest: async () => ({}),
      compareBacktests: async () => ({}),
      listBacktestRuns: async () => [],
      getBacktestRunById: async () => null,
    },
    '../services/backtestValidation.service': {
      DEFAULT_VALIDATION_SETTINGS: { maxWindows: 4, minTrainCandles: 180 },
      runWalkForwardValidation: async () => ({}),
      runRobustnessSweep: async () => ({}),
      listValidationRuns: async () => [],
      getValidationRunById: async () => null,
    },
  });

  const handler = getRouteHandler(router, 'get', '/validation/defaults');
  const response = createResponse();

  await handler({ query: {} }, response, () => {});

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { maxWindows: 4, minTrainCandles: 180 });
});
