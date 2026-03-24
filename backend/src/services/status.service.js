const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');

async function getSystemStatus() {
  const [configRow, workers, recentEvents, recentDecisions] = await Promise.all([
    getActiveConfig(),
    pool.query(
      `
        SELECT worker_name, status, last_seen_at, payload
        FROM worker_heartbeats
        ORDER BY worker_name ASC
      `,
    ),
    pool.query(
      `
        SELECT id, event_type, source, payload, created_at
        FROM system_events
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ),
    pool.query(
      `
        SELECT id, worker_name, symbol, action, confidence, blocked, reason, payload, created_at
        FROM ai_decisions
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ),
  ]);

  return {
    configVersion: configRow?.version ?? 0,
    workers: workers.rows,
    recentEvents: recentEvents.rows,
    recentDecisions: recentDecisions.rows,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getSystemStatus,
};
