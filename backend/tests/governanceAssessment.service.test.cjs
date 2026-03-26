const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

test('buildGovernanceReport classifica blocked quando readiness bloqueado e alertas críticos', async () => {
  const pool = { query: async () => ({ rows: [{ id: 11, jobKey: 'alert_scan', status: 'error', summary: {}, startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:01:00Z' }] }) };
  const mod = loadWithMocks('./src/services/governanceAssessment.service.js', {
    '../db/pool': pool,
    './observability.service': {
      getObservabilitySummary: async () => ({
        current: {
          summary: {
            workers: { items: [{ workerName: 'ai-worker', stale: true }, { workerName: 'social-worker', stale: false }] },
            execution: {
              latestHealthCheck: { status: 'ok' },
              latestReconciliation: { status: 'ok' },
            },
          },
        },
      }),
    },
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'blocked' }) },
    './control.service': { getRuntimeControl: async () => ({ emergencyStop: false, maintenanceMode: true }) },
    './alerts.service': { listActiveAlerts: async () => ([{ severity: 'critical' }, { severity: 'high' }]), syncAlertState: async () => null },
    './eventBus.service': { publish: () => null },
  });

  const report = await mod.buildGovernanceReport({ requestedBy: 'test', triggerSource: 'manual' });
  assert.equal(report.status, 'blocked');
  assert.equal(report.workers.stale, 1);
  assert.equal(report.alertSummary.critical, 1);
  assert.equal(report.recentJobs.failed24h, 1);
  assert.ok(report.score <= 65);
});

test('insertGovernanceReport persiste relatório e publica evento', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (String(sql).includes('FROM scheduled_job_runs')) return { rows: [] };
      if (String(sql).includes('INSERT INTO operational_governance_reports')) {
        return {
          rows: [{ id: 99, triggerSource: 'manual', requestedBy: 'tester', status: 'healthy', score: 90, summary: { status: 'healthy' }, createdAt: '2026-01-01T00:00:00Z' }],
        };
      }
      return { rows: [] };
    },
  };
  const published = [];
  const escalations = [];
  const mod = loadWithMocks('./src/services/governanceAssessment.service.js', {
    '../db/pool': pool,
    './observability.service': {
      getObservabilitySummary: async () => ({
        current: { summary: { workers: { items: [] }, execution: { latestHealthCheck: { status: 'ok' }, latestReconciliation: { status: 'ok' } } } },
      }),
    },
    './readiness.service': { getLatestReadinessReport: async () => ({ status: 'healthy' }) },
    './control.service': { getRuntimeControl: async () => ({ emergencyStop: false, maintenanceMode: false }) },
    './alerts.service': {
      listActiveAlerts: async () => [],
      syncAlertState: async (payload) => {
        escalations.push(payload);
        return payload;
      },
    },
    './eventBus.service': { publish: (event, payload) => published.push({ event, payload }) },
  });

  const row = await mod.insertGovernanceReport({ requestedBy: 'tester', triggerSource: 'manual', autoEscalate: true });
  assert.equal(row.id, 99);
  assert.ok(calls.some((item) => String(item.sql).includes('INSERT INTO operational_governance_reports')));
  assert.equal(published[0].event, 'governance.report');
  assert.ok(escalations.length >= 3);
});
