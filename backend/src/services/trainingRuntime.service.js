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

function buildRuntimeState(training = {}, configVersion = null) {
  const runtime = training.runtime || {};
  const effectiveWeights =
    normalizeWeights(runtime.effectiveExpertWeights) ||
    normalizeWeights(training.expertWeights) ||
    null;

  return {
    ...DEFAULT_RUNTIME_STATE,
    ...runtime,
    currentRegime:
      runtime.currentRegime ||
      training.currentRegime ||
      training.activeRegimePreset ||
      DEFAULT_RUNTIME_STATE.currentRegime,
    effectiveExpertWeights: effectiveWeights,
    source: runtime.source || (effectiveWeights ? 'config' : DEFAULT_RUNTIME_STATE.source),
    configVersionAtSync: runtime.configVersionAtSync || configVersion || null,
    runtimeStatus: runtime.runtimeStatus || (effectiveWeights ? 'ready' : DEFAULT_RUNTIME_STATE.runtimeStatus),
  };
}

async function getTrainingRuntimeState() {
  const activeConfig = await getActiveConfig();
  const training = activeConfig?.config?.training || {};
  const runtime = buildRuntimeState(training, activeConfig?.version || null);

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
  };
}

async function updateTrainingRuntimeState(nextRuntimePatch = {}, { requestedBy = 'dashboard', reason = 'training_runtime_update' } = {}) {
  const activeConfig = await getActiveConfig();
  const currentConfig = activeConfig?.config || {};
  const currentTraining = currentConfig.training || {};
  const currentRuntime = buildRuntimeState(currentTraining, activeConfig?.version || null);

  const nextRuntime = {
    ...currentRuntime,
    ...(nextRuntimePatch || {}),
  };

  if (nextRuntime.effectiveExpertWeights) {
    nextRuntime.effectiveExpertWeights = normalizeWeights(nextRuntime.effectiveExpertWeights);
  }

  if (!nextRuntime.currentRegime) {
    nextRuntime.currentRegime = currentTraining.currentRegime || currentTraining.activeRegimePreset || 'mixed';
  }

  const nextTraining = {
    ...currentTraining,
    runtime: nextRuntime,
  };

  const updated = await updateActiveConfig(
    {
      ...currentConfig,
      training: nextTraining,
    },
    {
      actionType: 'training_runtime_state_update',
      actor: requestedBy,
      reason,
      metadata: {
        runtimeKeys: Object.keys(nextRuntimePatch || {}),
        currentRegime: nextRuntime.currentRegime,
      },
    },
  );

  return {
    message: 'Estado de runtime do treinamento atualizado com sucesso.',
    runtime: buildRuntimeState(updated?.config?.training || {}, updated?.version || null),
    configVersion: updated?.version || null,
  };
}

async function activateRuntimeRegime({ regimeKey, requestedBy = 'dashboard' } = {}) {
  const safeKey = String(regimeKey || '').trim();
  if (!safeKey) {
    const error = new Error('regimeKey é obrigatório.');
    error.statusCode = 400;
    throw error;
  }

  const presetResponse = await listRegimePresets({ limit: 30 });
  const preset = (presetResponse.presets || []).find((item) => item.regimeKey === safeKey);

  if (!preset) {
    const error = new Error('Preset de regime não encontrado para ativação em runtime.');
    error.statusCode = 404;
    throw error;
  }

  const activeConfig = await getActiveConfig();
  const currentConfig = activeConfig?.config || {};
  const currentTraining = currentConfig.training || {};

  const nextTraining = {
    ...currentTraining,
    currentRegime: preset.regimeKey,
    activeRegimePreset: preset.regimeKey,
    expertWeights: preset.weights,
    runtime: {
      ...buildRuntimeState(currentTraining, activeConfig?.version || null),
      currentRegime: preset.regimeKey,
      effectiveExpertWeights: preset.weights,
      source: 'preset_runtime_activation',
      presetAppliedAt: new Date().toISOString(),
      configVersionAtSync: activeConfig?.version || null,
      lastRuntimeSyncAt: new Date().toISOString(),
      runtimeStatus: 'ready',
      notes: `Preset ${preset.regimeKey} ativado para uso em runtime.`,
    },
  };

  const updated = await updateActiveConfig(
    {
      ...currentConfig,
      training: nextTraining,
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

  return {
    message: `Regime ${preset.regimeKey} ativado para runtime com sucesso.`,
    preset,
    runtime: buildRuntimeState(updated?.config?.training || {}, updated?.version || null),
    configVersion: updated?.version || null,
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

  return activateRuntimeRegime({
    regimeKey: targetRegime,
    requestedBy,
  });
}

async function reportWorkerRuntime(payload = {}) {
  const {
    workerName = 'ai-worker',
    currentRegime = null,
    effectiveExpertWeights = null,
    runtimeStatus = 'running',
    notes = null,
  } = payload || {};

  return updateTrainingRuntimeState(
    {
      workerName,
      workerReportedAt: new Date().toISOString(),
      currentRegime: currentRegime || undefined,
      effectiveExpertWeights: effectiveExpertWeights || undefined,
      runtimeStatus,
      source: 'worker_report',
      notes,
      lastRuntimeSyncAt: new Date().toISOString(),
    },
    {
      requestedBy: workerName,
      reason: 'worker_runtime_report',
    },
  );
}

module.exports = {
  DEFAULT_RUNTIME_STATE,
  getTrainingRuntimeState,
  updateTrainingRuntimeState,
  activateRuntimeRegime,
  syncRuntimeWithActivePreset,
  reportWorkerRuntime,
};
