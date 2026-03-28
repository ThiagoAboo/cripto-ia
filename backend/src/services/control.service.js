const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { getPaperSettings } = require('./portfolio.service');

function normalizeControlRow(row) {
  if (!row) {
    return {
      controlKey: 'active',
      isPaused: false,
      emergencyStop: false,
      pauseReason: null,
      maintenanceMode: false,
      maintenanceReason: null,
      maintenanceScope: 'system',
      maintenanceUntil: null,
      updatedBy: 'system',
      metadata: {},
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    controlKey: row.controlKey || row.control_key || 'active',
    isPaused: Boolean(row.isPaused ?? row.is_paused),
    emergencyStop: Boolean(row.emergencyStop ?? row.emergency_stop),
    pauseReason: row.pauseReason ?? row.pause_reason ?? null,
    maintenanceMode: Boolean(row.maintenanceMode ?? row.maintenance_mode),
    maintenanceReason: row.maintenanceReason ?? row.maintenance_reason ?? null,
    maintenanceScope: row.maintenanceScope ?? row.maintenance_scope ?? 'system',
    maintenanceUntil: row.maintenanceUntil ?? row.maintenance_until ?? null,
    updatedBy: row.updatedBy ?? row.updated_by ?? 'system',
    metadata: row.metadata || {},
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

function normalizeCooldownRow(row) {
  return {
    symbol: row.symbol,
    cooldownType: row.cooldownType ?? row.cooldown_type,
    reason: row.reason,
    activeUntil: row.activeUntil ?? row.active_until,
    payload: row.payload || {},
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function pickLossDetail(row = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return (
    row.reason
    || row.rejection_reason
    || row.rejectionReason
    || payload.reason
    || payload.summary
    || payload.message
    || null
  );
}

function normalizeLossRow(row = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    symbol: row.symbol || payload.symbol || null,
    realizedPnl: Number(row.realized_pnl ?? row.realizedPnl ?? 0),
    pnlPct: Number(row.pnl_pct ?? row.pnlPct ?? 0),
    reason: pickLossDetail(row),
    summary: payload.summary || payload.message || null,
    message: payload.message || null,
    payload,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

async function ensureRuntimeControl(client = pool) {
  await client.query(`
    INSERT INTO bot_runtime_controls (
      control_key, is_paused, emergency_stop, pause_reason,
      maintenance_mode, maintenance_reason, maintenance_scope, maintenance_until,
      updated_by, metadata
    )
    VALUES ('active', FALSE, FALSE, NULL, FALSE, NULL, 'system', NULL, 'system', '{}'::jsonb)
    ON CONFLICT (control_key) DO NOTHING
  `);
}

async function getRuntimeControl(client = pool) {
  await ensureRuntimeControl(client);
  const result = await client.query(`
    SELECT
      control_key AS "controlKey",
      is_paused AS "isPaused",
      emergency_stop AS "emergencyStop",
      pause_reason AS "pauseReason",
      maintenance_mode AS "maintenanceMode",
      maintenance_reason AS "maintenanceReason",
      maintenance_scope AS "maintenanceScope",
      maintenance_until AS "maintenanceUntil",
      updated_by AS "updatedBy",
      metadata,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM bot_runtime_controls
    WHERE control_key = 'active'
    LIMIT 1
  `);

  return normalizeControlRow(result.rows[0]);
}

async function updateRuntimeControl(patch = {}, options = {}, client = pool) {
  const current = await getRuntimeControl(client);
  const metadata = {
    ...(current.metadata || {}),
    ...(patch.metadata || {}),
  };

  const nextState = {
    isPaused: patch.isPaused ?? current.isPaused,
    emergencyStop: patch.emergencyStop ?? current.emergencyStop,
    pauseReason: patch.pauseReason !== undefined ? patch.pauseReason : current.pauseReason,
    maintenanceMode: patch.maintenanceMode ?? current.maintenanceMode,
    maintenanceReason:
      patch.maintenanceReason !== undefined
        ? patch.maintenanceReason
        : current.maintenanceReason,
    maintenanceScope:
      patch.maintenanceScope !== undefined ? patch.maintenanceScope : current.maintenanceScope,
    maintenanceUntil:
      patch.maintenanceUntil !== undefined ? patch.maintenanceUntil : current.maintenanceUntil,
    updatedBy: options.updatedBy || patch.updatedBy || current.updatedBy || 'system',
    metadata,
  };

  const result = await client.query(
    `
      UPDATE bot_runtime_controls
      SET
        is_paused = $2,
        emergency_stop = $3,
        pause_reason = $4,
        maintenance_mode = $5,
        maintenance_reason = $6,
        maintenance_scope = $7,
        maintenance_until = $8,
        updated_by = $9,
        metadata = $10::jsonb,
        updated_at = NOW()
      WHERE control_key = $1
      RETURNING
        control_key AS "controlKey",
        is_paused AS "isPaused",
        emergency_stop AS "emergencyStop",
        pause_reason AS "pauseReason",
        maintenance_mode AS "maintenanceMode",
        maintenance_reason AS "maintenanceReason",
        maintenance_scope AS "maintenanceScope",
        maintenance_until AS "maintenanceUntil",
        updated_by AS "updatedBy",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      'active',
      nextState.isPaused,
      nextState.emergencyStop,
      nextState.pauseReason,
      nextState.maintenanceMode,
      nextState.maintenanceReason,
      nextState.maintenanceScope,
      nextState.maintenanceUntil,
      nextState.updatedBy,
      JSON.stringify(nextState.metadata || {}),
    ],
  );

  return normalizeControlRow(result.rows[0]);
}

async function pauseRuntimeControl(
  { reason = 'manual_pause', updatedBy = 'system', emergencyStop = false, metadata = {} } = {},
  client = pool,
) {
  return updateRuntimeControl(
    {
      isPaused: true,
      emergencyStop: Boolean(emergencyStop),
      pauseReason: reason,
      metadata: {
        ...metadata,
        lastAction: emergencyStop ? 'EMERGENCY_STOP' : 'PAUSE',
        pausedAt: new Date().toISOString(),
      },
    },
    { updatedBy },
    client,
  );
}

async function resumeRuntimeControl(
  { updatedBy = 'system', metadata = {}, clearEmergencyStop = true } = {},
  client = pool,
) {
  return updateRuntimeControl(
    {
      isPaused: false,
      emergencyStop: clearEmergencyStop ? false : undefined,
      pauseReason: null,
      metadata: {
        ...metadata,
        lastAction: 'RESUME',
        resumedAt: new Date().toISOString(),
      },
    },
    { updatedBy },
    client,
  );
}

async function setMaintenanceMode(
  { reason = 'manual_maintenance', scope = 'system', until = null, updatedBy = 'system', metadata = {} } = {},
  client = pool,
) {
  return updateRuntimeControl(
    {
      isPaused: true,
      maintenanceMode: true,
      maintenanceReason: reason,
      maintenanceScope: scope || 'system',
      maintenanceUntil: until || null,
      pauseReason: reason,
      metadata: {
        ...metadata,
        lastAction: 'MAINTENANCE_ON',
        maintenanceAt: new Date().toISOString(),
      },
    },
    { updatedBy },
    client,
  );
}

async function clearMaintenanceMode(
  { updatedBy = 'system', metadata = {}, resume = false } = {},
  client = pool,
) {
  return updateRuntimeControl(
    {
      maintenanceMode: false,
      maintenanceReason: null,
      maintenanceScope: 'system',
      maintenanceUntil: null,
      pauseReason: resume ? null : undefined,
      isPaused: resume ? false : undefined,
      metadata: {
        ...metadata,
        lastAction: resume ? 'MAINTENANCE_OFF_AND_RESUME' : 'MAINTENANCE_OFF',
        maintenanceClearedAt: new Date().toISOString(),
      },
    },
    { updatedBy },
    client,
  );
}

async function listCooldowns({ activeOnly = true, limit = 100 } = {}, client = pool) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const where = activeOnly ? 'WHERE active_until > NOW()' : '';
  const result = await client.query(
    `
      SELECT
        symbol,
        cooldown_type AS "cooldownType",
        reason,
        active_until AS "activeUntil",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM symbol_cooldowns
      ${where}
      ORDER BY active_until DESC, symbol ASC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map(normalizeCooldownRow);
}

async function getCooldownForSymbol(symbol, client = pool) {
  const safeSymbol = String(symbol || '').toUpperCase();
  if (!safeSymbol) return null;

  const result = await client.query(
    `
      SELECT
        symbol,
        cooldown_type AS "cooldownType",
        reason,
        active_until AS "activeUntil",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM symbol_cooldowns
      WHERE symbol = $1 AND active_until > NOW()
      LIMIT 1
    `,
    [safeSymbol],
  );

  return result.rows[0] ? normalizeCooldownRow(result.rows[0]) : null;
}

async function upsertCooldown(
  { symbol, cooldownType = 'GENERIC', reason = 'cooldown_active', activeUntil, payload = {} },
  client = pool,
) {
  const safeSymbol = String(symbol || '').toUpperCase();
  if (!safeSymbol) {
    throw new Error('symbol_required');
  }
  if (!activeUntil) {
    throw new Error('activeUntil_required');
  }

  const result = await client.query(
    `
      INSERT INTO symbol_cooldowns (
        symbol,
        cooldown_type,
        reason,
        active_until,
        payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
      ON CONFLICT (symbol)
      DO UPDATE SET
        cooldown_type = EXCLUDED.cooldown_type,
        reason = EXCLUDED.reason,
        active_until = EXCLUDED.active_until,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING
        symbol,
        cooldown_type AS "cooldownType",
        reason,
        active_until AS "activeUntil",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      safeSymbol,
      String(cooldownType || 'GENERIC').toUpperCase(),
      reason,
      activeUntil,
      JSON.stringify(payload || {}),
    ],
  );

  return normalizeCooldownRow(result.rows[0]);
}

async function clearCooldown(symbol, client = pool) {
  const safeSymbol = String(symbol || '').toUpperCase();
  if (!safeSymbol) {
    throw new Error('symbol_required');
  }

  const result = await client.query(
    `
      DELETE FROM symbol_cooldowns
      WHERE symbol = $1
      RETURNING
        symbol,
        cooldown_type AS "cooldownType",
        reason,
        active_until AS "activeUntil",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [safeSymbol],
  );

  return result.rows[0] ? normalizeCooldownRow(result.rows[0]) : null;
}

async function getRiskGuardrailSummary(configOverride = null, client = pool) {
  const configRow = configOverride ? { config: configOverride } : await getActiveConfig();
  const config = configRow?.config || {};

  const settings = getPaperSettings(config);
  const maxConsecutiveLosses = Number(config?.risk?.maxConsecutiveLosses || 3);
  const dailyMaxLossPct = Number(config?.risk?.dailyMaxLossPct || 3);

  const [dailyResult, recentSellOrders, control, activeCooldowns] = await Promise.all([
    client.query(
      `
        SELECT COALESCE(SUM(realized_pnl), 0) AS daily_realized_pnl
        FROM paper_orders
        WHERE account_key = $1
          AND status = 'FILLED'
          AND side = 'SELL'
          AND created_at >= DATE_TRUNC('day', NOW())
      `,
      [settings.accountKey],
    ),
    client.query(
      `
        SELECT
          symbol,
          realized_pnl,
          pnl_pct,
          reason,
          rejection_reason,
          payload,
          created_at,
          updated_at
        FROM paper_orders
        WHERE account_key = $1
          AND status = 'FILLED'
          AND side = 'SELL'
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [settings.accountKey],
    ),
    getRuntimeControl(client),
    listCooldowns({ activeOnly: true, limit: 100 }, client),
  ]);

  let consecutiveLosses = 0;
  const currentLossRows = [];

  for (const row of recentSellOrders.rows) {
    const realizedPnl = Number(row.realized_pnl || 0);
    if (realizedPnl < 0) {
      consecutiveLosses += 1;
      currentLossRows.push(row);
      continue;
    }
    break;
  }

  const recentLosses = currentLossRows.slice(0, 6).map(normalizeLossRow);
  const dailyRealizedPnl = Number(dailyResult.rows[0]?.daily_realized_pnl || 0);
  const maxDailyLossAbs = settings.initialCapital * (dailyMaxLossPct / 100);
  const dailyLossLimitReached = dailyRealizedPnl <= -Math.abs(maxDailyLossAbs);
  const lossStreakLimitReached = consecutiveLosses >= maxConsecutiveLosses;

  return {
    dailyRealizedPnl,
    dailyMaxLossPct,
    dailyLossLimitAmount: Number(maxDailyLossAbs.toFixed(2)),
    dailyLossLimitReached,
    consecutiveLosses,
    maxConsecutiveLosses,
    lossStreakLimitReached,
    activeCooldownsCount: activeCooldowns.length,
    recentLosses,
    lossStreakDetails: recentLosses,
    control,
  };
}

async function applyRiskGuardrails(configOverride = null, client = pool) {
  const configRow = configOverride ? { config: configOverride } : await getActiveConfig();
  const config = configRow?.config || {};
  const autoPause = Boolean(config?.risk?.autoPauseOnCircuitBreaker ?? true);
  const summary = await getRiskGuardrailSummary(config, client);

  if (!autoPause) {
    return { triggered: false, summary };
  }

  if (!summary.control.emergencyStop && (summary.dailyLossLimitReached || summary.lossStreakLimitReached)) {
    const reason = summary.dailyLossLimitReached
      ? 'daily_loss_circuit_breaker'
      : 'consecutive_losses_circuit_breaker';

    const updated = await pauseRuntimeControl(
      {
        reason,
        updatedBy: 'risk-guardrail',
        emergencyStop: true,
        metadata: {
          circuitBreaker: true,
          dailyRealizedPnl: summary.dailyRealizedPnl,
          consecutiveLosses: summary.consecutiveLosses,
          triggeredAt: new Date().toISOString(),
        },
      },
      client,
    );

    return { triggered: true, reason, summary: { ...summary, control: updated } };
  }

  return { triggered: false, summary };
}

module.exports = {
  getRuntimeControl,
  setMaintenanceMode,
  clearMaintenanceMode,
  updateRuntimeControl,
  pauseRuntimeControl,
  resumeRuntimeControl,
  listCooldowns,
  getCooldownForSymbol,
  upsertCooldown,
  clearCooldown,
  getRiskGuardrailSummary,
  applyRiskGuardrails,
};
