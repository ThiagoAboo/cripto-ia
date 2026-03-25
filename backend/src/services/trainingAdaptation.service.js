const { getActiveConfig, updateActiveConfig } = require('./config.service');
const {
  listExpertEvaluationReports,
  listModelQualityReports,
  listModelDriftReports,
} = require('./training.service');

const DEFAULT_TRAINING_SETTINGS = {
  minQualityScoreForApply: 0.56,
  autoApplyMode: 'guarded',
  allowApplyWithWarning: false,
  adaptiveExpertsEnabled: true,
  adaptiveRegimePresetsEnabled: true,
  maxWeightShiftPerRun: 0.15,
};

const DEFAULT_EXPERT_WEIGHTS = {
  trend: 0.22,
  momentum: 0.18,
  volatility: 0.14,
  liquidity: 0.12,
  regime: 0.12,
  pattern: 0.12,
  risk: 0.10,
};

const REGIME_DESCRIPTIONS = {
  trend_bull: 'Mercado em alta com força compradora e continuidade de tendência.',
  trend_bear: 'Mercado em baixa, com maior foco em defesa e preservação de capital.',
  range: 'Mercado lateral, favorecendo seletividade, liquidez e padrão.',
  volatile: 'Mercado com volatilidade expandida, exigindo mais proteção e filtros.',
  mixed: 'Mercado misto, sem domínio claro de um único regime.',
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(decimals));
}

function normalizeWeights(weights) {
  const entries = Object.entries(weights || {}).map(([key, value]) => [key, Math.max(Number(value) || 0, 0)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) {
    return { ...DEFAULT_EXPERT_WEIGHTS };
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, round(value / total)]));
}

function blendWeights(base, delta, intensity = 1) {
  const next = { ...base };
  Object.entries(delta || {}).forEach(([key, value]) => {
    next[key] = Math.max((next[key] || 0) + value * intensity, 0.01);
  });
  return normalizeWeights(next);
}

function inferExpertKey(rawKey = '') {
  const key = String(rawKey || '').toLowerCase();
  if (key.includes('trend')) return 'trend';
  if (key.includes('momentum')) return 'momentum';
  if (key.includes('volatility') || key.includes('atr')) return 'volatility';
  if (key.includes('liquidity') || key.includes('slippage') || key.includes('spread')) return 'liquidity';
  if (key.includes('regime')) return 'regime';
  if (key.includes('pattern') || key.includes('structure')) return 'pattern';
  if (key.includes('risk')) return 'risk';
  return null;
}

function buildSuggestedWeightMap(expertReports = []) {
  const accumulator = {};
  expertReports.forEach((item) => {
    const expertKey = inferExpertKey(item.expertKey);
    if (!expertKey) return;
    if (!accumulator[expertKey]) {
      accumulator[expertKey] = { score: 0, count: 0 };
    }
    const suggestedWeight = Number(item.suggestedWeight);
    const contributionScore = Number(item.contributionScore);
    const blended = Number.isFinite(suggestedWeight)
      ? suggestedWeight
      : Number.isFinite(contributionScore)
        ? contributionScore
        : 0;
    accumulator[expertKey].score += blended;
    accumulator[expertKey].count += 1;
  });

  const mapped = {};
  Object.keys(DEFAULT_EXPERT_WEIGHTS).forEach((expertKey) => {
    const item = accumulator[expertKey];
    mapped[expertKey] = item && item.count ? item.score / item.count : DEFAULT_EXPERT_WEIGHTS[expertKey];
  });
  return normalizeWeights(mapped);
}

function regimeDelta(regimeKey) {
  switch (regimeKey) {
    case 'trend_bull':
      return { trend: 0.06, momentum: 0.04, pattern: 0.02, risk: -0.03, liquidity: -0.01 };
    case 'trend_bear':
      return { risk: 0.08, volatility: 0.05, regime: 0.03, momentum: -0.05, pattern: -0.02 };
    case 'range':
      return { pattern: 0.05, liquidity: 0.04, risk: 0.03, trend: -0.05, momentum: -0.03 };
    case 'volatile':
      return { volatility: 0.08, risk: 0.07, liquidity: 0.04, momentum: -0.05, trend: -0.03 };
    case 'mixed':
    default:
      return { regime: 0.03, risk: 0.02, trend: 0.01 };
  }
}

function inferIntensity({ latestQuality, latestDrift }) {
  const qualityScore = Number(latestQuality?.qualityScore || 0);
  const driftScore = Number(latestDrift?.driftScore || 0);

  const qualityFactor = clamp(qualityScore || 0.5, 0.15, 0.95);
  const driftFactor = clamp(1 - (driftScore || 0), 0.25, 1);
  return round((qualityFactor * 0.7) + (driftFactor * 0.3), 4);
}

async function getTrainingSettings() {
  const activeConfig = await getActiveConfig();
  const settings = {
    ...DEFAULT_TRAINING_SETTINGS,
    ...(activeConfig?.config?.training || {}),
  };

  return {
    settings,
    configVersion: activeConfig?.version || null,
    updatedAt: activeConfig?.updated_at || activeConfig?.updatedAt || null,
  };
}

async function updateTrainingSettings(nextSettings = {}, { requestedBy = 'dashboard' } = {}) {
  const activeConfig = await getActiveConfig();
  const currentConfig = activeConfig?.config || {};
  const mergedTraining = {
    ...DEFAULT_TRAINING_SETTINGS,
    ...(currentConfig.training || {}),
    ...(nextSettings || {}),
  };

  const updated = await updateActiveConfig(
    {
      ...currentConfig,
      training: mergedTraining,
    },
    {
      actionType: 'training_settings_update',
      actor: requestedBy,
      reason: 'Atualização das configurações do treinamento adaptativo',
      metadata: {
        changedKeys: Object.keys(nextSettings || {}),
      },
    },
  );

  return {
    message: 'Configurações do treinamento atualizadas com sucesso.',
    settings: {
      ...DEFAULT_TRAINING_SETTINGS,
      ...(updated?.config?.training || {}),
    },
    configVersion: updated?.version || null,
  };
}

async function listRegimePresets({ limit = 20 } = {}) {
  const [activeConfig, expertReports, qualityReports, driftReports] = await Promise.all([
    getActiveConfig(),
    listExpertEvaluationReports({ limit }),
    listModelQualityReports({ limit: 6 }),
    listModelDriftReports({ limit: 6 }),
  ]);

  const currentTraining = activeConfig?.config?.training || {};
  const manualBase = normalizeWeights(currentTraining.expertWeights || DEFAULT_EXPERT_WEIGHTS);
  const suggestedBase = buildSuggestedWeightMap(expertReports || []);
  const latestQuality = qualityReports?.[0] || null;
  const latestDrift = driftReports?.[0] || null;
  const intensity = inferIntensity({ latestQuality, latestDrift });

  const baseWeights = normalizeWeights(
    Object.fromEntries(
      Object.keys(DEFAULT_EXPERT_WEIGHTS).map((expertKey) => [
        expertKey,
        round(((manualBase[expertKey] || 0) * 0.55) + ((suggestedBase[expertKey] || 0) * 0.45)),
      ]),
    ),
  );

  const presetKeys = ['trend_bull', 'trend_bear', 'range', 'volatile', 'mixed'];
  const presets = presetKeys.map((regimeKey) => {
    const weights = blendWeights(baseWeights, regimeDelta(regimeKey), intensity);
    return {
      regimeKey,
      title: regimeKey.replace(/_/g, ' '),
      description: REGIME_DESCRIPTIONS[regimeKey],
      weights,
      intensity,
      qualityScore: latestQuality?.qualityScore ?? null,
      qualityStatus: latestQuality?.qualityStatus || null,
      driftScore: latestDrift?.driftScore ?? null,
      driftStatus: latestDrift?.driftStatus || null,
      isApplied: currentTraining.activeRegimePreset === regimeKey,
      generatedAt: new Date().toISOString(),
    };
  });

  return {
    baseWeights,
    suggestedBase,
    presets,
    latestQuality,
    latestDrift,
    configVersion: activeConfig?.version || null,
  };
}

async function applyRegimePreset({ regimeKey, requestedBy = 'dashboard' } = {}) {
  const safeKey = String(regimeKey || '').trim();
  if (!safeKey) {
    const error = new Error('regimeKey é obrigatório.');
    error.statusCode = 400;
    throw error;
  }

  const presetResponse = await listRegimePresets({ limit: 30 });
  const preset = (presetResponse.presets || []).find((item) => item.regimeKey === safeKey);
  if (!preset) {
    const error = new Error('Preset de regime não encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const activeConfig = await getActiveConfig();
  const currentConfig = activeConfig?.config || {};
  const currentTraining = currentConfig.training || {};
  const nextTraining = {
    ...currentTraining,
    adaptiveExpertsEnabled: true,
    adaptiveRegimePresetsEnabled: true,
    activeRegimePreset: preset.regimeKey,
    expertWeights: preset.weights,
    regimeExpertPresets: {
      ...(currentTraining.regimeExpertPresets || {}),
      [preset.regimeKey]: {
        weights: preset.weights,
        generatedAt: preset.generatedAt,
        source: 'training_adaptation',
      },
    },
  };

  const updated = await updateActiveConfig(
    {
      ...currentConfig,
      training: nextTraining,
    },
    {
      actionType: 'training_regime_preset_apply',
      actor: requestedBy,
      reason: `Aplicação do preset adaptativo de regime ${preset.regimeKey}`,
      metadata: {
        regimeKey: preset.regimeKey,
        weights: preset.weights,
      },
    },
  );

  return {
    message: `Preset de regime ${preset.regimeKey} aplicado com sucesso.`,
    preset,
    configVersion: updated?.version || null,
    training: updated?.config?.training || {},
  };
}

module.exports = {
  DEFAULT_TRAINING_SETTINGS,
  getTrainingSettings,
  updateTrainingSettings,
  listRegimePresets,
  applyRegimePreset,
};
