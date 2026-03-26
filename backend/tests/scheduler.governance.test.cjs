const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

test('runNamedJob executa governance_assessment', async () => {
  let governanceCalls = 0;
  let createRunCalled = 0;
  const pool = {
    query: async (sql, params = []) => {
      if (String(sql).includes('INSERT INTO scheduled_job_runs')) {
        createRunCalled += 1;
        return { rows: [{ id: 7, jobKey: params[0], triggerSource: params[1], requestedBy: params[2], status: 'running', summary: {}, startedAt: '2026-01-01T00:00:00Z', finishedAt: null }] };
      }
      if (String(sql).includes('UPDATE scheduled_job_runs')) {
        return { rows: [{ id: 7, jobKey: 'governance_assessment', triggerSource: 'manual', requestedBy: 'tester', status: params[1], summary: JSON.parse(params[2]), startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:01:00Z' }] };
      }
      return { rows: [] };
    },
  };
  const scheduler = loadWithMocks('./src/services/scheduler.service.js', {
    '../config/env': { scheduling: { enabled: true, healthcheckIntervalSec: 60, reconciliationIntervalSec: 60, readinessIntervalSec: 60, alertScanIntervalSec: 60, observabilitySnapshotIntervalSec: 60, trainingRecalibrationIntervalSec: 60, governanceIntervalSec: 60 }, health: { workerStaleAfterSec: 30 } },
    '../db/pool': pool,
    './eventBus.service': { publish: () => null },
    './executionAdapter.service': { runExecutionHealthCheck: async () => ({}), runExecutionReconciliation: async () => ({}), getExecutionStatus: async () => ({}) },
    './readiness.service': { evaluateReadiness: async () => ({}), getLatestReadinessReport: async () => ({}) },
    './social.service': { getProviderStatuses: async () => [] },
    './control.service': { getRuntimeControl: async () => ({}) },
    './alerts.service': { syncAlertState: async () => null, listActiveAlerts: async () => [] },
    './observability.service': { insertObservabilitySnapshot: async () => ({}), cleanupObservabilitySnapshots: async () => null },
    './trainingRecalibration.service': { runTrainingRecalibration: async () => ({}) },
    './governanceAssessment.service': { insertGovernanceReport: async () => { governanceCalls += 1; return { status: 'healthy' }; } },
  });

  const result = await scheduler.runNamedJob('governance_assessment', { requestedBy: 'tester', triggerSource: 'manual' });
  assert.equal(governanceCalls, 1);
  assert.equal(createRunCalled, 1);
  assert.equal(result.status, 'ok');
});
