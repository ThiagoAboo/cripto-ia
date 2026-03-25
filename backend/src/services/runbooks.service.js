const pool = require('../db/pool');
const { pauseRuntimeControl, resumeRuntimeControl, setMaintenanceMode, clearMaintenanceMode } = require('./control.service');
const { runExecutionHealthCheck, runExecutionReconciliation } = require('./executionAdapter.service');
const { evaluateReadiness } = require('./readiness.service');
const { syncAlertState } = require('./alerts.service');
const { dispatchNotification } = require('./notifications.service');

const DEFAULT_RUNBOOKS = [
  {
    runbookKey: 'worker_stale',
    title: 'Worker stale ou sem heartbeat',
    severity: 'high',
    description: 'Usar quando AI worker ou social-worker parar de enviar heartbeat e o status marcar stale.',
    tags: ['workers', 'heartbeat', 'runtime'],
    detectionSignals: [
      'worker stale no painel',
      'último heartbeat acima do limite',
      'decisões ou scores sociais parados',
    ],
    steps: [
      'Confirmar qual worker ficou stale e há quanto tempo.',
      'Pausar o bot se houver risco operacional.',
      'Rodar readiness para mapear impacto lateral.',
      'Verificar logs do container/serviço e reiniciar o processo se necessário.',
      'Retomar só após heartbeat fresco e readiness em PASS/WARN aceitável.',
    ],
    recoveryActions: [
      { actionKey: 'pause_bot', label: 'Pausar bot', kind: 'control' },
      { actionKey: 'run_readiness', label: 'Rodar readiness', kind: 'diagnostic' },
      { actionKey: 'maintenance_on', label: 'Ativar maintenance mode', kind: 'control' },
    ],
  },
  {
    runbookKey: 'execution_health_failed',
    title: 'Execution healthcheck falhou',
    severity: 'critical',
    description: 'Aplicar quando o healthcheck da execution der erro ou timeout na Binance/testnet.',
    tags: ['execution', 'exchange', 'connectivity'],
    detectionSignals: [
      'último healthcheck com status failed',
      'timeout em server time/account',
      'capabilities live indisponíveis',
    ],
    steps: [
      'Rodar healthcheck manual para confirmar o sintoma.',
      'Ativar maintenance mode se a falha for persistente.',
      'Reconciliar posições/ordens para entender o impacto.',
      'Notificar operação e registrar o incidente.',
      'Somente liberar fluxo supervisionado após healthcheck healthy.',
    ],
    recoveryActions: [
      { actionKey: 'run_healthcheck', label: 'Rodar healthcheck', kind: 'diagnostic' },
      { actionKey: 'maintenance_on', label: 'Ativar maintenance mode', kind: 'control' },
      { actionKey: 'run_reconciliation', label: 'Rodar reconciliação', kind: 'diagnostic' },
      { actionKey: 'notify_ops', label: 'Notificar operação', kind: 'notification' },
    ],
  },
  {
    runbookKey: 'reconciliation_mismatch',
    title: 'Mismatch na reconciliação',
    severity: 'critical',
    description: 'Usar quando posições locais e remotas divergirem ou houver open orders inesperadas.',
    tags: ['execution', 'reconciliation', 'orders'],
    detectionSignals: [
      'reconciliação recente com status failed',
      'símbolo remoto sem posição local',
      'posição local sem saldo remoto correspondente',
    ],
    steps: [
      'Pausar novas entradas imediatamente.',
      'Rodar reconciliação manual e coletar divergências.',
      'Conferir últimas tentativas live e action logs.',
      'Manter maintenance mode ativo até fechar as diferenças.',
      'Registrar a ação corretiva tomada em recovery actions.',
    ],
    recoveryActions: [
      { actionKey: 'pause_bot', label: 'Pausar bot', kind: 'control' },
      { actionKey: 'run_reconciliation', label: 'Rodar reconciliação', kind: 'diagnostic' },
      { actionKey: 'maintenance_on', label: 'Ativar maintenance mode', kind: 'control' },
    ],
  },
  {
    runbookKey: 'social_provider_degraded',
    title: 'Provider social degradado',
    severity: 'warning',
    description: 'Quando CoinGecko Demo ou Reddit opcional falharem por rate limit ou indisponibilidade.',
    tags: ['social', 'providers', 'degradation'],
    detectionSignals: [
      'provider status degraded/backoff',
      'última falha 401/403/429',
      'fallback de cache local em uso',
    ],
    steps: [
      'Confirmar se o fallback de cache está ativo.',
      'Rodar readiness para ver se algum gate ficou bloqueado.',
      'Validar se o trading continua sem depender do social provider.',
      'Monitorar nova tentativa automática após retry_after.',
    ],
    recoveryActions: [
      { actionKey: 'run_readiness', label: 'Rodar readiness', kind: 'diagnostic' },
      { actionKey: 'notify_ops', label: 'Notificar operação', kind: 'notification' },
    ],
  },
  {
    runbookKey: 'emergency_stop_triggered',
    title: 'Emergency stop acionado',
    severity: 'critical',
    description: 'Usar quando o sistema entrar em emergency stop manual ou automático.',
    tags: ['control', 'emergency', 'risk'],
    detectionSignals: [
      'control.emergencyStop = true',
      'alerta crítico aberto',
      'circuit breaker acionado',
    ],
    steps: [
      'Registrar a causa raiz do emergency stop.',
      'Rodar readiness e healthcheck.',
      'Executar reconciliação antes de qualquer retomada.',
      'Remover emergency stop apenas com checklist completo.',
    ],
    recoveryActions: [
      { actionKey: 'run_readiness', label: 'Rodar readiness', kind: 'diagnostic' },
      { actionKey: 'run_healthcheck', label: 'Rodar healthcheck', kind: 'diagnostic' },
      { actionKey: 'run_reconciliation', label: 'Rodar reconciliação', kind: 'diagnostic' },
      { actionKey: 'resume_bot', label: 'Retomar controle', kind: 'control' },
    ],
  },
  {
    runbookKey: 'market_data_stale',
    title: 'Dados de mercado desatualizados',
    severity: 'high',
    description: 'Aplicar quando candles/tickers ficarem sem atualização recente ou o painel indicar data stale.',
    tags: ['market', 'candles', 'tickers'],
    detectionSignals: [
      'lastTickerUpdate muito antigo',
      'lastCandleUpdate muito antigo',
      'readiness bloqueado por market data stale',
    ],
    steps: [
      'Pausar entradas até os dados voltarem a atualizar.',
      'Rodar readiness para confirmar o impacto.',
      'Checar conectividade da fonte de mercado e limites da API.',
      'Retomar somente com timestamps recentes.',
    ],
    recoveryActions: [
      { actionKey: 'pause_bot', label: 'Pausar bot', kind: 'control' },
      { actionKey: 'run_readiness', label: 'Rodar readiness', kind: 'diagnostic' },
      { actionKey: 'maintenance_on', label: 'Ativar maintenance mode', kind: 'control' },
    ],
  },
];

async function ensureRunbookTables(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS operational_runbooks (
      runbook_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      description TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      detection_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      recovery_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS incident_drills (
      id BIGSERIAL PRIMARY KEY,
      scenario_key TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      status TEXT NOT NULL DEFAULT 'simulated',
      triggered_by TEXT NOT NULL DEFAULT 'dashboard',
      notes TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS recovery_actions (
      id BIGSERIAL PRIMARY KEY,
      runbook_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      action_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      actor TEXT NOT NULL DEFAULT 'dashboard',
      notes TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const item of DEFAULT_RUNBOOKS) {
    await client.query(
      `
        INSERT INTO operational_runbooks (
          runbook_key,
          title,
          severity,
          description,
          tags,
          detection_signals,
          steps,
          recovery_actions,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, '{}'::jsonb)
        ON CONFLICT (runbook_key)
        DO UPDATE SET
          title = EXCLUDED.title,
          severity = EXCLUDED.severity,
          description = EXCLUDED.description,
          tags = EXCLUDED.tags,
          detection_signals = EXCLUDED.detection_signals,
          steps = EXCLUDED.steps,
          recovery_actions = EXCLUDED.recovery_actions,
          updated_at = NOW();
      `,
      [
        item.runbookKey,
        item.title,
        item.severity,
        item.description,
        JSON.stringify(item.tags || []),
        JSON.stringify(item.detectionSignals || []),
        JSON.stringify(item.steps || []),
        JSON.stringify(item.recoveryActions || []),
      ],
    );
  }
}

function normalizeRunbookRow(row) {
  if (!row) return null;
  return {
    runbookKey: row.runbook_key,
    title: row.title,
    severity: row.severity,
    description: row.description,
    tags: row.tags || [],
    detectionSignals: row.detection_signals || [],
    steps: row.steps || [],
    recoveryActions: row.recovery_actions || [],
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeIncidentDrillRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    scenarioKey: row.scenario_key,
    title: row.title,
    severity: row.severity,
    status: row.status,
    triggeredBy: row.triggered_by,
    notes: row.notes,
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRecoveryActionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runbookKey: row.runbook_key,
    actionKey: row.action_key,
    actionLabel: row.action_label,
    status: row.status,
    actor: row.actor,
    notes: row.notes,
    payload: row.payload || {},
    result: row.result || {},
    createdAt: row.created_at,
  };
}

async function listRunbooks({ limit = 20 } = {}) {
  await ensureRunbookTables();
  const result = await pool.query(
    `
      SELECT *
      FROM operational_runbooks
      ORDER BY severity DESC, runbook_key ASC
      LIMIT $1
    `,
    [Number(limit || 20)],
  );
  return result.rows.map(normalizeRunbookRow);
}

async function getRunbook(runbookKey) {
  await ensureRunbookTables();
  const result = await pool.query(
    `SELECT * FROM operational_runbooks WHERE runbook_key = $1 LIMIT 1`,
    [String(runbookKey || '').trim()],
  );
  return normalizeRunbookRow(result.rows[0]);
}

async function listIncidentDrills({ limit = 20 } = {}) {
  await ensureRunbookTables();
  const result = await pool.query(
    `
      SELECT *
      FROM incident_drills
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Number(limit || 20)],
  );
  return result.rows.map(normalizeIncidentDrillRow);
}

async function listRecoveryActions({ limit = 20 } = {}) {
  await ensureRunbookTables();
  const result = await pool.query(
    `
      SELECT *
      FROM recovery_actions
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Number(limit || 20)],
  );
  return result.rows.map(normalizeRecoveryActionRow);
}

async function simulateIncidentDrill({ scenarioKey, severity = null, actor = 'dashboard', notes = '', payload = {} } = {}) {
  await ensureRunbookTables();

  const runbook = await getRunbook(scenarioKey);
  if (!runbook) {
    throw new Error(`Runbook não encontrado para o cenário ${scenarioKey}`);
  }

  const chosenSeverity = severity || runbook.severity || 'warning';
  const result = await pool.query(
    `
      INSERT INTO incident_drills (
        scenario_key,
        title,
        severity,
        status,
        triggered_by,
        notes,
        payload
      )
      VALUES ($1, $2, $3, 'simulated', $4, $5, $6::jsonb)
      RETURNING *
    `,
    [
      runbook.runbookKey,
      runbook.title,
      chosenSeverity,
      actor,
      notes || null,
      JSON.stringify({ ...payload, simulated: true, runbookKey: runbook.runbookKey }),
    ],
  );

  const item = normalizeIncidentDrillRow(result.rows[0]);

  await syncAlertState({
    active: true,
    alertKey: `incident_drill:${runbook.runbookKey}`,
    severity: chosenSeverity,
    title: `Simulação: ${runbook.title}`,
    message: notes || `Incidente simulado para o runbook ${runbook.runbookKey}.`,
    source: 'incident_drill',
    payload: {
      runbookKey: runbook.runbookKey,
      drillId: item.id,
      simulated: true,
    },
  });

  await pool.query(
    `
      INSERT INTO system_events (event_type, source, payload)
      VALUES ($1, $2, $3::jsonb)
    `,
    ['incident.drill.simulated', 'runbooks', JSON.stringify(item)],
  );

  return item;
}

async function executeRecoveryAction({ runbookKey, actionKey, actor = 'dashboard', notes = '', payload = {} } = {}) {
  await ensureRunbookTables();

  const runbook = await getRunbook(runbookKey);
  if (!runbook) {
    throw new Error(`Runbook não encontrado: ${runbookKey}`);
  }

  const actionDefinition = (runbook.recoveryActions || []).find((item) => item.actionKey === actionKey);
  if (!actionDefinition) {
    throw new Error(`Ação ${actionKey} não encontrada no runbook ${runbookKey}`);
  }

  let resultPayload = {};
  let status = 'completed';

  try {
    if (actionKey === 'pause_bot') {
      resultPayload = await pauseRuntimeControl({ reason: `runbook:${runbookKey}:${actionKey}`, updatedBy: actor, metadata: payload });
    } else if (actionKey === 'resume_bot') {
      resultPayload = await resumeRuntimeControl({ updatedBy: actor, metadata: payload, clearEmergencyStop: true });
    } else if (actionKey === 'maintenance_on') {
      resultPayload = await setMaintenanceMode({ reason: `runbook:${runbookKey}`, updatedBy: actor, metadata: payload });
    } else if (actionKey === 'maintenance_off') {
      resultPayload = await clearMaintenanceMode({ updatedBy: actor, metadata: payload, resume: false });
    } else if (actionKey === 'run_healthcheck') {
      resultPayload = await runExecutionHealthCheck({ requestedBy: `runbook:${actor}` });
    } else if (actionKey === 'run_reconciliation') {
      resultPayload = await runExecutionReconciliation({ requestedBy: `runbook:${actor}`, symbols: payload?.symbols || [] });
    } else if (actionKey === 'run_readiness') {
      resultPayload = await evaluateReadiness({ requestedBy: `runbook:${actor}`, triggerSource: 'runbook' });
    } else if (actionKey === 'notify_ops') {
      resultPayload = await dispatchNotification('runbook.recovery', {
        runbookKey,
        actionKey,
        notes,
        actor,
      }, { severity: runbook.severity || 'warning' });
    } else if (actionKey === 'resolve_simulated_alert') {
      await syncAlertState({
        active: false,
        alertKey: `incident_drill:${runbookKey}`,
        severity: runbook.severity || 'warning',
        title: `Simulação: ${runbook.title}`,
        message: 'Incidente simulado resolvido.',
        source: 'incident_drill',
        payload: { runbookKey },
      });
      resultPayload = { resolved: true };
    } else {
      throw new Error(`Ação ${actionKey} ainda não implementada.`);
    }
  } catch (error) {
    status = 'failed';
    resultPayload = { error: error.message };
  }

  const inserted = await pool.query(
    `
      INSERT INTO recovery_actions (
        runbook_key,
        action_key,
        action_label,
        status,
        actor,
        notes,
        payload,
        result
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      RETURNING *
    `,
    [
      runbookKey,
      actionKey,
      actionDefinition.label,
      status,
      actor,
      notes || null,
      JSON.stringify(payload || {}),
      JSON.stringify(resultPayload || {}),
    ],
  );

  await pool.query(
    `
      INSERT INTO system_events (event_type, source, payload)
      VALUES ($1, $2, $3::jsonb)
    `,
    ['incident.recovery_action', 'runbooks', JSON.stringify({ runbookKey, actionKey, status, actor })],
  );

  if (status === 'completed' && actionKey === 'maintenance_off') {
    await syncAlertState({
      active: false,
      alertKey: `incident_drill:${runbookKey}`,
      severity: runbook.severity || 'warning',
      title: `Simulação: ${runbook.title}`,
      message: 'Incidente simulado resolvido após maintenance off.',
      source: 'incident_drill',
      payload: { runbookKey },
    });
  }

  return normalizeRecoveryActionRow(inserted.rows[0]);
}

module.exports = {
  ensureRunbookTables,
  listRunbooks,
  getRunbook,
  listIncidentDrills,
  listRecoveryActions,
  simulateIncidentDrill,
  executeRecoveryAction,
};
