
const pool = require('../db/pool');
const env = require('../config/env');
const { getExecutionStatus } = require('./executionAdapter.service');
const { getRuntimeControl } = require('./control.service');
const { listActiveAlerts } = require('./alerts.service');
const { getLatestReadinessReport } = require('./readiness.service');
const { publish } = require('./eventBus.service');

function clampLimit(limit, fallback = 50, max = 5000) {
  return Math.max(1, Math.min(Number(limit || fallback), max));
}

function toCsv(rows = []) {
  const flattened = rows.map((row) => {
    const out = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        out[key] = JSON.stringify(value);
      } else {
        out[key] = value;
      }
    });
    return out;
  });

  const headers = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n;]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(',')];
  flattened.forEach((row) => {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  });
  return lines.join('\n');
}

async function buildObservabilitySnapshot({ source = 'manual' } = {}) {
  const [
    workersResult,
    events24hResult,
    decisions24hResult,
    orders24hResult,
    actionLogs24hResult,
    openAlerts,
    latestReadiness,
    execution,
    runtime,
    latestHealthResult,
    latestReconResult,
  ] = await Promise.all([
    pool.query(`SELECT worker_name, status, last_seen_at FROM worker_heartbeats ORDER BY worker_name ASC`),
    pool.query(`SELECT COUNT(*)::int AS total FROM system_events WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    pool.query(`SELECT COUNT(*)::int AS total FROM ai_decisions WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('FILLED','CLOSED'))::int AS filled,
        COUNT(*) FILTER (WHERE status IN ('REJECTED','ERROR'))::int AS failed
      FROM paper_orders
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `),
    pool.query(`SELECT COUNT(*)::int AS total FROM execution_action_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    listActiveAlerts({ limit: 200, status: 'open' }),
    getLatestReadinessReport(),
    getExecutionStatus(),
    getRuntimeControl(),
    pool.query(`SELECT status, severity, created_at AS "createdAt" FROM execution_health_checks ORDER BY created_at DESC LIMIT 1`),
    pool.query(`SELECT status, created_at AS "createdAt" FROM execution_reconciliation_runs ORDER BY created_at DESC LIMIT 1`),
  ]);

  const workerRows = workersResult.rows || [];
  const staleAfterMs = env.health.workerStaleAfterSec * 1000;
  const workers = workerRows.map((row) => {
    const ageSec = row.last_seen_at ? Math.round((Date.now() - new Date(row.last_seen_at).getTime()) / 1000) : null;
    return {
      workerName: row.worker_name,
      status: row.status,
      lastSeenAt: row.last_seen_at,
      ageSec,
      stale: ageSec === null ? true : (ageSec * 1000) > staleAfterMs,
    };
  });

  const summary = {
    source,
    generatedAt: new Date().toISOString(),
    workers: {
      total: workers.length,
      stale: workers.filter((item) => item.stale).length,
      items: workers,
    },
    traffic24h: {
      systemEvents: Number(events24hResult.rows[0]?.total || 0),
      aiDecisions: Number(decisions24hResult.rows[0]?.total || 0),
      paperOrders: Number(orders24hResult.rows[0]?.total || 0),
      paperOrdersFilled: Number(orders24hResult.rows[0]?.filled || 0),
      paperOrdersFailed: Number(orders24hResult.rows[0]?.failed || 0),
      executionActionLogs: Number(actionLogs24hResult.rows[0]?.total || 0),
    },
    alerts: {
      open: openAlerts.length,
      critical: openAlerts.filter((item) => item.severity === 'critical').length,
      high: openAlerts.filter((item) => item.severity === 'high').length,
    },
    readiness: latestReadiness ? {
      id: latestReadiness.id,
      status: latestReadiness.status,
      createdAt: latestReadiness.createdAt,
      counts: latestReadiness.summary?.counts || {},
    } : null,
    execution: {
      mode: execution.mode,
      provider: execution.provider,
      useTestnet: execution.useTestnet,
      dryRun: execution.dryRun,
      latestHealthCheck: latestHealthResult.rows[0] || execution.latestHealthCheck || null,
      latestReconciliation: latestReconResult.rows[0] || execution.recentReconciliations?.[0] || null,
      liveAttemptCount: Array.isArray(execution.recentLiveAttempts) ? execution.recentLiveAttempts.length : 0,
    },
    runtime: {
      isPaused: Boolean(runtime.isPaused),
      emergencyStop: Boolean(runtime.emergencyStop),
      maintenanceMode: Boolean(runtime.maintenanceMode),
    },
  };

  return summary;
}

async function insertObservabilitySnapshot({ source = 'manual' } = {}) {
  const summary = await buildObservabilitySnapshot({ source });
  const result = await pool.query(
    `
      INSERT INTO observability_metric_snapshots (source, summary, created_at)
      VALUES ($1, $2::jsonb, NOW())
      RETURNING id, source, summary, created_at AS "createdAt"
    `,
    [source, JSON.stringify(summary)],
  );
  const row = result.rows[0];
  publish('observability.snapshot', row);
  return row;
}

async function listObservabilitySnapshots({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id, source, summary, created_at AS "createdAt"
      FROM observability_metric_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [clampLimit(limit, 20, 200)],
  );
  return result.rows;
}

async function cleanupObservabilitySnapshots() {
  const days = Math.max(1, Number(env.observability.metricsRetentionDays || 30));
  await pool.query(
    `DELETE FROM observability_metric_snapshots WHERE created_at < NOW() - ($1::text || ' days')::interval`,
    [String(days)],
  );
}

async function getObservabilitySummary() {
  const [latestSnapshot, recentSnapshots] = await Promise.all([
    pool.query(`
      SELECT id, source, summary, created_at AS "createdAt"
      FROM observability_metric_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `),
    listObservabilitySnapshots({ limit: 12 }),
  ]);

  const current = latestSnapshot.rows[0] || await insertObservabilitySnapshot({ source: 'on_demand' });
  return {
    current,
    recentSnapshots,
    exportKinds: [
      'system_events',
      'ai_decisions',
      'paper_orders',
      'execution_action_logs',
      'active_alerts',
      'metrics_snapshots',
      'notification_deliveries',
      'live_order_attempts',
    ],
  };
}

async function loadExportRows(kind, limit) {
  const safeLimit = clampLimit(limit, 200, env.observability.exportMaxRows || 5000);
  const kinds = {
    system_events: {
      sql: `SELECT id, event_type AS "eventType", source, payload, created_at AS "createdAt"
            FROM system_events ORDER BY created_at DESC LIMIT $1`,
    },
    ai_decisions: {
      sql: `SELECT id, worker_name AS "workerName", symbol, action, confidence, blocked, reason, payload, created_at AS "createdAt"
            FROM ai_decisions ORDER BY created_at DESC LIMIT $1`,
    },
    paper_orders: {
      sql: `SELECT id, worker_name AS "workerName", symbol, side, status, requested_notional AS "requestedNotional",
                   requested_quantity AS "requestedQuantity", executed_notional AS "executedNotional",
                   executed_quantity AS "executedQuantity", price, fee_amount AS "feeAmount", reason,
                   rejection_reason AS "rejectionReason", created_at AS "createdAt"
            FROM paper_orders ORDER BY created_at DESC LIMIT $1`,
    },
    execution_action_logs: {
      sql: `SELECT id, action_type AS "actionType", actor, mode, symbol, side, status,
                   confirmation_required AS "confirmationRequired", payload, created_at AS "createdAt"
            FROM execution_action_logs ORDER BY created_at DESC LIMIT $1`,
    },
    active_alerts: {
      sql: `SELECT alert_key AS "alertKey", severity, title, message, source, status, payload,
                   first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt", updated_at AS "updatedAt"
            FROM active_alerts ORDER BY updated_at DESC LIMIT $1`,
    },
    metrics_snapshots: {
      sql: `SELECT id, source, summary, created_at AS "createdAt"
            FROM observability_metric_snapshots ORDER BY created_at DESC LIMIT $1`,
    },
    notification_deliveries: {
      sql: `SELECT id, channel, event_type AS "eventType", severity, destination, status, payload,
                   response_payload AS "responsePayload", error_message AS "errorMessage", created_at AS "createdAt"
            FROM notification_deliveries ORDER BY created_at DESC LIMIT $1`,
    },
    live_order_attempts: {
      sql: `SELECT id, provider, worker_name AS "workerName", symbol, side, status, live_mode_enabled AS "liveModeEnabled",
                   dry_run AS "dryRun", requested_notional AS "requestedNotional", requested_quantity AS "requestedQuantity",
                   executed_notional AS "executedNotional", executed_quantity AS "executedQuantity", price,
                   fee_amount AS "feeAmount", reason, rejection_reason AS "rejectionReason",
                   external_order_id AS "externalOrderId", created_at AS "createdAt"
            FROM live_order_attempts ORDER BY created_at DESC LIMIT $1`,
    },
  };

  if (!kinds[kind]) {
    throw new Error('unsupported_export_kind');
  }

  const result = await pool.query(kinds[kind].sql, [safeLimit]);
  return result.rows;
}

async function exportObservabilityData({ kind, format = 'json', limit = 200 } = {}) {
  const rows = await loadExportRows(kind, limit);
  const normalizedFormat = String(format || 'json').toLowerCase();
  if (normalizedFormat === 'csv') {
    return {
      kind,
      format: 'csv',
      contentType: 'text/csv; charset=utf-8',
      filename: `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      body: toCsv(rows),
      rowsCount: rows.length,
    };
  }
  return {
    kind,
    format: 'json',
    contentType: 'application/json; charset=utf-8',
    filename: `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    body: JSON.stringify({ kind, rowsCount: rows.length, items: rows }, null, 2),
    rowsCount: rows.length,
  };
}

module.exports = {
  buildObservabilitySnapshot,
  insertObservabilitySnapshot,
  listObservabilitySnapshots,
  cleanupObservabilitySnapshots,
  getObservabilitySummary,
  exportObservabilityData,
};
