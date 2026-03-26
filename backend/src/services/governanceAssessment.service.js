const pool = require('../db/pool');
const { getObservabilitySummary } = require('./observability.service');
const { getLatestReadinessReport } = require('./readiness.service');
const { getRuntimeControl } = require('./control.service');
const { listActiveAlerts, syncAlertState } = require('./alerts.service');
const { publish } = require('./eventBus.service');

function clampLimit(limit, fallback = 20, max = 200) {
  return Math.max(1, Math.min(Number(limit || fallback), max));
}

function countBySeverity(alerts = []) {
  return alerts.reduce((acc, item) => {
    const key = String(item?.severity || 'info').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function calculateGovernanceStatus({
  emergencyStop = false,
  readinessStatus = 'unknown',
  criticalAlerts = 0,
  staleWorkers = 0,
  failedJobs24h = 0,
  executionHealthStatus = '',
  executionReconciliationStatus = '',
} = {}) {
  if (emergencyStop) return 'blocked';
  if (String(readinessStatus).toLowerCase() === 'blocked') return 'blocked';
  if (criticalAlerts > 0) return 'blocked';
  if (String(executionHealthStatus).toLowerCase() === 'error') return 'blocked';
  if (String(executionReconciliationStatus).toLowerCase() === 'error') return 'degraded';
  if (staleWorkers > 0 || failedJobs24h > 0) return 'degraded';
  return 'healthy';
}

function buildIndicators({
  readinessStatus,
  emergencyStop,
  maintenanceMode,
  staleWorkers,
  totalWorkers,
  failedJobs24h,
  criticalAlerts,
  highAlerts,
  executionHealthStatus,
  executionReconciliationStatus,
} = {}) {
  return [
    {
      key: 'readiness',
      status: String(readinessStatus || 'unknown').toLowerCase() === 'blocked' ? 'fail' : 'pass',
      label: 'Checklist de readiness',
      value: readinessStatus || 'unknown',
    },
    {
      key: 'runtime_emergency_stop',
      status: emergencyStop ? 'fail' : 'pass',
      label: 'Emergency stop',
      value: emergencyStop ? 'active' : 'inactive',
    },
    {
      key: 'runtime_maintenance_mode',
      status: maintenanceMode ? 'warn' : 'pass',
      label: 'Maintenance mode',
      value: maintenanceMode ? 'active' : 'inactive',
    },
    {
      key: 'workers_stale',
      status: staleWorkers > 0 ? 'fail' : 'pass',
      label: 'Workers stale',
      value: `${staleWorkers}/${totalWorkers}`,
    },
    {
      key: 'scheduler_failures_24h',
      status: failedJobs24h > 0 ? 'warn' : 'pass',
      label: 'Falhas de jobs em 24h',
      value: failedJobs24h,
    },
    {
      key: 'alerts_critical',
      status: criticalAlerts > 0 ? 'fail' : 'pass',
      label: 'Alertas críticos abertos',
      value: criticalAlerts,
    },
    {
      key: 'alerts_high',
      status: highAlerts > 0 ? 'warn' : 'pass',
      label: 'Alertas high abertos',
      value: highAlerts,
    },
    {
      key: 'execution_health',
      status: String(executionHealthStatus || '').toLowerCase() === 'error' ? 'fail' : 'pass',
      label: 'Healthcheck de execução',
      value: executionHealthStatus || 'unknown',
    },
    {
      key: 'execution_reconciliation',
      status: String(executionReconciliationStatus || '').toLowerCase() === 'error' ? 'warn' : 'pass',
      label: 'Reconciliação de execução',
      value: executionReconciliationStatus || 'unknown',
    },
  ];
}

function calculateOperationalScore({ indicators = [] } = {}) {
  let score = 100;
  for (const indicator of indicators) {
    if (indicator.status === 'fail') score -= 25;
    if (indicator.status === 'warn') score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

async function buildGovernanceReport({ requestedBy = 'system', triggerSource = 'manual' } = {}) {
  const [observability, readiness, control, alerts, recentJobsResult] = await Promise.all([
    getObservabilitySummary(),
    getLatestReadinessReport(),
    getRuntimeControl(),
    listActiveAlerts({ limit: 200, status: 'open' }),
    pool.query(`
      SELECT id, job_key AS "jobKey", status, summary, started_at AS "startedAt", finished_at AS "finishedAt"
      FROM scheduled_job_runs
      WHERE started_at >= NOW() - INTERVAL '24 hours'
      ORDER BY started_at DESC
      LIMIT 100
    `),
  ]);

  const currentSummary = observability?.current?.summary || {};
  const workerItems = currentSummary?.workers?.items || [];
  const staleWorkers = workerItems.filter((item) => item.stale).length;
  const totalWorkers = workerItems.length;

  const alertCounts = countBySeverity(alerts);
  const criticalAlerts = Number(alertCounts.critical || 0);
  const highAlerts = Number(alertCounts.high || 0);

  const recentJobs = recentJobsResult.rows || [];
  const failedJobs = recentJobs.filter((item) => String(item.status).toLowerCase() === 'error');

  const executionHealthStatus = currentSummary?.execution?.latestHealthCheck?.status || 'unknown';
  const executionReconciliationStatus = currentSummary?.execution?.latestReconciliation?.status || 'unknown';
  const readinessStatus = readiness?.status || 'unknown';

  const indicators = buildIndicators({
    readinessStatus,
    emergencyStop: Boolean(control?.emergencyStop),
    maintenanceMode: Boolean(control?.maintenanceMode),
    staleWorkers,
    totalWorkers,
    failedJobs24h: failedJobs.length,
    criticalAlerts,
    highAlerts,
    executionHealthStatus,
    executionReconciliationStatus,
  });

  const status = calculateGovernanceStatus({
    emergencyStop: Boolean(control?.emergencyStop),
    readinessStatus,
    criticalAlerts,
    staleWorkers,
    failedJobs24h: failedJobs.length,
    executionHealthStatus,
    executionReconciliationStatus,
  });

  const score = calculateOperationalScore({ indicators });

  return {
    requestedBy,
    triggerSource,
    generatedAt: new Date().toISOString(),
    status,
    score,
    indicators,
    alertSummary: {
      open: alerts.length,
      critical: criticalAlerts,
      high: highAlerts,
      warning: Number(alertCounts.warning || 0),
      info: Number(alertCounts.info || 0),
    },
    workers: {
      total: totalWorkers,
      stale: staleWorkers,
      items: workerItems,
    },
    readiness: readiness || null,
    runtime: control || null,
    execution: currentSummary?.execution || null,
    recentJobs: {
      total24h: recentJobs.length,
      failed24h: failedJobs.length,
      latestFailures: failedJobs.slice(0, 5),
    },
    recommendations: [
      ...(Boolean(control?.emergencyStop) ? ['Validar motivo do emergency stop antes de qualquer retomada.'] : []),
      ...(String(readinessStatus).toLowerCase() === 'blocked' ? ['Corrigir itens críticos do readiness antes de testnet/live.'] : []),
      ...(staleWorkers > 0 ? ['Restaurar heartbeat dos workers stale e revisar estabilidade do runtime.'] : []),
      ...(failedJobs.length > 0 ? ['Inspecionar falhas recentes do scheduler e revisar jobs com erro.'] : []),
      ...(criticalAlerts > 0 ? ['Resolver alertas críticos abertos e registrar ação corretiva.'] : []),
    ],
  };
}

async function applyGovernanceAlertPolicies(report) {
  const updates = [];
  updates.push(await syncAlertState({
    active: report.status === 'blocked',
    alertKey: 'governance:operations:blocked',
    severity: 'critical',
    title: 'Governança operacional bloqueada',
    message: 'A avaliação operacional encontrou condições bloqueantes para operação supervisionada.',
    source: 'governance',
    payload: { status: report.status, score: report.score },
  }));

  updates.push(await syncAlertState({
    active: Number(report.workers?.stale || 0) > 0,
    alertKey: 'governance:workers:stale',
    severity: 'high',
    title: 'Workers stale impactando a governança',
    message: 'Há workers sem heartbeat recente, afetando a confiabilidade operacional.',
    source: 'governance',
    payload: report.workers,
  }));

  updates.push(await syncAlertState({
    active: Number(report.recentJobs?.failed24h || 0) > 0,
    alertKey: 'governance:scheduler:job-errors',
    severity: 'warning',
    title: 'Falhas recentes no scheduler',
    message: 'Foram detectadas falhas em jobs agendados nas últimas 24 horas.',
    source: 'governance',
    payload: report.recentJobs,
  }));

  updates.push(await syncAlertState({
    active: Number(report.alertSummary?.critical || 0) >= 2,
    alertKey: 'governance:alerts:critical-burst',
    severity: 'critical',
    title: 'Múltiplos alertas críticos abertos',
    message: 'Há volume elevado de alertas críticos simultaneamente abertos.',
    source: 'governance',
    payload: report.alertSummary,
  }));

  return updates.filter(Boolean);
}

async function insertGovernanceReport({ requestedBy = 'system', triggerSource = 'manual', autoEscalate = true } = {}) {
  const summary = await buildGovernanceReport({ requestedBy, triggerSource });
  const result = await pool.query(
    `
      INSERT INTO operational_governance_reports (
        trigger_source, requested_by, status, score, summary, created_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
      RETURNING id, trigger_source AS "triggerSource", requested_by AS "requestedBy", status, score, summary, created_at AS "createdAt"
    `,
    [triggerSource, requestedBy, summary.status, Number(summary.score || 0), JSON.stringify(summary)],
  );
  const row = result.rows[0];
  if (autoEscalate) {
    await applyGovernanceAlertPolicies(summary);
  }
  publish('governance.report', row);
  return row;
}

async function listGovernanceReports({ limit = 20, status = '' } = {}) {
  const safeLimit = clampLimit(limit, 20, 200);
  const params = [];
  let where = '';
  if (status) {
    params.push(String(status).toLowerCase());
    where = `WHERE status = $${params.length}`;
  }
  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT id, trigger_source AS "triggerSource", requested_by AS "requestedBy", status, score, summary, created_at AS "createdAt"
      FROM operational_governance_reports
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows;
}

async function getLatestGovernanceReport() {
  const result = await pool.query(
    `
      SELECT id, trigger_source AS "triggerSource", requested_by AS "requestedBy", status, score, summary, created_at AS "createdAt"
      FROM operational_governance_reports
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  return result.rows[0] || null;
}

async function getGovernanceOverview() {
  const [current, recent] = await Promise.all([
    getLatestGovernanceReport(),
    listGovernanceReports({ limit: 12 }),
  ]);

  const active = current || await insertGovernanceReport({
    requestedBy: 'dashboard',
    triggerSource: 'on_demand',
    autoEscalate: false,
  });

  return {
    current: active,
    recentReports: recent,
    statusLegend: {
      healthy: 'Operação pronta e sem bloqueios críticos.',
      degraded: 'Operação permitida com atenção e correções pendentes.',
      blocked: 'Operação supervisionada deve permanecer bloqueada.',
    },
  };
}

module.exports = {
  buildGovernanceReport,
  calculateGovernanceStatus,
  calculateOperationalScore,
  insertGovernanceReport,
  listGovernanceReports,
  getLatestGovernanceReport,
  getGovernanceOverview,
};
