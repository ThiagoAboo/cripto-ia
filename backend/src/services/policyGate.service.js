const pool = require('../db/pool');
const env = require('../config/env');
const { getRuntimeControl } = require('./control.service');
const { listActiveAlerts } = require('./alerts.service');
const { getLatestReadinessReport } = require('./readiness.service');
const { getExecutionStatus } = require('./executionAdapter.service');

function toCheck(key, ok, severity, message, meta = {}) {
  return { key, ok: Boolean(ok), severity, message, ...meta };
}

async function recordPolicyGateReport({ gateType = 'promotion', targetChannel = null, status = 'pass', requestedBy = 'system', summary = {} }) {
  const result = await pool.query(
    `
      INSERT INTO policy_gate_reports (gate_type, target_channel, status, requested_by, summary, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
      RETURNING id, gate_type AS "gateType", target_channel AS "targetChannel", status, requested_by AS "requestedBy", summary, created_at AS "createdAt"
    `,
    [gateType, targetChannel, status, requestedBy, JSON.stringify(summary || {})],
  );
  return result.rows[0];
}

async function listPolicyGateReports({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const result = await pool.query(
    `
      SELECT id, gate_type AS "gateType", target_channel AS "targetChannel", status, requested_by AS "requestedBy", summary, created_at AS "createdAt"
      FROM policy_gate_reports
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

async function evaluatePromotionPolicy({ targetChannel = 'paper_active', candidateSummary = {}, requestedBy = 'system' } = {}) {
  const [control, activeAlerts, latestReadiness, execution] = await Promise.all([
    getRuntimeControl(),
    listActiveAlerts({ limit: 50, status: 'open' }),
    getLatestReadinessReport(),
    getExecutionStatus(),
  ]);

  const criticalAlerts = activeAlerts.filter((item) => ['critical'].includes(String(item.severity).toLowerCase()));
  const highAlerts = activeAlerts.filter((item) => ['high'].includes(String(item.severity).toLowerCase()));
  const checks = [
    toCheck('not_emergency_stop', !control.emergencyStop, 'critical', control.emergencyStop ? 'Emergency stop ativo.' : 'Emergency stop desativado.'),
    toCheck('not_in_maintenance', !control.maintenanceMode || !env.policy.requireNoMaintenanceForPromotion, 'high', control.maintenanceMode ? 'Maintenance mode ativo.' : 'Sem maintenance mode.'),
    toCheck('no_critical_alerts', criticalAlerts.length === 0 || !env.policy.requireNoCriticalAlertsForPromotion, 'high', criticalAlerts.length ? `${criticalAlerts.length} alerta(s) críticos ativos.` : 'Sem alertas críticos.'),
    toCheck('readiness_recent', !env.policy.requireReadinessForPromotion || ['ready', 'warning'].includes(String(latestReadiness?.status || '').toLowerCase()), 'warning', latestReadiness ? `Último readiness: ${latestReadiness.status}.` : 'Sem readiness recente.'),
  ];

  if (targetChannel === 'live_candidate' || targetChannel === 'live_active') {
    checks.push(
      toCheck('execution_supervised', Boolean(execution.supervised), 'critical', execution.supervised ? 'Execução supervisionada ativa.' : 'Execução supervisionada ausente.'),
      toCheck('testnet_required', !env.policy.requireTestnetForLiveCandidate || Boolean(execution.useTestnet), 'critical', execution.useTestnet ? 'Modo testnet habilitado.' : 'Testnet ausente.'),
      toCheck('dry_run_required', !env.policy.requireDryRunForLiveCandidate || Boolean(execution.dryRun), 'critical', execution.dryRun ? 'Dry-run habilitado.' : 'Dry-run ausente.'),
      toCheck('explicit_confirmation_required', !env.policy.requireExplicitConfirmationForLiveCandidate || Boolean(execution.requireExplicitConfirmation), 'critical', execution.requireExplicitConfirmation ? 'Confirmação explícita exigida.' : 'Confirmação explícita ausente.'),
      toCheck('latest_health_ok', ['ok', 'warning'].includes(String(execution.latestHealthCheck?.status || '').toLowerCase()), 'warning', execution.latestHealthCheck ? `Último healthcheck: ${execution.latestHealthCheck.status}.` : 'Sem healthcheck recente.'),
    );
  }

  const blockingChecks = checks.filter((item) => !item.ok && ['critical', 'high'].includes(item.severity));
  const warningChecks = checks.filter((item) => !item.ok && item.severity === 'warning');
  const status = blockingChecks.length ? 'blocked' : warningChecks.length ? 'warning' : 'pass';
  const report = await recordPolicyGateReport({
    gateType: 'promotion',
    targetChannel,
    status,
    requestedBy,
    summary: {
      candidateSummary,
      checks,
      criticalAlerts: criticalAlerts.length,
      highAlerts: highAlerts.length,
      readinessStatus: latestReadiness?.status || null,
      control: {
        isPaused: control.isPaused,
        emergencyStop: control.emergencyStop,
        maintenanceMode: control.maintenanceMode,
      },
    },
  });

  return {
    targetChannel,
    status,
    allow: blockingChecks.length === 0,
    checks,
    blockingChecks,
    warningChecks,
    report,
  };
}

module.exports = {
  evaluatePromotionPolicy,
  listPolicyGateReports,
};
