const env = require('../config/env');
const pool = require('../db/pool');
const { publish } = require('./eventBus.service');
const { runExecutionHealthCheck, runExecutionReconciliation, getExecutionStatus } = require('./executionAdapter.service');
const { evaluateReadiness, getLatestReadinessReport } = require('./readiness.service');
const { getProviderStatuses } = require('./social.service');
const { getRuntimeControl } = require('./control.service');
const { syncAlertState, listActiveAlerts } = require('./alerts.service');
const { insertObservabilitySnapshot, cleanupObservabilitySnapshots } = require('./observability.service');
const { runTrainingRecalibration } = require('./trainingRecalibration.service');

const timers = [];
let started = false;

async function createJobRun({ jobKey, triggerSource = 'scheduler', requestedBy = 'system' }) {
  const result = await pool.query(
    `
      INSERT INTO scheduled_job_runs (job_key, trigger_source, requested_by, status, summary, started_at)
      VALUES ($1,$2,$3,'running','{}'::jsonb,NOW())
      RETURNING id, job_key AS "jobKey", trigger_source AS "triggerSource", requested_by AS "requestedBy", status, summary, started_at AS "startedAt", finished_at AS "finishedAt"
    `,
    [jobKey, triggerSource, requestedBy],
  );
  return result.rows[0];
}

async function finishJobRun(id, { status, summary = {} }) {
  const result = await pool.query(
    `
      UPDATE scheduled_job_runs
      SET status = $2, summary = $3::jsonb, finished_at = NOW()
      WHERE id = $1
      RETURNING id, job_key AS "jobKey", trigger_source AS "triggerSource", requested_by AS "requestedBy", status, summary, started_at AS "startedAt", finished_at AS "finishedAt"
    `,
    [id, status, JSON.stringify(summary || {})],
  );
  return result.rows[0];
}

async function listScheduledJobRuns({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id, job_key AS "jobKey", trigger_source AS "triggerSource", requested_by AS "requestedBy", status, summary, started_at AS "startedAt", finished_at AS "finishedAt"
      FROM scheduled_job_runs
      ORDER BY started_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 20), 100))],
  );
  return result.rows;
}

async function runAlertScan({ requestedBy = 'scheduler', triggerSource = 'scheduler' } = {}) {
  const [execution, control, providers, readiness, workersResult] = await Promise.all([
    getExecutionStatus(),
    getRuntimeControl(),
    getProviderStatuses({ limit: 10 }),
    getLatestReadinessReport(),
    pool.query(`SELECT worker_name, status, last_seen_at FROM worker_heartbeats`),
  ]);

  const workerRows = workersResult.rows || [];
  const updates = [];

  updates.push(await syncAlertState({
    active: Boolean(control.emergencyStop),
    alertKey: 'runtime:emergency-stop',
    severity: 'critical',
    title: 'Emergency stop ativo',
    message: control.pauseReason || 'O sistema está em emergency stop.',
    source: 'control',
    payload: control,
  }));

  for (const row of workerRows) {
    const ageMs = row.last_seen_at ? Date.now() - new Date(row.last_seen_at).getTime() : Number.MAX_SAFE_INTEGER;
    const stale = ageMs > env.health.workerStaleAfterSec * 1000;
    updates.push(await syncAlertState({
      active: stale,
      alertKey: `worker:${String(row.worker_name).toLowerCase()}:stale`,
      severity: 'high',
      title: `Worker stale: ${row.worker_name}`,
      message: `${row.worker_name} está sem heartbeat recente há ~${Math.round(ageMs / 1000)}s.`,
      source: 'scheduler',
      payload: { workerName: row.worker_name, ageSec: Math.round(ageMs / 1000), status: row.status },
    }));
  }

  updates.push(await syncAlertState({
    active: execution.latestHealthCheck?.status === 'error',
    alertKey: 'execution:healthcheck:error',
    severity: 'critical',
    title: 'Healthcheck de execução com erro',
    message: 'O último healthcheck de execução terminou com erro.',
    source: 'execution',
    payload: execution.latestHealthCheck || {},
  }));

  updates.push(await syncAlertState({
    active: execution.recentReconciliations?.[0]?.status === 'error',
    alertKey: 'execution:reconciliation:error',
    severity: 'high',
    title: 'Reconciliação com erro',
    message: 'A última reconciliação supervisionada terminou com erro.',
    source: 'execution',
    payload: execution.recentReconciliations?.[0] || {},
  }));

  for (const provider of providers) {
    updates.push(await syncAlertState({
      active: provider.status !== 'ok',
      alertKey: `social-provider:${provider.providerKey}:degraded`,
      severity: provider.status === 'backoff' ? 'warning' : 'high',
      title: `Provider social degradado: ${provider.providerName}`,
      message: `Provider ${provider.providerName} está em estado ${provider.status}.`,
      source: 'social',
      payload: provider,
    }));
  }

  updates.push(await syncAlertState({
    active: readiness?.status === 'blocked',
    alertKey: 'readiness:blocked',
    severity: 'critical',
    title: 'Checklist de readiness bloqueado',
    message: 'Há falhas críticas no checklist de readiness para testnet supervisionada.',
    source: 'readiness',
    payload: readiness || {},
  }));

  const openAlerts = await listActiveAlerts({ limit: 100, status: 'open' });
  const result = {
    createdOrUpdated: updates.filter(Boolean).length,
    openAlertsCount: openAlerts.length,
    criticalAlertsCount: openAlerts.filter((item) => item.severity === 'critical').length,
  };
  publish('scheduler.alert_scan', result);
  return result;
}

async function runNamedJob(jobKey, { requestedBy = 'scheduler', triggerSource = 'scheduler' } = {}) {
  const run = await createJobRun({ jobKey, requestedBy, triggerSource });

  try {
    let output;
    if (jobKey === 'execution_healthcheck') {
      output = await runExecutionHealthCheck({ requestedBy });
    } else if (jobKey === 'execution_reconciliation') {
      output = await runExecutionReconciliation({ requestedBy });
    } else if (jobKey === 'readiness_assessment') {
      output = await evaluateReadiness({ requestedBy, triggerSource });
    } else if (jobKey === 'alert_scan') {
      output = await runAlertScan({ requestedBy, triggerSource });
    } else if (jobKey === 'observability_snapshot') {
      output = await insertObservabilitySnapshot({ source: triggerSource });
      await cleanupObservabilitySnapshots();
    } else if (jobKey === 'training_recalibration') {
      output = await runTrainingRecalibration({
        requestedBy,
        triggerSource,
        autoApply: true,
      });
    } else {
      throw new Error(`unknown_job_key:${jobKey}`);
    }

    const finished = await finishJobRun(run.id, { status: 'ok', summary: output || {} });
    publish('scheduler.job', finished);
    return finished;
  } catch (error) {
    const finished = await finishJobRun(run.id, { status: 'error', summary: { message: error.message } });
    publish('scheduler.job', finished);
    throw error;
  }
}

function scheduleEvery(jobKey, seconds) {
  const safeSeconds = Math.max(Number(seconds || 0), 30);
  const timer = setInterval(() => {
    runNamedJob(jobKey, { requestedBy: `scheduler:${jobKey}`, triggerSource: 'scheduler' }).catch((error) => {
      console.error(`Scheduled job failed [${jobKey}]:`, error.message);
    });
  }, safeSeconds * 1000);
  timers.push(timer);
}

function startSchedulers() {
  if (started || !env.scheduling.enabled) return;
  started = true;

  ['readiness_assessment', 'alert_scan', 'observability_snapshot'].forEach((jobKey) => {
    setTimeout(() => {
      runNamedJob(jobKey, { requestedBy: `startup:${jobKey}`, triggerSource: 'startup' }).catch((error) => {
        console.error(`Startup job failed [${jobKey}]:`, error.message);
      });
    }, 2000);
  });

  scheduleEvery('execution_healthcheck', env.scheduling.healthcheckIntervalSec);
  scheduleEvery('execution_reconciliation', env.scheduling.reconciliationIntervalSec);
  scheduleEvery('readiness_assessment', env.scheduling.readinessIntervalSec);
  scheduleEvery('alert_scan', env.scheduling.alertScanIntervalSec);
  scheduleEvery('observability_snapshot', env.scheduling.observabilitySnapshotIntervalSec);
  scheduleEvery('training_recalibration', env.scheduling.trainingRecalibrationIntervalSec);
}

function stopSchedulers() {
  while (timers.length) {
    clearInterval(timers.pop());
  }
  started = false;
}

module.exports = {
  startSchedulers,
  stopSchedulers,
  runNamedJob,
  listScheduledJobRuns,
};
