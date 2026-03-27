const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

function createExpressMock() {
  const routes = [];
  return {
    routes,
    express: {
      Router() {
        return {
          get(routePath, handler) {
            routes.push({ method: 'GET', path: routePath, handler });
          },
        };
      },
    },
  };
}

test('system routes register expected endpoints', () => {
  const expressMock = createExpressMock();
  const target = path.join(__dirname, '..', 'src', 'routes', 'system.routes.js');
  const router = loadWithMocks(target, {
    express: expressMock.express,
    '../services/systemManifest.service': {
      loadPublicApiContract: () => ({ version: '33.0.0', areas: {} }),
      buildSystemManifest: () => ({ stage: 33, service: 'cripto-ia-system' }),
      evaluateMaintenanceChecklist: () => ({ overallStatus: 'healthy' }),
    },
  });

  assert.ok(router);
  assert.deepEqual(
    expressMock.routes.map((item) => item.path),
    ['/', '/manifest', '/maintenance-checklist', '/contracts/public-api']
  );
});

test('manifest handler returns ok payload', () => {
  const expressMock = createExpressMock();
  const target = path.join(__dirname, '..', 'src', 'routes', 'system.routes.js');
  loadWithMocks(target, {
    express: expressMock.express,
    '../services/systemManifest.service': {
      loadPublicApiContract: () => ({ version: '33.0.0', areas: {} }),
      buildSystemManifest: () => ({ stage: 33, service: 'cripto-ia-system' }),
      evaluateMaintenanceChecklist: () => ({ overallStatus: 'healthy' }),
    },
  });

  const manifestRoute = expressMock.routes.find((item) => item.path === '/manifest');
  let jsonPayload = null;
  manifestRoute.handler({}, { json(payload) { jsonPayload = payload; } });

  assert.equal(jsonPayload.ok, true);
  assert.equal(jsonPayload.data.stage, 33);
  assert.equal(jsonPayload.data.service, 'cripto-ia-system');
});
