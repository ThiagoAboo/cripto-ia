const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

function createResponseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('control live routes expõem checklist, create request e activate', async () => {
  const routes = [];
  const expressMock = {
    Router() {
      return {
        get(path, handler) { routes.push({ method: 'GET', path, handler }); },
        post(path, handler) { routes.push({ method: 'POST', path, handler }); },
        patch(path, handler) { routes.push({ method: 'PATCH', path, handler }); },
        delete(path, handler) { routes.push({ method: 'DELETE', path, handler }); },
      };
    },
  };

  const mod = loadWithMocks('./src/routes/control.routes.js', {
    express: expressMock,
    '../services/control.service': {
      getRuntimeControl: async () => ({ executionMode: 'paper' }),
      updateRuntimeControl: async (patch) => ({ ...patch }),
      pauseRuntimeControl: async () => ({ paused: true }),
      resumeRuntimeControl: async () => ({ resumed: true }),
      listCooldowns: async () => [],
      clearCooldown: async () => ({ symbol: 'BTCUSDT' }),
      getRiskGuardrailSummary: async () => ({}),
      setMaintenanceMode: async () => ({}),
      clearMaintenanceMode: async () => ({}),
    },
    '../services/eventBus.service': { publish: () => null, publishStatusSnapshot: () => null },
    '../services/status.service': { getSystemStatus: async () => ({ ok: true }) },
    '../services/liveGovernance.service': {
      DEFAULT_LIVE_GOVERNANCE_POLICY: { modes: {} },
      getActivationChecklist: async ({ targetMode }) => ({ targetMode, status: 'healthy' }),
      createLiveActivationRequest: async () => ({ id: 1, status: 'pending_approvals' }),
      getLiveActivationRequestById: async () => ({ id: 1 }),
      listLiveActivationRequests: async () => ([{ id: 1 }]),
      revalidateLiveActivationRequest: async () => ({ id: 1, status: 'approved' }),
      approveLiveActivationRequest: async () => ({ id: 1, status: 'approved' }),
      activateLiveMode: async () => ({ request: { id: 1, status: 'activated' }, control: { executionMode: 'live' } }),
      rollbackLiveMode: async () => ({ control: { executionMode: 'paper' }, targetMode: 'paper' }),
      insertTestnetSupervisionReport: async () => ({ id: 20, status: 'healthy' }),
      listTestnetSupervisionReports: async () => ([{ id: 20 }]),
      listLiveModeEvents: async () => ([{ id: 33 }]),
    },
  });

  assert.ok(mod);

  const checklistRoute = routes.find((item) => item.method === 'GET' && item.path === '/live/checklist');
  const createRoute = routes.find((item) => item.method === 'POST' && item.path === '/live/requests');
  const activateRoute = routes.find((item) => item.method === 'POST' && item.path === '/live/requests/:id/activate');
  assert.ok(checklistRoute);
  assert.ok(createRoute);
  assert.ok(activateRoute);

  const nextErrors = [];
  const responseA = createResponseRecorder();
  await checklistRoute.handler({ query: { targetMode: 'live' } }, responseA, (error) => nextErrors.push(error));
  assert.equal(responseA.payload.status, 'healthy');

  const responseB = createResponseRecorder();
  await createRoute.handler({ body: { targetMode: 'testnet' }, header: () => 'ops' }, responseB, (error) => nextErrors.push(error));
  assert.equal(responseB.statusCode, 201);
  assert.equal(responseB.payload.id, 1);

  const responseC = createResponseRecorder();
  await activateRoute.handler({ params: { id: '1' }, body: { confirmationPhrase: 'CONFIRMAR_LIVE' }, header: () => 'ops' }, responseC, (error) => nextErrors.push(error));
  assert.equal(responseC.statusCode, 201);
  assert.equal(responseC.payload.request.status, 'activated');
  assert.equal(nextErrors.length, 0);
});
