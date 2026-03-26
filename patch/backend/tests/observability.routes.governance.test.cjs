const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

function createExpressMock() {
  return {
    Router() {
      const routes = [];
      return {
        routes,
        get(path, handler) { routes.push({ method: 'GET', path, handler }); },
        post(path, handler) { routes.push({ method: 'POST', path, handler }); },
      };
    },
  };
}

test('observability routes expõem governance overview/history/run', async () => {
  const expressMock = createExpressMock();
  const router = loadWithMocks('./src/routes/observability.routes.js', {
    express: expressMock,
    '../services/observability.service': {
      getObservabilitySummary: async () => ({}),
      listObservabilitySnapshots: async () => [],
      insertObservabilitySnapshot: async () => ({}),
      exportObservabilityData: async () => ({ contentType: 'application/json', filename: 'x.json', body: '{}' }),
    },
    '../services/governanceAssessment.service': {
      getGovernanceOverview: async () => ({ current: { id: 1 } }),
      listGovernanceReports: async () => ([{ id: 1 }]),
      insertGovernanceReport: async () => ({ id: 2 }),
    },
  });

  const paths = router.routes.map((item) => `${item.method} ${item.path}`);
  assert.ok(paths.includes('GET /governance'));
  assert.ok(paths.includes('GET /governance/history'));
  assert.ok(paths.includes('POST /governance/run'));
});
