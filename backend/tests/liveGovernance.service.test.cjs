const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

test('buildActivationChecklist bloqueia live com alerta crítico e healthcheck stale', () => {
  const mod = loadWithMocks('./src/services/liveGovernance.service.js', {
    '../db/pool': { query: async () => ({ rows: [] }) },
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'healthy' }) },
    './observability.service': { getObservabilitySummary: async () => ({ current: { summary: {} } }) },
    './control.service': {
      getRuntimeControl: async () => ({}),
      updateRuntimeControl: async () => ({}),
      pauseRuntimeControl: async () => ({}),
      resumeRuntimeControl: async () => ({}),
    },
    './alerts.service': { listActiveAlerts: async () => [], syncAlertState: async () => null },
    './eventBus.service': { publish: () => null },
  });

  const checklist = mod.buildActivationChecklist({
    control: { executionMode: 'paper', emergencyStop: false, maintenanceMode: false },
    readiness: { status: 'healthy' },
    governance: { status: 'healthy', score: 92 },
    alerts: [{ severity: 'critical' }],
    observability: {
      current: {
        summary: {
          workers: { items: [{ stale: false }] },
          execution: {
            latestHealthCheck: { status: 'ok', finishedAt: '2025-01-01T00:00:00Z' },
            latestReconciliation: { status: 'ok', finishedAt: new Date().toISOString() },
          },
        },
      },
    },
  }, { targetMode: 'live' });

  assert.equal(checklist.status, 'blocked');
  assert.equal(checklist.readyToActivate, false);
  assert.ok(checklist.indicators.some((item) => item.key === 'critical_alerts' && item.status === 'fail'));
  assert.ok(checklist.indicators.some((item) => item.key === 'execution_healthcheck' && item.status === 'fail'));
});

test('approveLiveActivationRequest exige aprovadores distintos e marca approved no segundo aceite', async () => {
  const state = {
    requests: [{
      id: 7,
      targetMode: 'live',
      requestedBy: 'alice',
      reason: 'go-live',
      status: 'pending_approvals',
      checklistStatus: 'healthy',
      checklistSummary: {},
      requiredApprovals: 2,
      metadata: {},
      activatedBy: null,
      activatedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }],
    approvals: [{ id: 1, requestId: 7, approvedBy: 'bob', comment: '', createdAt: '2026-01-01T00:05:00Z' }],
  };

  const pool = {
    query: async (sql, params = []) => {
      sql = String(sql);
      if (sql.includes('FROM live_activation_requests') && sql.includes('WHERE id = $1')) {
        return { rows: state.requests.filter((item) => item.id === Number(params[0])) };
      }
      if (sql.includes('FROM live_activation_request_approvals')) {
        return { rows: state.approvals.filter((item) => item.requestId === Number(params[0])) };
      }
      if (sql.includes('INSERT INTO live_activation_request_approvals')) {
        state.approvals.push({ id: 2, requestId: Number(params[0]), approvedBy: params[1], comment: params[2], createdAt: '2026-01-01T00:10:00Z' });
        return { rows: [] };
      }
      if (sql.includes('UPDATE live_activation_requests') && sql.includes('SET status = $2')) {
        state.requests[0] = { ...state.requests[0], status: params[1], updatedAt: '2026-01-01T00:10:00Z' };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO live_mode_events')) {
        return { rows: [{ id: 10 }] };
      }
      throw new Error(`unexpected_sql:${sql}`);
    },
  };

  const mod = loadWithMocks('./src/services/liveGovernance.service.js', {
    '../db/pool': pool,
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'healthy' }) },
    './observability.service': { getObservabilitySummary: async () => ({ current: { summary: {} } }) },
    './control.service': {
      getRuntimeControl: async () => ({}),
      updateRuntimeControl: async () => ({}),
      pauseRuntimeControl: async () => ({}),
      resumeRuntimeControl: async () => ({}),
    },
    './alerts.service': { listActiveAlerts: async () => [], syncAlertState: async () => null },
    './eventBus.service': { publish: () => null },
  });

  await assert.rejects(() => mod.approveLiveActivationRequest(7, { approvedBy: 'alice' }), /requester_cannot_self_approve/);
  const approved = await mod.approveLiveActivationRequest(7, { approvedBy: 'carol', comment: 'ok' });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvalsCount, 2);
});

test('activateLiveMode revalida, exige frase e atualiza controle', async () => {
  const calls = [];
  const state = {
    request: {
      id: 9,
      targetMode: 'live',
      requestedBy: 'alice',
      reason: 'promotion approved',
      status: 'approved',
      checklistStatus: 'healthy',
      checklistSummary: {},
      requiredApprovals: 2,
      metadata: {},
      activatedBy: null,
      activatedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    approvals: [
      { id: 1, requestId: 9, approvedBy: 'bob', comment: '', createdAt: '2026-01-01T00:05:00Z' },
      { id: 2, requestId: 9, approvedBy: 'carol', comment: '', createdAt: '2026-01-01T00:06:00Z' },
    ],
  };

  const pool = {
    query: async (sql, params = []) => {
      sql = String(sql);
      calls.push(sql);
      if (sql.includes('FROM operational_governance_reports')) {
        return { rows: [{ id: 1, status: 'healthy', score: 90, summary: {}, createdAt: '2026-01-01T00:00:00Z' }] };
      }
      if (sql.includes('FROM live_activation_requests') && sql.includes('WHERE id = $1')) {
        return { rows: [state.request] };
      }
      if (sql.includes('FROM live_activation_request_approvals')) {
        return { rows: state.approvals };
      }
      if (sql.includes('UPDATE live_activation_requests') && sql.includes('SET checklist_status = $2')) {
        return { rows: [state.request] };
      }
      if (sql.includes('UPDATE live_activation_requests') && sql.includes("SET status = 'activated'")) {
        return { rows: [{ ...state.request, status: 'activated', activatedBy: params[1] }] };
      }
      if (sql.includes('INSERT INTO live_mode_events')) {
        return { rows: [{ id: 11 }] };
      }
      throw new Error(`unexpected_sql:${sql}`);
    },
  };

  const mod = loadWithMocks('./src/services/liveGovernance.service.js', {
    '../db/pool': pool,
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'healthy' }) },
    './observability.service': {
      getObservabilitySummary: async () => ({
        current: {
          summary: {
            workers: { items: [] },
            execution: {
              latestHealthCheck: { status: 'ok', finishedAt: new Date().toISOString() },
              latestReconciliation: { status: 'ok', finishedAt: new Date().toISOString() },
            },
          },
        },
      }),
    },
    './control.service': {
      getRuntimeControl: async () => ({ executionMode: 'testnet', emergencyStop: false, maintenanceMode: false }),
      updateRuntimeControl: async (patch) => ({ ...patch }),
      pauseRuntimeControl: async () => ({}),
      resumeRuntimeControl: async (payload) => ({ resumed: true, ...payload }),
    },
    './alerts.service': { listActiveAlerts: async () => [], syncAlertState: async () => null },
    './eventBus.service': { publish: () => null },
  });

  await assert.rejects(() => mod.activateLiveMode(9, { activatedBy: 'dave', confirmationPhrase: 'errada' }), /invalid_confirmation_phrase/);
  const result = await mod.activateLiveMode(9, { activatedBy: 'dave', confirmationPhrase: 'CONFIRMAR_LIVE' });
  assert.equal(result.request.status, 'activated');
  assert.equal(result.control.executionMode, 'live');
  assert.ok(calls.some((sql) => sql.includes("SET status = 'activated'")));
});

test('insertTestnetSupervisionReport recomenda rollback em live com alerta crítico', async () => {
  const events = [];
  const pool = {
    query: async (sql) => {
      sql = String(sql);
      if (sql.includes('FROM operational_governance_reports')) {
        return { rows: [{ id: 1, status: 'healthy', score: 86, summary: {}, createdAt: '2026-01-01T00:00:00Z' }] };
      }
      if (sql.includes('INSERT INTO testnet_supervision_reports')) {
        return { rows: [{ id: 15, triggerSource: 'manual', requestedBy: 'ops', status: 'blocked', summary: {} }] };
      }
      if (sql.includes('INSERT INTO live_mode_events')) {
        events.push(sql);
        return { rows: [{ id: 16 }] };
      }
      throw new Error(`unexpected_sql:${sql}`);
    },
  };

  const mod = loadWithMocks('./src/services/liveGovernance.service.js', {
    '../db/pool': pool,
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'healthy' }) },
    './observability.service': {
      getObservabilitySummary: async () => ({
        current: {
          summary: {
            workers: { items: [] },
            execution: {
              latestHealthCheck: { status: 'ok', finishedAt: new Date().toISOString() },
              latestReconciliation: { status: 'ok', finishedAt: new Date().toISOString() },
            },
          },
        },
      }),
    },
    './control.service': {
      getRuntimeControl: async () => ({ executionMode: 'live', emergencyStop: false, maintenanceMode: false }),
      updateRuntimeControl: async (patch) => ({ ...patch }),
      pauseRuntimeControl: async (payload) => ({ paused: true, ...payload }),
      resumeRuntimeControl: async () => ({}),
    },
    './alerts.service': {
      listActiveAlerts: async () => [{ severity: 'critical' }],
      syncAlertState: async () => null,
    },
    './eventBus.service': { publish: () => null },
  });

  const result = await mod.insertTestnetSupervisionReport({ requestedBy: 'ops', triggerSource: 'manual', autoRollback: true });
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.recommendRollback, true);
  assert.equal(result.rollback.targetMode, 'paper');
  assert.ok(events.length >= 2);
});
