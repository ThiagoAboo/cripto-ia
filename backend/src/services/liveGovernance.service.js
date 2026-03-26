const pool = require('../db/pool');
const { getLatestReadinessReport } = require('./readiness.service');
const { getObservabilitySummary } = require('./observability.service');
const {
  getRuntimeControl,
  updateRuntimeControl,
  pauseRuntimeControl,
  resumeRuntimeControl,
} = require('./control.service');
const { listActiveAlerts, syncAlertState } = require('./alerts.service');
const { publish } = require('./eventBus.service');

const DEFAULT_LIVE_GOVERNANCE_POLICY = {
  modes: {
    testnet: {
      requiredApprovals: 1,
      allowRequesterApproval: true,
      allowedReadinessStatuses: ['healthy', 'ready'],
      allowedGovernanceStatuses: ['healthy', 'degraded'],
      maxCriticalAlerts: 0,
      maxHighAlerts: 2,
      maxHealthcheckAgeMin: 20,
      maxReconciliationAgeMin: 30,
    },
    live: {
      requiredApprovals: 2,
      allowRequesterApproval: false,
      allowedReadinessStatuses: ['healthy', 'ready'],
      allowedGovernanceStatuses: ['healthy'],
      maxCriticalAlerts: 0,
      maxHighAlerts: 0,
      maxHealthcheckAgeMin: 15,
      maxReconciliationAgeMin: 20,
    },
    paper: {
      requiredApprovals: 0,
      allowRequesterApproval: true,
      allowedReadinessStatuses: ['healthy', 'ready', 'degraded', 'unknown'],
      allowedGovernanceStatuses: ['healthy', 'degraded', 'blocked', 'unknown'],
      maxCriticalAlerts: 999,
      maxHighAlerts: 999,
      maxHealthcheckAgeMin: 120,
      maxReconciliationAgeMin: 120,
    },
  },
  activation: {
    confirmationPrefix: 'CONFIRMAR_',
    defaultRollbackMode: 'paper',
  },
  supervision: {
    recommendRollbackOnCriticalAlerts: true,
    recommendRollbackOnEmergencyStop: true,
    recommendRollbackOnExecutionErrors: true,
    staleWorkersThreshold: 1,
    intervalSec: 300,
  },
};

function normalizeMode(mode, fallback = 'testnet') {
  const value = String(mode || fallback).trim().toLowerCase();
  if (value === 'live') return 'live';
  if (value === 'testnet') return 'testnet';
  if (value === 'paper') return 'paper';
  return fallback;
}

function clampLimit(limit, fallback = 20, max = 200) {
  return Math.max(1, Math.min(Number(limit || fallback), max));
}

function minutesSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - time) / 60000);
}

function evaluateIndicator({ key, label, pass, value, blockOnFail = true, metadata = {} }) {
  return {
    key,
    label,
    status: pass ? 'pass' : (blockOnFail ? 'fail' : 'warn'),
    value,
    blockOnFail: Boolean(blockOnFail),
    metadata,
  };
}

function countBySeverity(alerts = []) {
  return alerts.reduce((acc, item) => {
    const key = String(item?.severity || 'info').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function getLatestPersistedGovernanceReport() {
  const result = await pool.query(
    `
      SELECT id,
             status,
             score,
             summary,
             created_at AS "createdAt"
      FROM operational_governance_reports
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  return result.rows[0] || null;
}

function extractExecutionSummary(observabilitySummary = {}) {
  return observabilitySummary?.current?.summary?.execution || observabilitySummary?.execution || {};
}

async function loadGovernanceInputs() {
  const [control, readiness, observability, alerts, governance] = await Promise.all([
    getRuntimeControl(),
    getLatestReadinessReport(),
    getObservabilitySummary().catch(() => ({ current: { summary: {} } })),
    listActiveAlerts({ limit: 100, status: 'open' }),
    getLatestPersistedGovernanceReport().catch(() => null),
  ]);

  return {
    control: control || {},
    readiness: readiness || { status: 'unknown', summary: { checklist: [] } },
    observability: observability || { current: { summary: {} } },
    alerts: Array.isArray(alerts) ? alerts : [],
    governance: governance || { status: 'unknown', score: null, summary: {} },
  };
}

function buildActivationChecklist(inputs = {}, options = {}) {
  const targetMode = normalizeMode(options.targetMode || inputs?.targetMode || 'testnet');
  const policy = options.policy || DEFAULT_LIVE_GOVERNANCE_POLICY;
  const rules = policy.modes[targetMode] || policy.modes.testnet;

  const control = inputs.control || {};
  const readiness = inputs.readiness || {};
  const governance = inputs.governance || {};
  const alerts = Array.isArray(inputs.alerts) ? inputs.alerts : [];
  const observability = inputs.observability || {};
  const execution = extractExecutionSummary(observability);

  const severity = countBySeverity(alerts);
  const latestHealthCheck = execution.latestHealthCheck || null;
  const latestReconciliation = execution.latestReconciliation || execution.recentReconciliations?.[0] || null;
  const workerItems = observability?.current?.summary?.workers?.items || [];
  const staleWorkers = workerItems.filter((item) => Boolean(item?.stale)).length;

  const readinessStatus = String(readiness.status || 'unknown').toLowerCase();
  const governanceStatus = String(governance.status || 'unknown').toLowerCase();
  const healthAgeMin = minutesSince(latestHealthCheck?.createdAt || latestHealthCheck?.finishedAt || latestHealthCheck?.startedAt);
  const reconciliationAgeMin = minutesSince(latestReconciliation?.createdAt || latestReconciliation?.finishedAt || latestReconciliation?.startedAt);
  const currentMode = normalizeMode(control.executionMode || control.mode || 'paper', 'paper');

  const indicators = [
    evaluateIndicator({
      key: 'readiness_status',
      label: 'Readiness para ativação',
      pass: rules.allowedReadinessStatuses.includes(readinessStatus),
      value: readiness.status || 'unknown',
      metadata: { allowed: rules.allowedReadinessStatuses },
    }),
    evaluateIndicator({
      key: 'governance_status',
      label: 'Status operacional consolidado',
      pass: rules.allowedGovernanceStatuses.includes(governanceStatus),
      value: governance.status || 'unknown',
      metadata: { allowed: rules.allowedGovernanceStatuses, score: governance.score ?? null },
    }),
    evaluateIndicator({
      key: 'critical_alerts',
      label: 'Alertas críticos ativos',
      pass: Number(severity.critical || 0) <= rules.maxCriticalAlerts,
      value: Number(severity.critical || 0),
      metadata: { limit: rules.maxCriticalAlerts },
    }),
    evaluateIndicator({
      key: 'high_alerts',
      label: 'Alertas high ativos',
      pass: Number(severity.high || 0) <= rules.maxHighAlerts,
      value: Number(severity.high || 0),
      blockOnFail: targetMode === 'live',
      metadata: { limit: rules.maxHighAlerts },
    }),
    evaluateIndicator({
      key: 'execution_healthcheck',
      label: 'Healthcheck de execução recente',
      pass: String(latestHealthCheck?.status || '').toLowerCase() === 'ok' && healthAgeMin <= rules.maxHealthcheckAgeMin,
      value: latestHealthCheck?.status || 'missing',
      metadata: { ageMin: Number.isFinite(healthAgeMin) ? Number(healthAgeMin.toFixed(1)) : null, limit: rules.maxHealthcheckAgeMin },
    }),
    evaluateIndicator({
      key: 'execution_reconciliation',
      label: 'Reconciliação recente',
      pass: String(latestReconciliation?.status || '').toLowerCase() === 'ok' && reconciliationAgeMin <= rules.maxReconciliationAgeMin,
      value: latestReconciliation?.status || 'missing',
      metadata: { ageMin: Number.isFinite(reconciliationAgeMin) ? Number(reconciliationAgeMin.toFixed(1)) : null, limit: rules.maxReconciliationAgeMin },
    }),
    evaluateIndicator({
      key: 'runtime_emergency_stop',
      label: 'Emergency stop desativado',
      pass: !control.emergencyStop,
      value: control.emergencyStop ? 'active' : 'inactive',
    }),
    evaluateIndicator({
      key: 'runtime_maintenance_mode',
      label: 'Maintenance mode',
      pass: !control.maintenanceMode,
      value: control.maintenanceMode ? 'active' : 'inactive',
      blockOnFail: targetMode === 'live',
    }),
    evaluateIndicator({
      key: 'workers_stale',
      label: 'Workers com heartbeat recente',
      pass: staleWorkers === 0,
      value: staleWorkers,
      blockOnFail: targetMode === 'live',
    }),
    evaluateIndicator({
      key: 'mode_transition',
      label: 'Transição de modo permitida',
      pass: currentMode !== targetMode,
      value: `${currentMode} -> ${targetMode}`,
      blockOnFail: false,
    }),
  ];

  const blockingIndicators = indicators.filter((item) => item.status === 'fail' && item.blockOnFail);
  const warningIndicators = indicators.filter((item) => item.status === 'warn' || (item.status === 'fail' && !item.blockOnFail));

  const checklistStatus = blockingIndicators.length > 0 ? 'blocked' : (warningIndicators.length > 0 ? 'degraded' : 'healthy');
  const readyToActivate = blockingIndicators.length === 0;
  const confirmationPhrase = `${policy.activation.confirmationPrefix}${targetMode.toUpperCase()}`;

  return {
    targetMode,
    status: checklistStatus,
    readyToActivate,
    confirmationPhrase,
    requiredApprovals: Number(rules.requiredApprovals || 0),
    indicators,
    summary: {
      readinessStatus,
      governanceStatus,
      criticalAlerts: Number(severity.critical || 0),
      highAlerts: Number(severity.high || 0),
      staleWorkers,
      currentMode,
      targetMode,
      latestHealthCheckStatus: latestHealthCheck?.status || 'missing',
      latestReconciliationStatus: latestReconciliation?.status || 'missing',
      healthAgeMin: Number.isFinite(healthAgeMin) ? Number(healthAgeMin.toFixed(1)) : null,
      reconciliationAgeMin: Number.isFinite(reconciliationAgeMin) ? Number(reconciliationAgeMin.toFixed(1)) : null,
    },
  };
}

async function getActivationChecklist({ targetMode = 'testnet' } = {}) {
  const inputs = await loadGovernanceInputs();
  return buildActivationChecklist(inputs, { targetMode });
}

async function insertLiveModeEvent({ eventType, targetMode = null, requestedBy = 'system', actor = requestedBy, summary = {} }) {
  const result = await pool.query(
    `
      INSERT INTO live_mode_events (event_type, target_mode, requested_by, actor, summary, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
      RETURNING id,
                event_type AS "eventType",
                target_mode AS "targetMode",
                requested_by AS "requestedBy",
                actor,
                summary,
                created_at AS "createdAt"
    `,
    [eventType, targetMode, requestedBy, actor, JSON.stringify(summary || {})],
  );
  return result.rows[0];
}

async function getLiveActivationRequestById(id) {
  const requestResult = await pool.query(
    `
      SELECT id,
             target_mode AS "targetMode",
             requested_by AS "requestedBy",
             reason,
             status,
             checklist_status AS "checklistStatus",
             checklist_summary AS "checklistSummary",
             required_approvals AS "requiredApprovals",
             metadata,
             activated_by AS "activatedBy",
             activated_at AS "activatedAt",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM live_activation_requests
      WHERE id = $1
      LIMIT 1
    `,
    [Number(id)],
  );

  const row = requestResult.rows[0];
  if (!row) return null;

  const approvalsResult = await pool.query(
    `
      SELECT id,
             request_id AS "requestId",
             approved_by AS "approvedBy",
             comment,
             created_at AS "createdAt"
      FROM live_activation_request_approvals
      WHERE request_id = $1
      ORDER BY created_at ASC
    `,
    [Number(id)],
  );

  return {
    ...row,
    approvals: approvalsResult.rows,
    approvalsCount: approvalsResult.rows.length,
  };
}

async function listLiveActivationRequests({ status = null, limit = 20 } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(String(status));
    where.push(`status = $${params.length}`);
  }
  params.push(clampLimit(limit));

  const result = await pool.query(
    `
      SELECT id,
             target_mode AS "targetMode",
             requested_by AS "requestedBy",
             reason,
             status,
             checklist_status AS "checklistStatus",
             required_approvals AS "requiredApprovals",
             created_at AS "createdAt",
             updated_at AS "updatedAt",
             activated_at AS "activatedAt"
      FROM live_activation_requests
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows;
}

function nextRequestStatus({ checklistStatus, approvalsCount, requiredApprovals, currentStatus }) {
  if (currentStatus === 'activated') return 'activated';
  if (checklistStatus === 'blocked') return 'pending_checklist';
  if (approvalsCount >= requiredApprovals) return 'approved';
  if (approvalsCount > 0) return 'partially_approved';
  return 'pending_approvals';
}

async function createLiveActivationRequest({
  targetMode = 'testnet',
  requestedBy = 'dashboard',
  reason = 'manual_activation_request',
  metadata = {},
} = {}) {
  const checklist = await getActivationChecklist({ targetMode });
  const status = checklist.status === 'blocked' ? 'pending_checklist' : 'pending_approvals';

  const result = await pool.query(
    `
      INSERT INTO live_activation_requests (
        target_mode,
        requested_by,
        reason,
        status,
        checklist_status,
        checklist_summary,
        required_approvals,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,NOW(),NOW())
      RETURNING id,
                target_mode AS "targetMode",
                requested_by AS "requestedBy",
                reason,
                status,
                checklist_status AS "checklistStatus",
                checklist_summary AS "checklistSummary",
                required_approvals AS "requiredApprovals",
                metadata,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [
      checklist.targetMode,
      requestedBy,
      reason,
      status,
      checklist.status,
      JSON.stringify(checklist),
      checklist.requiredApprovals,
      JSON.stringify(metadata || {}),
    ],
  );

  const row = {
    ...result.rows[0],
    approvals: [],
    approvalsCount: 0,
  };

  await insertLiveModeEvent({
    eventType: 'activation_request_created',
    targetMode: checklist.targetMode,
    requestedBy,
    actor: requestedBy,
    summary: { requestId: row.id, status: row.status, checklistStatus: checklist.status },
  });

  publish('control.live.request_created', { requestId: row.id, targetMode: checklist.targetMode, status: row.status });
  return row;
}

async function revalidateLiveActivationRequest(id, { requestedBy = 'dashboard' } = {}) {
  const current = await getLiveActivationRequestById(id);
  if (!current) {
    throw new Error('activation_request_not_found');
  }
  if (current.status === 'activated') return current;

  const checklist = await getActivationChecklist({ targetMode: current.targetMode });
  const status = nextRequestStatus({
    checklistStatus: checklist.status,
    approvalsCount: current.approvalsCount,
    requiredApprovals: current.requiredApprovals,
    currentStatus: current.status,
  });

  const result = await pool.query(
    `
      UPDATE live_activation_requests
      SET checklist_status = $2,
          checklist_summary = $3::jsonb,
          status = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id,
                target_mode AS "targetMode",
                requested_by AS "requestedBy",
                reason,
                status,
                checklist_status AS "checklistStatus",
                checklist_summary AS "checklistSummary",
                required_approvals AS "requiredApprovals",
                metadata,
                activated_by AS "activatedBy",
                activated_at AS "activatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [Number(id), checklist.status, JSON.stringify(checklist), status],
  );

  const row = {
    ...result.rows[0],
    approvals: current.approvals,
    approvalsCount: current.approvalsCount,
  };

  await insertLiveModeEvent({
    eventType: 'activation_request_revalidated',
    targetMode: row.targetMode,
    requestedBy: row.requestedBy,
    actor: requestedBy,
    summary: { requestId: row.id, status: row.status, checklistStatus: row.checklistStatus },
  });

  publish('control.live.request_revalidated', { requestId: row.id, status: row.status });
  return row;
}

async function approveLiveActivationRequest(id, { approvedBy = 'dashboard', comment = '' } = {}) {
  const request = await getLiveActivationRequestById(id);
  if (!request) {
    throw new Error('activation_request_not_found');
  }
  if (request.status === 'activated') {
    throw new Error('activation_request_already_activated');
  }

  const modeRules = DEFAULT_LIVE_GOVERNANCE_POLICY.modes[request.targetMode] || DEFAULT_LIVE_GOVERNANCE_POLICY.modes.testnet;
  if (!modeRules.allowRequesterApproval && String(request.requestedBy) === String(approvedBy)) {
    throw new Error('requester_cannot_self_approve');
  }
  if (request.approvals.some((item) => String(item.approvedBy) === String(approvedBy))) {
    throw new Error('approval_already_registered');
  }
  if (request.status === 'pending_checklist') {
    throw new Error('activation_request_checklist_blocked');
  }

  await pool.query(
    `
      INSERT INTO live_activation_request_approvals (request_id, approved_by, comment, created_at)
      VALUES ($1,$2,$3,NOW())
    `,
    [Number(id), approvedBy, comment],
  );

  const approvalsCount = request.approvalsCount + 1;
  const nextStatus = nextRequestStatus({
    checklistStatus: request.checklistStatus,
    approvalsCount,
    requiredApprovals: request.requiredApprovals,
    currentStatus: request.status,
  });

  await pool.query(
    `
      UPDATE live_activation_requests
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [Number(id), nextStatus],
  );

  const updated = await getLiveActivationRequestById(id);
  await insertLiveModeEvent({
    eventType: 'activation_request_approved',
    targetMode: updated.targetMode,
    requestedBy: updated.requestedBy,
    actor: approvedBy,
    summary: { requestId: updated.id, approvalsCount: updated.approvalsCount, status: updated.status },
  });

  publish('control.live.request_approved', { requestId: updated.id, approvalsCount: updated.approvalsCount, status: updated.status });
  return updated;
}

async function activateLiveMode(id, {
  activatedBy = 'dashboard',
  confirmationPhrase = '',
  metadata = {},
} = {}) {
  const request = await revalidateLiveActivationRequest(id, { requestedBy: activatedBy });
  if (!request) {
    throw new Error('activation_request_not_found');
  }
  if (request.status !== 'approved') {
    throw new Error(`activation_request_not_approved:${request.status}`);
  }

  const expectedPhrase = `${DEFAULT_LIVE_GOVERNANCE_POLICY.activation.confirmationPrefix}${String(request.targetMode).toUpperCase()}`;
  if (String(confirmationPhrase || '').trim().toUpperCase() !== expectedPhrase) {
    throw new Error('invalid_confirmation_phrase');
  }

  const resumedControl = await resumeRuntimeControl({
    updatedBy: activatedBy,
    metadata: {
      ...(metadata || {}),
      activationRequestId: request.id,
      targetMode: request.targetMode,
      reason: request.reason,
    },
    clearEmergencyStop: true,
  });

  const control = await updateRuntimeControl({
    executionMode: request.targetMode,
    maintenanceMode: false,
    pauseReason: null,
    liveApprovalStatus: 'activated',
    liveActivationRequestId: request.id,
    liveActivationBy: activatedBy,
    liveActivationAt: new Date().toISOString(),
    liveActivationReason: request.reason,
    lastModeChangeReason: request.reason,
  }, { updatedBy: activatedBy });

  const result = await pool.query(
    `
      UPDATE live_activation_requests
      SET status = 'activated',
          activated_by = $2,
          activated_at = NOW(),
          updated_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE id = $1
      RETURNING id,
                target_mode AS "targetMode",
                requested_by AS "requestedBy",
                reason,
                status,
                checklist_status AS "checklistStatus",
                checklist_summary AS "checklistSummary",
                required_approvals AS "requiredApprovals",
                metadata,
                activated_by AS "activatedBy",
                activated_at AS "activatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [Number(id), activatedBy, JSON.stringify({ ...(metadata || {}), activationConfirmed: true })],
  );

  const row = {
    ...result.rows[0],
    approvals: request.approvals,
    approvalsCount: request.approvalsCount,
  };

  await insertLiveModeEvent({
    eventType: 'mode_activated',
    targetMode: row.targetMode,
    requestedBy: row.requestedBy,
    actor: activatedBy,
    summary: { requestId: row.id, control, resumedControl },
  });

  publish('control.live.activated', { requestId: row.id, targetMode: row.targetMode, actor: activatedBy });
  return {
    request: row,
    control,
    resumedControl,
  };
}

async function rollbackLiveMode({
  requestedBy = 'dashboard',
  reason = 'manual_live_rollback',
  targetMode = DEFAULT_LIVE_GOVERNANCE_POLICY.activation.defaultRollbackMode,
  metadata = {},
} = {}) {
  const normalizedTargetMode = normalizeMode(targetMode, DEFAULT_LIVE_GOVERNANCE_POLICY.activation.defaultRollbackMode);
  const paused = await pauseRuntimeControl({
    reason,
    updatedBy: requestedBy,
    emergencyStop: false,
    metadata: { ...(metadata || {}), rollbackTargetMode: normalizedTargetMode },
  });

  const control = await updateRuntimeControl({
    executionMode: normalizedTargetMode,
    maintenanceMode: normalizedTargetMode === 'paper',
    liveApprovalStatus: 'rolled_back',
    liveRollbackAt: new Date().toISOString(),
    liveRollbackBy: requestedBy,
    liveRollbackReason: reason,
    lastModeChangeReason: reason,
  }, { updatedBy: requestedBy });

  await insertLiveModeEvent({
    eventType: 'mode_rollback',
    targetMode: normalizedTargetMode,
    requestedBy,
    actor: requestedBy,
    summary: { reason, control, paused },
  });

  publish('control.live.rollback', { actor: requestedBy, targetMode: normalizedTargetMode, reason });
  return { control, paused, targetMode: normalizedTargetMode };
}

function buildTestnetSupervisionSummary(inputs = {}, options = {}) {
  const policy = options.policy || DEFAULT_LIVE_GOVERNANCE_POLICY;
  const control = inputs.control || {};
  const readiness = inputs.readiness || {};
  const alerts = Array.isArray(inputs.alerts) ? inputs.alerts : [];
  const governance = inputs.governance || {};
  const observability = inputs.observability || {};

  const execution = extractExecutionSummary(observability);
  const severity = countBySeverity(alerts);
  const currentMode = normalizeMode(control.executionMode || control.mode || 'paper', 'paper');
  const staleWorkers = (observability?.current?.summary?.workers?.items || []).filter((item) => item?.stale).length;
  const latestHealthCheck = execution.latestHealthCheck || null;
  const latestReconciliation = execution.latestReconciliation || execution.recentReconciliations?.[0] || null;
  const healthStatus = String(latestHealthCheck?.status || 'missing').toLowerCase();
  const reconciliationStatus = String(latestReconciliation?.status || 'missing').toLowerCase();

  let status = 'idle';
  const blockers = [];
  const warnings = [];

  if (currentMode === 'testnet' || currentMode === 'live') {
    status = 'healthy';
    if (control.emergencyStop && policy.supervision.recommendRollbackOnEmergencyStop) {
      blockers.push('emergency_stop');
    }
    if (Number(severity.critical || 0) > 0 && policy.supervision.recommendRollbackOnCriticalAlerts) {
      blockers.push('critical_alert');
    }
    if ((healthStatus === 'error' || reconciliationStatus === 'error') && policy.supervision.recommendRollbackOnExecutionErrors) {
      blockers.push(healthStatus === 'error' ? 'healthcheck_error' : 'reconciliation_error');
    }
    if (String(readiness.status || '').toLowerCase() === 'blocked') blockers.push('readiness_blocked');
    if (String(governance.status || '').toLowerCase() === 'blocked') blockers.push('governance_blocked');
    if (Number(severity.high || 0) > 0) warnings.push('high_alerts');
    if (staleWorkers >= policy.supervision.staleWorkersThreshold) warnings.push('stale_workers');
    if (control.maintenanceMode) warnings.push('maintenance_mode');

    if (blockers.length > 0) status = 'blocked';
    else if (warnings.length > 0) status = 'degraded';
  }

  return {
    status,
    currentMode,
    recommendRollback: blockers.length > 0 && currentMode === 'live',
    blockers,
    warnings,
    summary: {
      criticalAlerts: Number(severity.critical || 0),
      highAlerts: Number(severity.high || 0),
      staleWorkers,
      readinessStatus: readiness.status || 'unknown',
      governanceStatus: governance.status || 'unknown',
      healthStatus,
      reconciliationStatus,
    },
  };
}

async function listTestnetSupervisionReports({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id,
             trigger_source AS "triggerSource",
             requested_by AS "requestedBy",
             status,
             summary,
             created_at AS "createdAt"
      FROM testnet_supervision_reports
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [clampLimit(limit)],
  );
  return result.rows;
}

async function insertTestnetSupervisionReport({
  requestedBy = 'scheduler',
  triggerSource = 'scheduler',
  autoRollback = false,
} = {}) {
  const inputs = await loadGovernanceInputs();
  const report = buildTestnetSupervisionSummary(inputs, { policy: DEFAULT_LIVE_GOVERNANCE_POLICY });
  const result = await pool.query(
    `
      INSERT INTO testnet_supervision_reports (trigger_source, requested_by, status, summary, created_at)
      VALUES ($1,$2,$3,$4::jsonb,NOW())
      RETURNING id,
                trigger_source AS "triggerSource",
                requested_by AS "requestedBy",
                status,
                summary,
                created_at AS "createdAt"
    `,
    [triggerSource, requestedBy, report.status, JSON.stringify(report)],
  );

  const row = result.rows[0];

  await syncAlertState({
    active: report.status === 'blocked',
    alertKey: 'live-governance:testnet-supervision:blocked',
    severity: 'critical',
    title: 'Supervisão de testnet/live bloqueada',
    message: 'A supervisão identificou condição que recomenda rollback operacional.',
    source: 'live-governance',
    payload: row,
  });

  let rollback = null;
  if (autoRollback && report.recommendRollback) {
    rollback = await rollbackLiveMode({
      requestedBy,
      reason: 'auto_rollback_from_supervision',
      targetMode: DEFAULT_LIVE_GOVERNANCE_POLICY.activation.defaultRollbackMode,
      metadata: { supervisionReportId: row.id },
    });
  }

  await insertLiveModeEvent({
    eventType: 'testnet_supervision',
    targetMode: report.currentMode,
    requestedBy,
    actor: requestedBy,
    summary: { reportId: row.id, status: row.status, recommendRollback: report.recommendRollback, rollback },
  });

  publish('control.live.supervision', { reportId: row.id, status: row.status, recommendRollback: report.recommendRollback });
  return {
    ...row,
    report,
    rollback,
  };
}

async function listLiveModeEvents({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id,
             event_type AS "eventType",
             target_mode AS "targetMode",
             requested_by AS "requestedBy",
             actor,
             summary,
             created_at AS "createdAt"
      FROM live_mode_events
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [clampLimit(limit)],
  );
  return result.rows;
}

module.exports = {
  DEFAULT_LIVE_GOVERNANCE_POLICY,
  normalizeMode,
  buildActivationChecklist,
  getActivationChecklist,
  createLiveActivationRequest,
  getLiveActivationRequestById,
  listLiveActivationRequests,
  revalidateLiveActivationRequest,
  approveLiveActivationRequest,
  activateLiveMode,
  rollbackLiveMode,
  buildTestnetSupervisionSummary,
  insertTestnetSupervisionReport,
  listTestnetSupervisionReports,
  listLiveModeEvents,
};
