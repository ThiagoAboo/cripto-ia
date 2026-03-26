const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

const routePath = path.resolve(__dirname, '../src/routes/decisions.routes.js');

function createRouterRecorder() {
  return {
    routes: [],
    get(path, handler) {
      this.routes.push({ method: 'GET', path, handler });
    },
    post(path, handler) {
      this.routes.push({ method: 'POST', path, handler });
    },
  };
}

function loadRouterWithMocks(mocks) {
  const router = createRouterRecorder();
  loadWithMocks(routePath, {
    express: { Router: () => router },
    ...mocks,
  });
  return router;
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

test('GET / preserves recent decision listing', async () => {
  const router = loadRouterWithMocks({
    '../services/portfolio.service': {
      listRecentDecisions: async () => [{ id: 1, symbol: 'BTCUSDT', action: 'BUY' }],
    },
    '../services/decisionPolicy.service': {
      DEFAULT_GUARDRAILS: { maxSpreadPct: 0.35 },
      DEFAULT_REGIME_POLICIES: { mixed: { confidenceMultiplier: 1 } },
      hardenDecision: (input) => input,
    },
  });

  const route = router.routes.find((item) => item.method === 'GET' && item.path === '/');
  const response = createResponse();
  await route.handler({ query: { limit: '10' } }, response, () => {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.count, 1);
  assert.equal(response.payload.items[0].symbol, 'BTCUSDT');
});

test('GET /policy/defaults exposes policy defaults', async () => {
  const router = loadRouterWithMocks({
    '../services/portfolio.service': { listRecentDecisions: async () => [] },
    '../services/decisionPolicy.service': {
      DEFAULT_GUARDRAILS: { maxSpreadPct: 0.35 },
      DEFAULT_REGIME_POLICIES: { mixed: { confidenceMultiplier: 1 } },
      hardenDecision: () => ({}),
    },
  });

  const route = router.routes.find((item) => item.method === 'GET' && item.path === '/policy/defaults');
  const response = createResponse();
  await route.handler({}, response);

  assert.equal(response.payload.guardrails.maxSpreadPct, 0.35);
  assert.equal(response.payload.regimes.mixed.confidenceMultiplier, 1);
});

test('POST /preview returns hardened decision payload', async () => {
  const router = loadRouterWithMocks({
    '../services/portfolio.service': { listRecentDecisions: async () => [] },
    '../services/decisionPolicy.service': {
      DEFAULT_GUARDRAILS: { maxSpreadPct: 0.35 },
      DEFAULT_REGIME_POLICIES: { mixed: { confidenceMultiplier: 1 } },
      hardenDecision: () => ({ effectiveAction: 'HOLD', blocked: true }),
    },
  });

  const route = router.routes.find((item) => item.method === 'POST' && item.path === '/preview');
  const response = createResponse();
  await route.handler({ body: { action: 'BUY' } }, response, () => {});

  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.effectiveAction, 'HOLD');
  assert.equal(response.payload.blocked, true);
});
