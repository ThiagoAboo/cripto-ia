const pool = require('../db/pool');
const { publish } = require('./eventBus.service');
const { notifyAlertEvent } = require('./notifications.service');

function normalizeAlertRow(row) {
  if (!row) return null;
  return {
    alertKey: row.alertKey ?? row.alert_key,
    severity: row.severity,
    title: row.title,
    message: row.message,
    source: row.source,
    status: row.status,
    payload: row.payload || {},
    firstSeenAt: row.firstSeenAt ?? row.first_seen_at,
    lastSeenAt: row.lastSeenAt ?? row.last_seen_at,
    acknowledgedAt: row.acknowledgedAt ?? row.acknowledged_at ?? null,
    acknowledgedBy: row.acknowledgedBy ?? row.acknowledged_by ?? null,
    resolvedAt: row.resolvedAt ?? row.resolved_at ?? null,
    resolvedBy: row.resolvedBy ?? row.resolved_by ?? null,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

async function upsertActiveAlert({
  alertKey,
  severity = 'warning',
  title,
  message,
  source = 'system',
  payload = {},
}) {
  const safeKey = String(alertKey || '').trim().toLowerCase();
  if (!safeKey) throw new Error('alert_key_required');
  if (!title || !message) throw new Error('alert_title_and_message_required');

  const result = await pool.query(
    `
      INSERT INTO active_alerts (
        alert_key, severity, title, message, source, status, payload,
        first_seen_at, last_seen_at, updated_at, resolved_at, resolved_by
      )
      VALUES ($1,$2,$3,$4,$5,'active',$6::jsonb,NOW(),NOW(),NOW(),NULL,NULL)
      ON CONFLICT (alert_key)
      DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        source = EXCLUDED.source,
        status = 'active',
        payload = EXCLUDED.payload,
        last_seen_at = NOW(),
        updated_at = NOW(),
        resolved_at = NULL,
        resolved_by = NULL
      RETURNING
        alert_key AS "alertKey",
        severity,
        title,
        message,
        source,
        status,
        payload,
        first_seen_at AS "firstSeenAt",
        last_seen_at AS "lastSeenAt",
        acknowledged_at AS "acknowledgedAt",
        acknowledged_by AS "acknowledgedBy",
        resolved_at AS "resolvedAt",
        resolved_by AS "resolvedBy",
        updated_at AS "updatedAt"
    `,
    [safeKey, String(severity || 'warning').toLowerCase(), title, message, source, JSON.stringify(payload || {})],
  );

  const row = normalizeAlertRow(result.rows[0]);
  publish('alerts.updated', row);
  if (['high', 'critical'].includes(String(row.severity || '').toLowerCase())) {
    notifyAlertEvent(row).catch((error) => console.error('notification dispatch failed', error.message));
  }
  return row;
}

async function acknowledgeAlert(alertKey, acknowledgedBy = 'dashboard') {
  const safeKey = String(alertKey || '').trim().toLowerCase();
  const result = await pool.query(
    `
      UPDATE active_alerts
      SET
        status = CASE WHEN status = 'resolved' THEN status ELSE 'acknowledged' END,
        acknowledged_at = COALESCE(acknowledged_at, NOW()),
        acknowledged_by = COALESCE(acknowledged_by, $2),
        updated_at = NOW()
      WHERE alert_key = $1
      RETURNING
        alert_key AS "alertKey",
        severity,
        title,
        message,
        source,
        status,
        payload,
        first_seen_at AS "firstSeenAt",
        last_seen_at AS "lastSeenAt",
        acknowledged_at AS "acknowledgedAt",
        acknowledged_by AS "acknowledgedBy",
        resolved_at AS "resolvedAt",
        resolved_by AS "resolvedBy",
        updated_at AS "updatedAt"
    `,
    [safeKey, acknowledgedBy],
  );
  const row = normalizeAlertRow(result.rows[0]);
  if (row) publish('alerts.updated', row);
  return row;
}

async function resolveAlert(alertKey, resolvedBy = 'system') {
  const safeKey = String(alertKey || '').trim().toLowerCase();
  const result = await pool.query(
    `
      UPDATE active_alerts
      SET
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = $2,
        updated_at = NOW()
      WHERE alert_key = $1
      RETURNING
        alert_key AS "alertKey",
        severity,
        title,
        message,
        source,
        status,
        payload,
        first_seen_at AS "firstSeenAt",
        last_seen_at AS "lastSeenAt",
        acknowledged_at AS "acknowledgedAt",
        acknowledged_by AS "acknowledgedBy",
        resolved_at AS "resolvedAt",
        resolved_by AS "resolvedBy",
        updated_at AS "updatedAt"
    `,
    [safeKey, resolvedBy],
  );
  const row = normalizeAlertRow(result.rows[0]);
  if (row) publish('alerts.updated', row);
  return row;
}

async function syncAlertState({ active, alertKey, severity = 'warning', title, message, source = 'system', payload = {} }) {
  if (active) {
    return upsertActiveAlert({ alertKey, severity, title, message, source, payload });
  }
  return resolveAlert(alertKey, source);
}

async function listActiveAlerts({ limit = 50, status = 'open' } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  let where = '';
  if (status === 'open') {
    where = "WHERE status <> 'resolved'";
  } else if (status && status !== 'all') {
    where = `WHERE status = $1`;
  }
  const params = [];
  if (where && status !== 'open') params.push(status);
  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT
        alert_key AS "alertKey",
        severity,
        title,
        message,
        source,
        status,
        payload,
        first_seen_at AS "firstSeenAt",
        last_seen_at AS "lastSeenAt",
        acknowledged_at AS "acknowledgedAt",
        acknowledged_by AS "acknowledgedBy",
        resolved_at AS "resolvedAt",
        resolved_by AS "resolvedBy",
        updated_at AS "updatedAt"
      FROM active_alerts
      ${where}
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END ASC,
               updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map(normalizeAlertRow);
}

module.exports = {
  upsertActiveAlert,
  acknowledgeAlert,
  resolveAlert,
  syncAlertState,
  listActiveAlerts,
};
