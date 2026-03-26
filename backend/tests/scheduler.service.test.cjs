const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

const TARGET = path.resolve(__dirname, '../../src/services/scheduler.service.js');

function buildService() {
  const publishCalls = [];
  const alertCalls = [];
  const finishedRuns = [];

  const pool = {
    query: async (sql, params = []) => {
      const statement = String(sql);

      if (statement.includes('INSERT INTO scheduled_job_runs')) {
        return {
          rows: [
            {
              id: 1,
              jobKey: params[0],
              triggerSource: params[1],
              requestedBy: params[2],
              status: 'running',
              summary: {},
              startedAt: '2026-03-26T12:00:00.000Z',
              finishedAt: null,
            },
          ],
        };
      }

      if (statement.includes('UPDATE scheduled_job_runs')) {
        const summary = JSON.parse(params[2]);
        const row = {
          id: params[0],
          jobKey: 'alert_scan',
          triggerSource: 'scheduler',
          requestedBy: 'scheduler',
          status: params[1],
          summary,
          startedAt: '2026-03-26T12:00:00.000Z',
          finishedAt: '2026-03-26T12:00:01.000Z',
        };
        finishedRuns.push(row);
        return { rows: [row] };
      }

      if (statement.includes('SELECT worker_name, status, last_seen_at FROM worker_heartbeats')) {
        return {
          rows: [
            {
              worker_name: 'ai-trading-worker',
              status: 'ok',
              last_seen_at: new Date(Date.now() - 120000).toISOString(),
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL in test: ${statement}`);
    },
  };

  const mocks = {
    '../config/env': {
      health: { workerStaleAfterSec: 90 },
      scheduling: {
        enabled: false,
        healthcheckIntervalSec: 300,
        reconciliationIntervalSec: 900,
        readinessIntervalSec: 600,
        alertScanIntervalSec: 120,
        observabilitySnapshotIntervalSec: 300,
      },
    },
    '../db/pool': pool,
    './eventBus.service': {
      publish: (eventKey, payload) => {
        publishCalls.push({ eventKey, payload });
      },
    },
    './executionAdapter.service': {
      runExecutionHealthCheck: async () => ({ ok: true }),
      runExecutionReconciliation: async () => ({ ok: true }),
      getExecutionStatus: async () => ({
        latestHealthCheck: { status: 'error' },
        recentReconciliations: [{ status: 'error' }],
      }),
    },
    './readiness.service': {
      evaluateReadiness: async () => ({ status: 'ready' }),
      getLatestReadinessReport: async () => ({ status: 'blocked' }),
    },
    './social.service': {
      getProviderStatuses: async () => ([
        {
          providerKey: 'coingecko',
          providerName: 'CoinGecko',
          status: 'backoff',
        },
      ]),
    },
    './control.service': {
      getRuntimeControl: async () => ({
        emergencyStop: true,
        pauseReason: 'manual emergency stop',
      }),
    },
    './alerts.service': {
      syncAlertState: async (payload) => {
        alertCalls.push(payload);
        return payload;
      },
      listActiveAlerts: async () => ([
        { severity: 'critical' },
        { severity: 'high' },
      ]),
    },
    './observability.service': {
      insertObservabilitySnapshot: async () => ({ ok: true }),
      cleanupObservabilitySnapshots: async () => undefined,
    },
  };

  const service = loadWithMocks(TARGET, mocks);
  return { service, publishCalls, alertCalls, finishedRuns };
}

test('runNamedJob(alert_scan) evaluates alert conditions and publishes scheduler events', async () => {
  const { service, publishCalls, alertCalls, finishedRuns } = buildService();

  const result = await service.runNamedJob('alert_scan', {
    requestedBy: 'scheduler',
    triggerSource: 'scheduler',
  });

  assert.equal(result.status, 'ok');
  assert.equal(finishedRuns.length, 1);
  assert.ok(result.summary.openAlertsCount >= 2);
  assert.ok(result.summary.criticalAlertsCount >= 1);
  assert.ok(alertCalls.length >= 5, 'expected multiple alert state evaluations');
  assert.ok(publishCalls.some((item) => item.eventKey === 'scheduler.alert_scan'));
  assert.ok(publishCalls.some((item) => item.eventKey === 'scheduler.job'));
});

test('runNamedJob throws for unknown job keys and records an error finish state', async () => {
  const { service, finishedRuns } = buildService();

  await assert.rejects(
    () => service.runNamedJob('unknown_job_key', { requestedBy: 'scheduler', triggerSource: 'scheduler' }),
    /unknown_job_key:unknown_job_key/,
  );

  assert.equal(finishedRuns.length, 1);
  assert.equal(finishedRuns[0].status, 'error');
  assert.match(String(finishedRuns[0].summary.message || ''), /unknown_job_key/);
});
