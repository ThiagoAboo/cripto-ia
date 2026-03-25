const pool = require('../db/pool');
const env = require('../config/env');
const { getActiveConfig } = require('./config.service');
const { getRuntimeControl } = require('./control.service');
const { getProviderStatuses } = require('./social.service');
const { publish } = require('./eventBus.service');

function buildWorkerMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row.worker_name || row.workerName || '').toLowerCase(), row);
  });
  return map;
}

function workerFresh(worker) {
  if (!worker?.last_seen_at && !worker?.lastSeenAt) return false;
  const lastSeenAt = worker.last_seen_at || worker.lastSeenAt;
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  return ageMs <= env.health.workerStaleAfterSec * 1000;
}

function normalizeReadinessRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestedBy: row.requestedBy ?? row.requested_by,
    triggerSource: row.triggerSource ?? row.trigger_source,
    status: row.status,
    summary: row.summary || {},
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function insertReadinessReport({ requestedBy = 'system', triggerSource = 'manual', status, summary }) {
  const result = await pool.query(
    `
      INSERT INTO readiness_reports (requested_by, trigger_source, status, summary, created_at)
      VALUES ($1,$2,$3,$4::jsonb,NOW())
      RETURNING id, requested_by AS "requestedBy", trigger_source AS "triggerSource", status, summary, created_at AS "createdAt"
    `,
    [requestedBy, triggerSource, status, JSON.stringify(summary || {})],
  );
  return normalizeReadinessRow(result.rows[0]);
}

async function listReadinessReports({ limit = 20 } = {}) {
  const result = await pool.query(
    `
      SELECT id, requested_by AS "requestedBy", trigger_source AS "triggerSource", status, summary, created_at AS "createdAt"
      FROM readiness_reports
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(Number(limit || 20), 100))],
  );
  return result.rows.map(normalizeReadinessRow);
}

async function getLatestReadinessReport() {
  const result = await pool.query(
    `
      SELECT id, requested_by AS "requestedBy", trigger_source AS "triggerSource", status, summary, created_at AS "createdAt"
      FROM readiness_reports
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  return normalizeReadinessRow(result.rows[0]);
}

async function evaluateReadiness({ requestedBy = 'dashboard', triggerSource = 'manual' } = {}) {
  const { getExecutionStatus } = require('./executionAdapter.service');

  const [configRow, execution, control, providers, workersResult, marketResult] = await Promise.all([
    getActiveConfig(),
    getExecutionStatus(),
    getRuntimeControl(),
    getProviderStatuses({ limit: 10 }),
    pool.query(`SELECT worker_name, status, last_seen_at FROM worker_heartbeats`),
    pool.query(`
      SELECT
        (SELECT MAX(updated_at) FROM market_tickers) AS last_ticker_update,
        (SELECT MAX(updated_at) FROM market_candles) AS last_candle_update
    `),
  ]);

  const config = configRow?.config || {};
  const workers = buildWorkerMap(workersResult.rows);
  const aiWorker = workers.get('ai-worker');
  const socialWorker = workers.get('social-worker');
  const tickerFresh = marketResult.rows[0]?.last_ticker_update
    ? (Date.now() - new Date(marketResult.rows[0].last_ticker_update).getTime()) <= 5 * 60 * 1000
    : false;
  const candleFresh = marketResult.rows[0]?.last_candle_update
    ? (Date.now() - new Date(marketResult.rows[0].last_candle_update).getTime()) <= 10 * 60 * 1000
    : false;
  const providerIssues = providers.filter((item) => item.status !== 'ok');

  const checklist = [
    {
      key: 'runtime_not_paused',
      label: 'Runtime sem pausa de emergência',
      critical: true,
      status: control.emergencyStop ? 'fail' : control.isPaused ? 'warn' : 'pass',
      message: control.emergencyStop ? 'Emergency stop ativo.' : control.isPaused ? 'Sistema pausado manualmente.' : 'Runtime liberado.',
    },
    {
      key: 'trading_mode_safe',
      label: 'Execução supervisionada em testnet/dry-run',
      critical: true,
      status: execution.useTestnet && execution.supervised && execution.requireExplicitConfirmation ? 'pass' : 'fail',
      message: execution.useTestnet && execution.supervised && execution.requireExplicitConfirmation
        ? 'Proteções de execução supervisionada ativas.'
        : 'Revise testnet/supervisão/confirmação explícita antes de avançar.',
    },
    {
      key: 'ai_worker_fresh',
      label: 'AI worker saudável',
      critical: true,
      status: workerFresh(aiWorker) ? 'pass' : 'fail',
      message: workerFresh(aiWorker) ? 'Heartbeat recente do AI worker.' : 'AI worker stale ou ausente.',
    },
    {
      key: 'social_worker_fresh',
      label: 'Social worker saudável',
      critical: false,
      status: !config?.social?.enabled || workerFresh(socialWorker) ? 'pass' : 'warn',
      message: !config?.social?.enabled ? 'Social worker desabilitado na config.' : workerFresh(socialWorker) ? 'Heartbeat recente do Social worker.' : 'Social worker stale ou ausente.',
    },
    {
      key: 'market_data_recent',
      label: 'Dados de mercado recentes',
      critical: true,
      status: tickerFresh && candleFresh ? 'pass' : 'fail',
      message: tickerFresh && candleFresh ? 'Tickers e candles com atualização recente.' : 'Atualização de mercado desatualizada.',
    },
    {
      key: 'latest_healthcheck',
      label: 'Último healthcheck de execução',
      critical: true,
      status: execution.latestHealthCheck?.status === 'ok' ? 'pass' : execution.latestHealthCheck?.status === 'warning' ? 'warn' : 'fail',
      message: execution.latestHealthCheck?.status === 'ok'
        ? 'Healthcheck recente sem falhas críticas.'
        : execution.latestHealthCheck?.status === 'warning'
          ? 'Healthcheck recente com warnings.'
          : 'Execute um healthcheck recente de execução.',
    },
    {
      key: 'social_providers',
      label: 'Provedores sociais sem degradação forte',
      critical: false,
      status: providerIssues.length ? 'warn' : 'pass',
      message: providerIssues.length ? `${providerIssues.length} provedor(es) degradado(s).` : 'Provedores sociais saudáveis.',
    },
    {
      key: 'guardrails_configured',
      label: 'Guardrails configurados',
      critical: true,
      status: Number(config?.risk?.dailyMaxLossPct || 0) > 0 && Number(config?.risk?.maxConsecutiveLosses || 0) > 0 ? 'pass' : 'fail',
      message: Number(config?.risk?.dailyMaxLossPct || 0) > 0 && Number(config?.risk?.maxConsecutiveLosses || 0) > 0
        ? 'Limites de perda configurados.'
        : 'Defina dailyMaxLossPct e maxConsecutiveLosses.',
    },
  ];

  const criticalFail = checklist.some((item) => item.critical && item.status === 'fail');
  const hasWarn = checklist.some((item) => item.status === 'warn');
  const status = criticalFail ? 'blocked' : hasWarn ? 'warning' : 'ready';
  const summary = {
    configVersion: configRow?.version || 0,
    mode: execution.mode,
    liveReady: execution.liveReady,
    useTestnet: execution.useTestnet,
    dryRun: execution.dryRun,
    supervised: execution.supervised,
    checklist,
    counts: {
      pass: checklist.filter((item) => item.status === 'pass').length,
      warn: checklist.filter((item) => item.status === 'warn').length,
      fail: checklist.filter((item) => item.status === 'fail').length,
    },
    workerSnapshot: {
      aiWorkerFresh: workerFresh(aiWorker),
      socialWorkerFresh: workerFresh(socialWorker),
    },
  };

  const report = await insertReadinessReport({ requestedBy, triggerSource, status, summary });
  publish('readiness.updated', report);
  return report;
}

module.exports = {
  evaluateReadiness,
  listReadinessReports,
  getLatestReadinessReport,
};
