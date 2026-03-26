const DEFAULT_REGIME_POLICIES = {
  trend_bull: {
    buyThresholdAdjustment: -0.04,
    sellThresholdAdjustment: 0.03,
    confidenceMultiplier: 1.08,
    maxSizeMultiplier: 1.2,
    allowAveragingUp: true,
  },
  trend_bear: {
    buyThresholdAdjustment: 0.07,
    sellThresholdAdjustment: -0.02,
    confidenceMultiplier: 0.88,
    maxSizeMultiplier: 0.55,
    allowAveragingUp: false,
  },
  range: {
    buyThresholdAdjustment: 0.02,
    sellThresholdAdjustment: 0.02,
    confidenceMultiplier: 0.94,
    maxSizeMultiplier: 0.8,
    allowAveragingUp: false,
  },
  mixed: {
    buyThresholdAdjustment: 0,
    sellThresholdAdjustment: 0,
    confidenceMultiplier: 1,
    maxSizeMultiplier: 1,
    allowAveragingUp: false,
  },
};

const DEFAULT_GUARDRAILS = {
  minLiquidityUsd: 150000,
  maxSpreadPct: 0.35,
  maxEstimatedSlippagePct: 0.45,
  maxPortfolioCorrelation: 0.82,
  maxOpenRiskPct: 0.6,
  hardBlockMinConfidence: 0.52,
  warnCorrelationAbove: 0.7,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function normalizeRegime(regime) {
  const normalized = String(regime || 'mixed').trim().toLowerCase();
  return DEFAULT_REGIME_POLICIES[normalized] ? normalized : 'mixed';
}

function normalizeAction(action) {
  const normalized = String(action || 'HOLD').trim().toUpperCase();
  return ['BUY', 'SELL', 'HOLD'].includes(normalized) ? normalized : 'HOLD';
}

function getRegimePolicy(regime) {
  return DEFAULT_REGIME_POLICIES[normalizeRegime(regime)];
}

function mergeGuardrails(overrides = {}) {
  return {
    ...DEFAULT_GUARDRAILS,
    ...(overrides || {}),
  };
}

function buildGuard(name, status, details = {}) {
  return {
    name,
    status,
    ...details,
  };
}

function evaluateMarketGuardrails(market = {}, guardrails = DEFAULT_GUARDRAILS) {
  const liquidityUsd = toNumber(market.liquidityUsd, toNumber(market.quoteVolumeUsd, 0));
  const spreadPct = toNumber(market.spreadPct, 0);
  const estimatedSlippagePct = toNumber(market.estimatedSlippagePct, spreadPct * 1.25);

  const guards = [];

  if (liquidityUsd < guardrails.minLiquidityUsd) {
    guards.push(buildGuard('liquidity', 'block', {
      message: 'Liquidez abaixo do mínimo recomendado.',
      observed: round(liquidityUsd, 2),
      threshold: guardrails.minLiquidityUsd,
      penalty: 0.24,
    }));
  } else if (liquidityUsd < guardrails.minLiquidityUsd * 1.35) {
    guards.push(buildGuard('liquidity', 'warn', {
      message: 'Liquidez apenas marginalmente confortável.',
      observed: round(liquidityUsd, 2),
      threshold: guardrails.minLiquidityUsd,
      penalty: 0.07,
    }));
  } else {
    guards.push(buildGuard('liquidity', 'pass', {
      observed: round(liquidityUsd, 2),
      threshold: guardrails.minLiquidityUsd,
      penalty: 0,
    }));
  }

  if (spreadPct > guardrails.maxSpreadPct) {
    guards.push(buildGuard('spread', 'block', {
      message: 'Spread acima do máximo permitido.',
      observed: round(spreadPct, 4),
      threshold: guardrails.maxSpreadPct,
      penalty: 0.18,
    }));
  } else if (spreadPct > guardrails.maxSpreadPct * 0.8) {
    guards.push(buildGuard('spread', 'warn', {
      message: 'Spread alto para execução eficiente.',
      observed: round(spreadPct, 4),
      threshold: guardrails.maxSpreadPct,
      penalty: 0.05,
    }));
  } else {
    guards.push(buildGuard('spread', 'pass', {
      observed: round(spreadPct, 4),
      threshold: guardrails.maxSpreadPct,
      penalty: 0,
    }));
  }

  if (estimatedSlippagePct > guardrails.maxEstimatedSlippagePct) {
    guards.push(buildGuard('slippage', 'block', {
      message: 'Slippage estimado acima do limite.',
      observed: round(estimatedSlippagePct, 4),
      threshold: guardrails.maxEstimatedSlippagePct,
      penalty: 0.22,
    }));
  } else if (estimatedSlippagePct > guardrails.maxEstimatedSlippagePct * 0.8) {
    guards.push(buildGuard('slippage', 'warn', {
      message: 'Slippage estimado elevado.',
      observed: round(estimatedSlippagePct, 4),
      threshold: guardrails.maxEstimatedSlippagePct,
      penalty: 0.06,
    }));
  } else {
    guards.push(buildGuard('slippage', 'pass', {
      observed: round(estimatedSlippagePct, 4),
      threshold: guardrails.maxEstimatedSlippagePct,
      penalty: 0,
    }));
  }

  return guards;
}

function evaluatePortfolioGuardrails(portfolio = {}, candidate = {}, regimePolicy = DEFAULT_REGIME_POLICIES.mixed, guardrails = DEFAULT_GUARDRAILS) {
  const currentCorrelation = toNumber(candidate.portfolioCorrelation, portfolio.maxObservedCorrelation);
  const projectedOpenRiskPct = toNumber(candidate.projectedOpenRiskPct, portfolio.openRiskPct);
  const hasExistingPosition = Boolean(candidate.hasExistingPosition);

  const guards = [];

  if (currentCorrelation > guardrails.maxPortfolioCorrelation) {
    guards.push(buildGuard('correlation', 'block', {
      message: 'Correlação de carteira acima do limite.',
      observed: round(currentCorrelation, 4),
      threshold: guardrails.maxPortfolioCorrelation,
      penalty: 0.18,
    }));
  } else if (currentCorrelation > guardrails.warnCorrelationAbove) {
    guards.push(buildGuard('correlation', 'warn', {
      message: 'Correlação elevada; reduzir tamanho.',
      observed: round(currentCorrelation, 4),
      threshold: guardrails.warnCorrelationAbove,
      penalty: 0.07,
    }));
  } else {
    guards.push(buildGuard('correlation', 'pass', {
      observed: round(currentCorrelation, 4),
      threshold: guardrails.warnCorrelationAbove,
      penalty: 0,
    }));
  }

  if (projectedOpenRiskPct > guardrails.maxOpenRiskPct) {
    guards.push(buildGuard('portfolio_risk', 'block', {
      message: 'Exposição total projetada acima do máximo.',
      observed: round(projectedOpenRiskPct, 4),
      threshold: guardrails.maxOpenRiskPct,
      penalty: 0.25,
    }));
  } else if (projectedOpenRiskPct > guardrails.maxOpenRiskPct * 0.85) {
    guards.push(buildGuard('portfolio_risk', 'warn', {
      message: 'Exposição total já elevada.',
      observed: round(projectedOpenRiskPct, 4),
      threshold: guardrails.maxOpenRiskPct,
      penalty: 0.08,
    }));
  } else {
    guards.push(buildGuard('portfolio_risk', 'pass', {
      observed: round(projectedOpenRiskPct, 4),
      threshold: guardrails.maxOpenRiskPct,
      penalty: 0,
    }));
  }

  if (hasExistingPosition && !regimePolicy.allowAveragingUp && normalizeAction(candidate.action) === 'BUY') {
    guards.push(buildGuard('position_expansion', 'warn', {
      message: 'Regime atual desestimula aumentar posição comprada.',
      observed: 1,
      threshold: 0,
      penalty: 0.05,
    }));
  } else {
    guards.push(buildGuard('position_expansion', 'pass', {
      observed: hasExistingPosition ? 1 : 0,
      threshold: 0,
      penalty: 0,
    }));
  }

  return guards;
}

function sumPenalties(guards = []) {
  return guards.reduce((sum, item) => sum + toNumber(item.penalty, 0), 0);
}

function hasBlockingGuard(guards = []) {
  return guards.some((item) => item.status === 'block');
}

function computeSizeMultiplier(baseConfidence, regimePolicy, guards = []) {
  const penalty = sumPenalties(guards);
  const regimeBoost = toNumber(regimePolicy.maxSizeMultiplier, 1);
  const confidenceComponent = clamp((baseConfidence - 0.45) / 0.55, 0.1, 1);
  const afterPenalty = clamp(confidenceComponent * regimeBoost - penalty, 0, regimeBoost);
  return round(afterPenalty, 4);
}

function computeThresholds(baseThresholds = {}, regimePolicy = DEFAULT_REGIME_POLICIES.mixed) {
  return {
    buyThreshold: clamp(toNumber(baseThresholds.buyThreshold, 0.64) + toNumber(regimePolicy.buyThresholdAdjustment, 0), 0.3, 0.95),
    sellThreshold: clamp(toNumber(baseThresholds.sellThreshold, 0.6) + toNumber(regimePolicy.sellThresholdAdjustment, 0), 0.3, 0.95),
  };
}

function decideEffectiveAction(action, adjustedConfidence, thresholds, guards, guardrails) {
  const normalizedAction = normalizeAction(action);
  if (hasBlockingGuard(guards)) {
    return 'HOLD';
  }
  if (adjustedConfidence < guardrails.hardBlockMinConfidence) {
    return 'HOLD';
  }
  if (normalizedAction === 'BUY' && adjustedConfidence < thresholds.buyThreshold) {
    return 'HOLD';
  }
  if (normalizedAction === 'SELL' && adjustedConfidence < thresholds.sellThreshold) {
    return 'HOLD';
  }
  return normalizedAction;
}

function buildExplanation({ requestedAction, effectiveAction, regime, adjustedConfidence, guards, thresholds, sizeMultiplier }) {
  const blocking = guards.filter((item) => item.status === 'block').map((item) => item.name);
  const warnings = guards.filter((item) => item.status === 'warn').map((item) => item.name);

  return {
    requestedAction,
    effectiveAction,
    regime,
    adjustedConfidence,
    thresholds,
    sizeMultiplier,
    blockingGuards: blocking,
    warnings,
    summary:
      effectiveAction === 'HOLD'
        ? `Decisão reduzida para HOLD após guardrails (${blocking.concat(warnings).join(', ') || 'sem razões explícitas'}).`
        : `Decisão ${effectiveAction} mantida em ${regime} com tamanho recomendado ${round(sizeMultiplier * 100, 2)}%.`,
  };
}

function hardenDecision(input = {}) {
  const requestedAction = normalizeAction(input.action);
  const regime = normalizeRegime(input.regime);
  const guardrails = mergeGuardrails(input.guardrails);
  const regimePolicy = getRegimePolicy(regime);
  const thresholds = computeThresholds(input.thresholds, regimePolicy);
  const baseConfidence = clamp(toNumber(input.confidence, 0), 0, 1);
  const adjustedConfidence = clamp(baseConfidence * toNumber(regimePolicy.confidenceMultiplier, 1), 0, 1);

  const marketGuards = evaluateMarketGuardrails(input.market, guardrails);
  const portfolioGuards = evaluatePortfolioGuardrails(
    input.portfolio,
    { ...(input.portfolio || {}), action: requestedAction, ...(input.position || {}) },
    regimePolicy,
    guardrails,
  );
  const guards = [...marketGuards, ...portfolioGuards];
  const effectiveAction = decideEffectiveAction(requestedAction, adjustedConfidence, thresholds, guards, guardrails);
  const sizeMultiplier = effectiveAction === 'HOLD' ? 0 : computeSizeMultiplier(adjustedConfidence, regimePolicy, guards);
  const blocked = effectiveAction === 'HOLD' && requestedAction !== 'HOLD';

  return {
    requestedAction,
    effectiveAction,
    blocked,
    regime,
    thresholds,
    baseConfidence: round(baseConfidence, 4),
    adjustedConfidence: round(adjustedConfidence, 4),
    recommendedSizeFraction: round(sizeMultiplier, 4),
    guardrails,
    guards,
    explanation: buildExplanation({
      requestedAction,
      effectiveAction,
      regime,
      adjustedConfidence: round(adjustedConfidence, 4),
      guards,
      thresholds,
      sizeMultiplier,
    }),
  };
}

module.exports = {
  DEFAULT_GUARDRAILS,
  DEFAULT_REGIME_POLICIES,
  hardenDecision,
  _internals: {
    clamp,
    round,
    mergeGuardrails,
    normalizeRegime,
    normalizeAction,
    computeThresholds,
    evaluateMarketGuardrails,
    evaluatePortfolioGuardrails,
    computeSizeMultiplier,
    decideEffectiveAction,
    getRegimePolicy,
  },
};
