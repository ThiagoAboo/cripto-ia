const pool = require('../db/pool');
const { getActiveConfig, updateActiveConfig } = require('./config.service');
const { listRegimePresets } = require('./trainingAdaptation.service');

const DEFAULT_RUNTIME_STATE = {
  currentRegime: 'mixed',
  effectiveExpertWeights: null,
  source: 'config',
  presetAppliedAt: null,
  configVersionAtSync: null,
  lastRuntimeSyncAt: null,
  workerReportedAt: null,
  workerName: null,
  runtimeStatus: 'idle',
  notes: null,
  syncHealth: 'unknown',
  syncIssues: [],
  workerLagSeconds: null,
  workerConfigVersionSeen: null,
  lastDecisionAction: null,
  lastDecisionReason: null,
  lastDecisionAt: null,
  dominantExpertKey: null,
  dominantExpertScore: null,
};

function round(value, decimals = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(decimals));
}

function normalizeWeights(weights = {}) {
  const entries = Object.entries(weights || {}).map(([key, value]) => [key, Math.max(Number(value) || 0, 0)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (!total) {
    return null;
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, round(value / total)]));
}

function diffSecondsFromNow(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

function sanitizeRuntimeState(input = {}) {
  const runtime = { ...(input || {}) };

  delete runtime.syncHealth;
  delete runtime.syncIssues;
  delete runtime.workerLagSeconds;

  if (runtime.effectiveExpertWeights) {
    runtime.effectiveExpertWeights = normalizeWeights(runtime.effectiveExpertWeights);
  }

  if (runtime.dominantExpertScore !== undefined && runtime.dominantExpertScore !== null) {
    runtime.dominantExpertScore = round(runtime.dominantExpertScore, 4);
  }

  return runtime;
}

async function getPersistedRuntimeRow() {
  const result = await pool.query(
    `
      SELECT id, config_key AS "configKey", state, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM training_runtime_state
      WHERE config_key = 'active'
      LIMIT 1
    `,
  );

  const row = result.rows[0] || null;
  if (!row) return null;

  return {
    ...row,
    state: sanitizeRuntimeState(row.state || {}),
  };
}

async function persistRuntimeState(nextRuntimeState = {}, { configKey = 'active' } = {}) {
  const safeState = sanitizeRuntimeState(nextRuntimeState);

  const result = await pool.query(
    `
      INSERT INTO training_runtime_state (config_key, state, created_at, updated_at)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (config_key)
      DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = NOW()
      RETURNING id, config_key AS "configKey", state, created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [configKey, JSON.stringify(safeState)],
  );

  const row = result.rows[0] || null;
  return row
    ? {
        ...row,
        state: sanitizeRuntimeState(row.state || {}),
      }
    : null;
}

function buildSyncMeta(runtime = {}, activeConfigVersion = null) {
  const syncIssues = [];
  const workerLagSeconds = diffSecondsFromNow(runtime.workerReportedAt || null);
  const workerConfigVersionSeen = runtime.workerConfigVersionSeen || null;

  if (!runtime.workerReportedAt) {
    syncIssues.push('worker_not_reported_yet');
  }

  if (workerLagSeconds !== null && workerLagSeconds > 180) {
    syncIssues.push('worker_report_stale');
  }

  if (activeConfigVersion && workerConfigVersionSeen && Number(workerConfigVersionSeen) < Number(activeConfigVersion)) {
    syncIssues.push('worker_using_old_config_version');
  }

  if (!runtime.effectiveExpertWeights) {
    syncIssues.push('runtime_without_effective_weights');
  }

  let syncHealth = 'healthy';
  if (syncIssues.includes('worker_not_reported_yet') || syncIssues.includes('runtime_without_effective_weights')) {
    syncHealth = 'attention';
  }
  if (syncIssues.includes('worker_report_stale') || syncIssues.includes('worker_using_old_config_version')) {
    syncHealth = 'out_of_sync';
  }

  return {
    syncHealth,
    syncIssues,
    workerLagSeconds,
    workerConfigVersionSeen,
  };
}

function buildRuntimeState({ training = {}, persistedRuntime = null, activeConfigVersion = null, runtimeUpdatedAt = null } = {}) {
  const storedRuntime = sanitizeRuntimeState(persistedRuntime || training.runtime || {});
  const effectiveWeights =
    normalizeWeights(storedRuntime.effectiveExpertWeights) ||
    normalizeWeights(training.expertWeights) ||
    null;

  const resolved = {
    ...DEFAULT_RUNTIME_STATE,
    ...storedRuntime,
    currentRegime:
      storedRuntime.currentRegime ||
      training.currentRegime ||
      training.activeRegimePreset ||
      DEFAULT_RUNTIME_STATE.currentRegime,
    effectiveExpertWeights: effectiveWeights,
    source: storedRuntime.source || (effectiveWeights ? 'config' : DEFAULT_RUNTIME_STATE.source),
    configVersionAtSync: storedRuntime.configVersionAtSync || activeConfigVersion || null,
    runtimeStatus: storedRuntime.runtimeStatus || (effectiveWeights ? 'ready' : DEFAULT_RUNTIME_STATE.runtimeStatus),
    runtimeUpdatedAt: runtimeUpdatedAt || null,
  };

  return {
    ...resolved,
    ...buildSyncMeta(resolved, activeConfigVersion || null),
  };
}

async function getTrainingRuntimeState() {
  const [activeConfig, runtimeRow] = await Promise.all([getActiveConfig(), getPersistedRuntimeRow()]);
  const training = activeConfig?.config?.training || {};

  const runtime = buildRuntimeState({
    training,
    persistedRuntime: runtimeRow?.state || null,
    activeConfigVersion: activeConfig?.version || null,
    runtimeUpdatedAt: runtimeRow?.updatedAt || null,
  });

  return {
    runtime,
    training: {
      currentRegime: training.currentRegime || training.activeRegimePreset || 'mixed',
      activeRegimePreset: training.activeRegimePreset || null,
      expertWeights: normalizeWeights(training.expertWeights) || null,
      adaptiveExpertsEnabled: Boolean(training.adaptiveExpertsEnabled),
      adaptiveRegimePresetsEnabled: Boolean(training.adaptiveRegimePresetsEnabled),
    },
    configVersion: activeConfig?.version || null,
    updatedAt: activeConfig?.updatedAt || activeConfig?.updated_at || null,
    runtimeUpdatedAt: runtimeRow?.updatedAt || null,
  };
}

async function updateTrainingRuntimeState(nextRuntimePatch = {}, { requestedBy = 'dashboard', reason = 'training_runtime_update' } = {}) {
  const state = await getTrainingRuntimeState();
  const currentRuntime = state.runtime || DEFAULT_RUNTIME_STATE;

  const nextRuntime = sanitizeRuntimeState({
    ...currentRuntime,
    ...(nextRuntimePatch || {}),
  });

  if (!nextRuntime.currentRegime) {
    nextRuntime.currentRegime = state.training?.currentRegime || 'mixed';
  }

  const persisted = await persistRuntimeState(nextRuntime);
  const payload = await getTrainingRuntimeState();

  return {
    message: 'Estado de runtime do treinamento atualizado com sucesso.',
    actor: requestedBy,
    reason,
    runtime: payload.runtime,
    configVersion: payload.configVersion,
    runtimeUpdatedAt: persisted?.updatedAt || payload.runtimeUpdatedAt || null,
  };
}

async function resolvePresetByRegime(regimeKey) {
  const safeKey = String(regimeKey || '').trim();
  if (!safeKey) return null;
  const presetResponse = await listRegimePresets({ limit: 30 });
  return (presetResponse.presets || []).find((item) => item.regimeKey === safeKey) || null;
}

async function activateRuntimeRegime({ regimeKey, requestedBy = 'dashboard' } = {}) {
  const preset = await resolvePresetByRegime(regimeKey);

  if (!preset) {
    const error = new Error('Preset de regime não encontrado para ativação em runtime.');
    error.statusCode = 404;
    throw error;
  }

  const activeConfig = await getActiveConfig();
  const currentConfig = activeConfig?.config || {};
  const currentTraining = currentConfig.training || {};

  const updated = await updateActiveConfig(
    {
      ...currentConfig,
      training: {
        ...currentTraining,
        currentRegime: preset.regimeKey,
        activeRegimePreset: preset.regimeKey,
        expertWeights: preset.weights,
      },
    },
    {
      actionType: 'training_runtime_regime_activate',
      actor: requestedBy,
      reason: `Ativação do regime ${preset.regimeKey} para uso em runtime`,
      metadata: {
        regimeKey: preset.regimeKey,
        weights: preset.weights,
      },
    },
  );

  const nextRuntime = {
    currentRegime: preset.regimeKey,
    effectiveExpertWeights: preset.weights,
    source: 'preset_runtime_activation',
    presetAppliedAt: new Date().toISOString(),
    configVersionAtSync: updated?.version || null,
    lastRuntimeSyncAt: new Date().toISOString(),
    runtimeStatus: 'ready',
    notes: `Preset ${preset.regimeKey} ativado para uso em runtime.`,
  };

  await persistRuntimeState({
    ...(await getTrainingRuntimeState()).runtime,
    ...nextRuntime,
  });

  const payload = await getTrainingRuntimeState();

  return {
    message: `Regime ${preset.regimeKey} ativado para runtime com sucesso.`,
    preset,
    runtime: payload.runtime,
    configVersion: payload.configVersion,
    runtimeUpdatedAt: payload.runtimeUpdatedAt,
  };
}

async function syncRuntimeWithActivePreset({ requestedBy = 'dashboard' } = {}) {
  const activeConfig = await getActiveConfig();
  const currentTraining = activeConfig?.config?.training || {};
  const targetRegime = currentTraining.activeRegimePreset || currentTraining.currentRegime || null;

  if (!targetRegime) {
    const error = new Error('Nenhum regime ativo encontrado para sincronização.');
    error.statusCode = 400;
    throw error;
  }

  const preset = await resolvePresetByRegime(targetRegime);
  const currentState = await getTrainingRuntimeState();
  const nextRuntime = {
    ...currentState.runtime,
    currentRegime: targetRegime,
    effectiveExpertWeights: preset?.weights || currentTraining.expertWeights || currentState.runtime?.effectiveExpertWeights || null,
    source: 'manual_sync',
    configVersionAtSync: activeConfig?.version || null,
    lastRuntimeSyncAt: new Date().toISOString(),
    runtimeStatus: 'ready',
    notes: `Runtime sincronizado manualmente com o regime ${targetRegime}.`,
  };

  await persistRuntimeState(nextRuntime);
  const payload = await getTrainingRuntimeState();

  return {
    message: `Runtime sincronizado com o regime ${targetRegime}.`,
    requestedBy,
    runtime: payload.runtime,
    configVersion: payload.configVersion,
    runtimeUpdatedAt: payload.runtimeUpdatedAt,
  };
}

async function reportWorkerRuntime(payload = {}) {
  const {
    workerName = 'ai-worker',
    currentRegime = null,
    effectiveExpertWeights = null,
    runtimeStatus = 'running',
    notes = null,
    workerConfigVersionSeen = null,
    lastDecisionAction = null,
    lastDecisionReason = null,
    lastDecisionAt = null,
    dominantExpertKey = null,
    dominantExpertScore = null,
  } = payload || {};

  const currentState = await getTrainingRuntimeState();
  const now = new Date().toISOString();
  const activeConfigVersion = currentState.configVersion || null;
  const workerVersion = workerConfigVersionSeen !== null && workerConfigVersionSeen !== undefined
    ? Number(workerConfigVersionSeen)
    : null;

  const confirmedSync =
    activeConfigVersion !== null &&
    workerVersion !== null &&
    Number(workerVersion) >= Number(activeConfigVersion);

  const nextRuntime = {
    ...currentState.runtime,
    workerName,
    workerReportedAt: now,
    currentRegime: currentRegime || currentState.runtime?.currentRegime || currentState.training?.currentRegime || 'mixed',
    effectiveExpertWeights:
      effectiveExpertWeights || currentState.runtime?.effectiveExpertWeights || currentState.training?.expertWeights || null,
    runtimeStatus,
    source: 'worker_report',
    notes,
    workerConfigVersionSeen: workerVersion,
    lastDecisionAction: lastDecisionAction || currentState.runtime?.lastDecisionAction || null,
    lastDecisionReason: lastDecisionReason || currentState.runtime?.lastDecisionReason || null,
    lastDecisionAt: lastDecisionAt || currentState.runtime?.lastDecisionAt || null,
    dominantExpertKey: dominantExpertKey || currentState.runtime?.dominantExpertKey || null,
    dominantExpertScore:
      dominantExpertScore !== null && dominantExpertScore !== undefined
        ? dominantExpertScore
        : currentState.runtime?.dominantExpertScore || null,
  };

  if (confirmedSync) {
    nextRuntime.configVersionAtSync = activeConfigVersion;
    nextRuntime.lastRuntimeSyncAt = now;
  }

  await persistRuntimeState(nextRuntime);
  const payloadResponse = await getTrainingRuntimeState();

  return {
    message: 'Runtime reportado pelo worker com sucesso.',
    runtime: payloadResponse.runtime,
    configVersion: payloadResponse.configVersion,
    runtimeUpdatedAt: payloadResponse.runtimeUpdatedAt,
  };
}

module.exports = {
  DEFAULT_RUNTIME_STATE,
  getTrainingRuntimeState,
  updateTrainingRuntimeState,
  activateRuntimeRegime,
  syncRuntimeWithActivePreset,
  reportWorkerRuntime,
};
