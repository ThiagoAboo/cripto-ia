const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

test('scheduler executa job testnet_supervision', async () => {
  const calls = [];
  const mod = loadWithMocks('./src/services/scheduler.service.js', {
    '../config/env': {
      health: { workerStaleAfterSec: 90 },
      scheduling: {
        enabled: false,
        healthcheckIntervalSec: 300,
        reconciliationIntervalSec: 300,
        readinessIntervalSec: 300,
        alertScanIntervalSec: 300,
        observabilitySnapshotIntervalSec: 300,
        trainingRecalibrationIntervalSec: 300,
        governanceIntervalSec: 300,
        testnetSupervisionIntervalSec: 300,
      },
    },
    '../db/pool': {
      query: async (sql, params = []) => {
        sql = String(sql);
        if (sql.includes('INSERT INTO scheduled_job_runs')) {
          return { rows: [{ id: 1, jobKey: params[0], triggerSource: params[1], requestedBy: params[2], status: 'running', summary: {}, startedAt: '2026-01-01T00:00:00Z', finishedAt: null }] };
        }
        if (sql.includes('UPDATE scheduled_job_runs')) {
          return { rows: [{ id: 1, jobKey: 'testnet_supervision', triggerSource: 'manual', requestedBy: 'ops', status: params[1], summary: JSON.parse(params[2]), startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:01:00Z' }] };
        }
        throw new Error(`unexpected_sql:${sql}`);
      },
    },
    './eventBus.service': { publish: () => null },
    './executionAdapter.service': {
      runExecutionHealthCheck: async () => ({}),
      runExecutionReconciliation: async () => ({}),
      getExecutionStatus: async () => ({}),
    },
    './readiness.service': { evaluateReadiness: async () => ({}), getLatestReadinessReport: async () => ({}) },
    './social.service': { getProviderStatuses: async () => [] },
    './control.service': { getRuntimeControl: async () => ({}) },
    './alerts.service': { syncAlertState: async () => null, listActiveAlerts: async () => [] },
    './observability.service': {
      insertObservabilitySnapshot: async () => ({}),
      cleanupObservabilitySnapshots: async () => null,
    },
    './trainingRecalibration.service': { runTrainingRecalibration: async () => ({}) },
    './governanceAssessment.service': { insertGovernanceReport: async () => ({}) },
    './liveGovernance.service': { insertTestnetSupervisionReport: async (payload) => { calls.push(payload); return { status: 'healthy' }; } },
  });

  const result = await mod.runNamedJob('testnet_supervision', { requestedBy: 'ops', triggerSource: 'manual' });
  assert.equal(result.jobKey, 'testnet_supervision');
  assert.equal(result.status, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].autoRollback, true);
});
