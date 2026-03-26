const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadWithMocks } = require('./helpers/load-with-mocks.cjs');

test('scheduler executa training_recalibration com autoApply=true e publica o job finalizado', async () => {
  const queries = [];
  const published = [];
  const recalibrationCalls = [];

  const scheduler = loadWithMocks(
    path.resolve(__dirname, '../src/services/scheduler.service.js'),
    {
      '../config/env': {
        scheduling: {
          enabled: true,
          healthcheckIntervalSec: 60,
          reconciliationIntervalSec: 60,
          readinessIntervalSec: 60,
          alertScanIntervalSec: 60,
          observabilitySnapshotIntervalSec: 60,
          trainingRecalibrationIntervalSec: 60,
        },
        health: {
          workerStaleAfterSec: 90,
        },
      },
      '../db/pool': {
        async query(sql, params = []) {
          queries.push({ sql, params });

          if (sql.includes('INSERT INTO scheduled_job_runs')) {
            return {
              rows: [
                {
                  id: 101,
                  jobKey: params[0],
                  triggerSource: params[1],
                  requestedBy: params[2],
                  status: 'running',
                  summary: {},
                },
              ],
            };
          }

          if (sql.includes('UPDATE scheduled_job_runs')) {
            return {
              rows: [
                {
                  id: params[0],
                  jobKey: 'training_recalibration',
                  triggerSource: 'scheduler',
                  requestedBy: 'test-suite',
                  status: params[1],
                  summary: JSON.parse(params[2]),
                },
              ],
            };
          }

          throw new Error(`query_nao_mockada:${sql}`);
        },
      },
      './eventBus.service': {
        publish(topic, payload) {
          published.push({ topic, payload });
        },
      },
      './executionAdapter.service': {
        runExecutionHealthCheck: async () => ({ ok: true }),
        runExecutionReconciliation: async () => ({ ok: true }),
        getExecutionStatus: async () => ({ ok: true }),
      },
      './readiness.service': {
        evaluateReadiness: async () => ({ status: 'ready' }),
        getLatestReadinessReport: async () => ({ status: 'ready' }),
      },
      './social.service': {
        getProviderStatuses: async () => [],
      },
      './control.service': {
        getRuntimeControl: async () => ({ emergencyStop: false }),
      },
      './alerts.service': {
        syncAlertState: async () => null,
        listActiveAlerts: async () => [],
      },
      './observability.service': {
        insertObservabilitySnapshot: async () => ({ ok: true }),
        cleanupObservabilitySnapshots: async () => ({ ok: true }),
      },
      './trainingRecalibration.service': {
        async runTrainingRecalibration(payload) {
          recalibrationCalls.push(payload);
          return {
            status: 'completed',
            recommendedChanges: 2,
          };
        },
      },
    },
  );

  const result = await scheduler.runNamedJob('training_recalibration', {
    requestedBy: 'test-suite',
    triggerSource: 'scheduler',
  });

  assert.equal(recalibrationCalls.length, 1);
  assert.deepEqual(recalibrationCalls[0], {
    requestedBy: 'test-suite',
    triggerSource: 'scheduler',
    autoApply: true,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.jobKey, 'training_recalibration');
  assert.equal(published.at(-1).topic, 'scheduler.job');
  assert.equal(queries.length, 2);
});
