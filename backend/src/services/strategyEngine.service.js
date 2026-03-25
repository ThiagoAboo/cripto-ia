function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function safeDiv(numerator, denominator, fallback = 0) {
  const safeDenominator = Number(denominator || 0);
  if (!safeDenominator) return fallback;
  return Number(numerator || 0) / safeDenominator;
}

function ema(values, period) {
  if (!Array.isArray(values) || !values.length) return [];
  const multiplier = 2 / (period + 1);
  const emaValues = [Number(values[0])];

  for (let index = 1; index < values.length; index += 1) {
    const current = Number(values[index]);
    emaValues.push((current - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1]);
  }

  return emaValues;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return 50;

  const gains = [];
  const losses = [];

  for (let index = 1; index < values.length; index += 1) {
    const delta = Number(values[index]) - Number(values[index - 1]);
    gains.push(Math.max(delta, 0));
    losses.push(Math.abs(Math.min(delta, 0)));
  }

  let avgGain = average(gains.slice(0, period));
  let avgLoss = average(losses.slice(0, period));

  for (let index = period; index < gains.length; index += 1) {
    avgGain = ((avgGain * (period - 1)) + gains[index]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[index]) / period;
  }

  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50;
  }

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;

  const trueRanges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const high = Number(candles[index].high);
    const low = Number(candles[index].low);
    const previousClose = Number(candles[index - 1].close);
    trueRanges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }

  return average(trueRanges.slice(-period));
}

function linearSlope(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;

  const xMean = (values.length - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - xMean) * (Number(value) - yMean);
    denominator += (index - xMean) ** 2;
  });

  return safeDiv(numerator, denominator, 0);
}

function stddev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (Number(value) - mean) ** 2));
  return Math.sqrt(variance);
}

function pctChange(current, previous) {
  return safeDiv(Number(current) - Number(previous), Number(previous), 0);
}

function buildSyntheticTicker(primaryCandles) {
  const closes = primaryCandles.map((item) => Number(item.close));
  const current = primaryCandles[primaryCandles.length - 1];
  const recentSlice = primaryCandles.slice(-48);
  const reference = primaryCandles[Math.max(0, primaryCandles.length - 49)] || current;

  return {
    price: Number(current.close),
    quoteVolume: recentSlice.reduce((sum, item) => sum + Number(item.quoteVolume || 0), 0),
    tradeCount: recentSlice.reduce((sum, item) => sum + Number(item.trades || 0), 0),
    priceChangePercent: pctChange(Number(current.close), Number(reference.close)) * 100,
    closeSeriesStdDev: stddev(closes.slice(-48)),
  };
}

function computeMarketFeatures(primaryCandles, confirmationCandles = [], tickerInput = {}) {
  const closes = primaryCandles.map((item) => Number(item.close));
  const highs = primaryCandles.map((item) => Number(item.high));
  const lows = primaryCandles.map((item) => Number(item.low));
  const opens = primaryCandles.map((item) => Number(item.open));
  const volumes = primaryCandles.map((item) => Number(item.quoteVolume || 0));

  const closeNow = closes[closes.length - 1];
  const closePrev = closes[closes.length - 2] ?? closeNow;
  const emaFastSeries = ema(closes, 9);
  const emaMidSeries = ema(closes, 21);
  const emaSlowSeries = ema(closes, 50);

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = ema12.map((value, index) => value - (ema26[index] ?? value));
  const macdLine = macdSeries[macdSeries.length - 1] ?? 0;
  const macdSignalSeries = ema(macdSeries, 9);
  const macdSignal = macdSignalSeries[macdSignalSeries.length - 1] ?? 0;
  const macdHist = macdLine - macdSignal;

  const rsiNow = rsi(closes, 14);
  const atrNow = atr(primaryCandles, 14);
  const atrPct = safeDiv(atrNow, closeNow, 0);
  const bandWidthPct = highs.length >= 20 ? safeDiv(Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20)), closeNow, 0) : 0;
  const returns = closes.slice(1).map((value, index) => pctChange(value, closes[index]));
  const realizedVol = returns.length >= 20 ? stddev(returns.slice(-20)) * Math.sqrt(20) : 0;
  const priceVsEmaFast = safeDiv(closeNow - (emaFastSeries[emaFastSeries.length - 1] ?? closeNow), closeNow, 0);
  const priceVsEmaSlow = safeDiv(closeNow - (emaSlowSeries[emaSlowSeries.length - 1] ?? closeNow), closeNow, 0);
  const emaStack = (emaFastSeries[emaFastSeries.length - 1] ?? 0) > (emaMidSeries[emaMidSeries.length - 1] ?? 0)
    && (emaMidSeries[emaMidSeries.length - 1] ?? 0) > (emaSlowSeries[emaSlowSeries.length - 1] ?? 0)
    ? 1
    : 0;

  const recentHighBreak = highs.length >= 21 && closeNow >= Math.max(...highs.slice(-20, -1)) ? 1 : 0;
  const recentLowBreak = lows.length >= 21 && closeNow <= Math.min(...lows.slice(-20, -1)) ? 1 : 0;
  const momentum5 = closes.length >= 6 ? pctChange(closeNow, closes[closes.length - 6]) : 0;
  const momentum20 = closes.length >= 21 ? pctChange(closeNow, closes[closes.length - 21]) : 0;
  const volumeRatio = volumes.length >= 20 ? safeDiv(volumes[volumes.length - 1], average(volumes.slice(-20)), 1) : 1;
  const slopeFast = linearSlope(closes.slice(-15));
  const candleBody = safeDiv(Math.abs(closes[closes.length - 1] - opens[opens.length - 1]), closes[closes.length - 1], 0);
  const upperWick = safeDiv(highs[highs.length - 1] - Math.max(closes[closes.length - 1], opens[opens.length - 1]), closes[closes.length - 1], 0);
  const lowerWick = safeDiv(Math.min(closes[closes.length - 1], opens[opens.length - 1]) - lows[lows.length - 1], closes[closes.length - 1], 0);
  const breakoutStrength = recentHighBreak && atrNow > 0 ? safeDiv(closeNow - Math.max(...highs.slice(-20, -1)), atrNow, 0) : 0;
  const breakdownStrength = recentLowBreak && atrNow > 0 ? safeDiv(Math.min(...lows.slice(-20, -1)) - closeNow, atrNow, 0) : 0;

  const confirmationCloses = confirmationCandles.map((item) => Number(item.close));
  let confirmationTrend = 0;
  if (confirmationCloses.length >= 50) {
    const confirmationFast = ema(confirmationCloses, 21).slice(-1)[0];
    const confirmationSlow = ema(confirmationCloses, 50).slice(-1)[0];
    confirmationTrend = safeDiv(confirmationFast - confirmationSlow, confirmationCloses[confirmationCloses.length - 1], 0);
  }

  const ticker = {
    ...buildSyntheticTicker(primaryCandles),
    ...(tickerInput || {}),
  };

  return {
    close: closeNow,
    closePrev,
    rsi: rsiNow,
    atr: atrNow,
    atrPct,
    bandWidthPct,
    realizedVol,
    priceVsEmaFast,
    priceVsEmaSlow,
    emaStack,
    recentHighBreak,
    recentLowBreak,
    momentum5,
    momentum20,
    volumeRatio,
    macdHist,
    slopeFast,
    confirmationTrend,
    tickerQuoteVolume: Number(ticker.quoteVolume || 0),
    tickerTradeCount: Number(ticker.tradeCount || 0),
    tickerChangePct: Number(ticker.priceChangePercent || 0) / 100,
    candleBody,
    upperWick,
    lowerWick,
    breakoutStrength,
    breakdownStrength,
  };
}

function trendExpert(features) {
  const buy = clamp(
    0.35 + Math.max(0, features.priceVsEmaSlow) * 10 + features.emaStack * 0.20 + Math.max(0, features.confirmationTrend) * 12,
    0,
    1,
  );
  const sell = clamp(
    0.30 + Math.max(0, -features.priceVsEmaSlow) * 10 + (features.emaStack === 0 ? 0.20 : 0) + Math.max(0, -features.confirmationTrend) * 12,
    0,
    1,
  );
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: buy > sell ? 'trend_up' : 'trend_down_or_weak' };
}

function momentumExpert(features) {
  const rsiBuy = clamp((features.rsi - 50) / 25, 0, 1);
  const rsiSell = clamp((50 - features.rsi) / 25, 0, 1);
  const buy = clamp(0.25 + Math.max(0, features.momentum5) * 12 + Math.max(0, features.momentum20) * 8 + Math.max(0, features.macdHist) * 10 + rsiBuy * 0.20, 0, 1);
  const sell = clamp(0.25 + Math.max(0, -features.momentum5) * 12 + Math.max(0, -features.momentum20) * 8 + Math.max(0, -features.macdHist) * 10 + rsiSell * 0.20, 0, 1);
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: buy > sell ? 'momentum_positive' : 'momentum_negative' };
}

function volatilityExpert(features) {
  const idealVol = 0.012;
  const volDistance = Math.abs(features.atrPct - idealVol);
  const buy = clamp(0.75 - (volDistance * 20) - Math.max(0, features.realizedVol - 0.03) * 8, 0, 1);
  const sell = clamp(0.20 + Math.max(0, features.atrPct - 0.025) * 20 + Math.max(0, features.realizedVol - 0.04) * 10, 0, 1);
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: buy >= sell ? 'volatility_ok' : 'volatility_risk' };
}

function liquidityExpert(features) {
  const quoteVolumeScore = clamp(features.tickerQuoteVolume / 10000000, 0, 1);
  const tradeCountScore = clamp(features.tickerTradeCount / 50000, 0, 1);
  const candleActivityScore = clamp(features.volumeRatio / 2, 0, 1);
  const buy = clamp((quoteVolumeScore * 0.45) + (tradeCountScore * 0.30) + (candleActivityScore * 0.25), 0, 1);
  const sell = clamp(1 - buy, 0, 1);
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: buy >= 0.45 ? 'liquidity_ok' : 'liquidity_thin' };
}

function regimeExpert(features) {
  const trendiness = clamp(Math.abs(features.priceVsEmaSlow) * 12 + Math.abs(features.confirmationTrend) * 15 + Math.abs(features.slopeFast) * 120, 0, 1);
  const breakout = features.recentHighBreak ? 0.25 : 0;
  const breakdown = features.recentLowBreak ? 0.25 : 0;
  const buy = clamp(0.30 + trendiness * 0.45 + breakout, 0, 1);
  const sell = clamp(0.25 + (1 - trendiness) * 0.20 + breakdown + Math.max(0, -features.tickerChangePct) * 2, 0, 1);
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: trendiness >= 0.45 ? 'trending' : 'ranging_or_unclear' };
}

function patternExpert(features) {
  const bullishCandle = clamp((features.candleBody * 25) + (features.lowerWick * 10), 0, 1);
  const bearishCandle = clamp((features.candleBody * 20) + (features.upperWick * 10), 0, 1);
  const buy = clamp(0.20 + bullishCandle * 0.35 + Math.max(0, features.breakoutStrength) * 0.25, 0, 1);
  const sell = clamp(0.20 + bearishCandle * 0.20 + Math.max(0, features.breakdownStrength) * 0.35, 0, 1);
  return { buy: Number(buy.toFixed(4)), sell: Number(sell.toFixed(4)), label: buy > sell ? 'pattern_bullish' : 'pattern_bearish_or_neutral' };
}

function riskExpert(symbol, portfolio, config) {
  const openSymbols = new Set(portfolio.openSymbols || []);
  const openPositions = Number(portfolio.openPositionsCount || 0);
  const exposurePct = Number(portfolio.exposurePct || 0);
  const maxOpenPositions = Number(config?.trading?.maxOpenPositions || 5);
  const maxPortfolioExposure = Number(config?.risk?.maxPortfolioExposurePct || 35);
  const allowAveragingDown = Boolean(config?.risk?.allowAveragingDown);
  const allowMultipleEntries = Boolean(config?.execution?.paper?.allowMultipleEntriesPerSymbol);
  const positionExists = openSymbols.has(symbol);

  let buyGate = 1;
  let sellGate = positionExists ? 0.25 : 0.80;
  const notes = [];

  if (positionExists && !allowMultipleEntries && !allowAveragingDown) {
    buyGate = 0;
    notes.push('position_already_open');
  }

  if (openPositions >= maxOpenPositions && !positionExists) {
    buyGate = 0;
    notes.push('max_open_positions_reached');
  }

  if (exposurePct >= maxPortfolioExposure) {
    buyGate = 0;
    notes.push('portfolio_exposure_limit');
  }

  if (positionExists) {
    sellGate = 0.25;
    notes.push('position_can_be_reduced');
  }

  return {
    buy: Number(buyGate.toFixed(4)),
    sell: Number(sellGate.toFixed(4)),
    label: notes.length ? notes.join(',') : 'risk_ok',
    positionExists,
    openPositions,
    exposurePct: Number(exposurePct.toFixed(4)),
  };
}

function buildRiskPlan(features, config) {
  const stopLossAtr = Number(config?.risk?.stopLossAtr || 1.8);
  const takeProfitAtr = Number(config?.risk?.takeProfitAtr || 2.6);
  const trailingStopAtr = Number(config?.risk?.trailingStopAtr || 1.2);
  const enableTrailing = Boolean(config?.risk?.enableTrailingStop ?? true);
  const atrValue = Number(features.atr || 0);
  const closePrice = Number(features.close || 0);

  const stopLossPrice = atrValue > 0 ? Math.max(0, closePrice - (atrValue * stopLossAtr)) : 0;
  const takeProfitPrice = atrValue > 0 ? Math.max(0, closePrice + (atrValue * takeProfitAtr)) : 0;
  const trailingStopPrice = enableTrailing && atrValue > 0 ? Math.max(0, closePrice - (atrValue * trailingStopAtr)) : 0;

  return {
    atr: Number(atrValue.toFixed(8)),
    stopLossPrice: Number(stopLossPrice.toFixed(8)),
    takeProfitPrice: Number(takeProfitPrice.toFixed(8)),
    trailingStopPrice: Number(trailingStopPrice.toFixed(8)),
    highestPrice: Number(closePrice.toFixed(8)),
    enableTrailingStop: enableTrailing,
    riskStatus: 'NORMAL',
  };
}

function evaluateSymbol({ primaryCandles, confirmationCandles, ticker = {}, config, portfolio, symbol, socialScore = {}, controlState = {} }) {
  const aiConfig = config?.ai || {};
  const socialConfig = config?.social || {};
  const weights = aiConfig.expertWeights || {};
  const buyThreshold = Number(aiConfig.minConfidenceToBuy || 0.64);
  const sellThreshold = Number(aiConfig.minConfidenceToSell || 0.60);
  const decisionMargin = Number(aiConfig.decisionMargin || 0.05);
  const socialExtremeThreshold = Number(aiConfig.socialExtremeRiskThreshold || socialConfig.extremeRiskThreshold || 85);

  const features = computeMarketFeatures(primaryCandles, confirmationCandles, ticker);
  const experts = {
    trend: trendExpert(features),
    momentum: momentumExpert(features),
    volatility: volatilityExpert(features),
    liquidity: liquidityExpert(features),
    regime: regimeExpert(features),
    pattern: patternExpert(features),
    risk: riskExpert(symbol, portfolio, config),
  };

  const totalWeight = Object.keys(experts).reduce((sum, key) => sum + Number(weights[key] || 0), 0) || 1;
  const buyScore = Object.keys(experts).reduce((sum, key) => sum + (experts[key].buy * Number(weights[key] || 0)), 0) / totalWeight;
  const sellScore = Object.keys(experts).reduce((sum, key) => sum + (experts[key].sell * Number(weights[key] || 0)), 0) / totalWeight;

  let blocked = false;
  let reason = 'no_trade_edge';
  let action = 'HOLD';
  let confidence = Math.max(buyScore, sellScore);

  const socialRisk = Number(socialScore.socialRisk || socialScore.social_risk || 0);
  const runtimePaused = Boolean(controlState.isPaused);
  const emergencyStop = Boolean(controlState.emergencyStop);
  const cooldownActive = Boolean(controlState.cooldownActive);

  if (experts.liquidity.buy < 0.30) {
    blocked = true;
    action = 'BLOCK';
    reason = 'low_liquidity';
    confidence = experts.liquidity.sell;
  } else if (Boolean(socialConfig.enabled ?? true) && socialRisk >= socialExtremeThreshold) {
    blocked = true;
    action = 'BLOCK';
    reason = 'social_extreme_risk';
    confidence = clamp(socialRisk / 100, 0, 1);
  } else if (emergencyStop) {
    blocked = true;
    action = 'BLOCK';
    reason = 'emergency_stop_active';
    confidence = 0.99;
  } else if (runtimePaused && buyScore >= sellScore) {
    blocked = true;
    action = 'BLOCK';
    reason = 'runtime_pause_active';
    confidence = Math.max(buyScore, 0.75);
  } else if (cooldownActive && buyScore >= sellScore) {
    blocked = true;
    action = 'BLOCK';
    reason = 'symbol_cooldown_active';
    confidence = Math.max(buyScore, 0.7);
  } else if (experts.risk.buy === 0 && buyScore >= sellScore) {
    blocked = true;
    action = 'BLOCK';
    reason = experts.risk.label;
    confidence = Math.max(buyScore, experts.risk.sell);
  } else if (experts.risk.positionExists === false && sellScore >= buyScore && sellScore >= sellThreshold) {
    action = 'HOLD';
    reason = 'no_position_to_reduce';
    confidence = sellScore;
  } else if (buyScore >= buyThreshold && (buyScore - sellScore) >= decisionMargin) {
    action = 'BUY';
    reason = 'multi_expert_buy_alignment';
    confidence = buyScore;
  } else if (sellScore >= sellThreshold && (sellScore - buyScore) >= decisionMargin) {
    action = 'SELL';
    reason = 'multi_expert_sell_alignment';
    confidence = sellScore;
  }

  return {
    action,
    blocked,
    reason,
    confidence: Number(confidence.toFixed(4)),
    buyScore: Number(buyScore.toFixed(4)),
    sellScore: Number(sellScore.toFixed(4)),
    experts,
    features: Object.fromEntries(Object.entries(features).map(([key, value]) => [key, typeof value === 'number' ? Number(value.toFixed(6)) : value])),
    riskPlan: buildRiskPlan(features, config),
    social: socialScore || {},
    control: {
      isPaused: Boolean(controlState.isPaused),
      emergencyStop: Boolean(controlState.emergencyStop),
      cooldownActive,
    },
  };
}

function computeMaxDrawdownPct(points) {
  if (!points.length) return 0;
  let peak = points[0].equity;
  let maxDrawdown = 0;

  points.forEach((point) => {
    peak = Math.max(peak, point.equity);
    const drawdown = peak > 0 ? ((point.equity - peak) / peak) * 100 : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  });

  return Number(maxDrawdown.toFixed(4));
}

module.exports = {
  clamp,
  average,
  safeDiv,
  ema,
  rsi,
  atr,
  linearSlope,
  stddev,
  pctChange,
  buildSyntheticTicker,
  computeMarketFeatures,
  trendExpert,
  momentumExpert,
  volatilityExpert,
  liquidityExpert,
  regimeExpert,
  patternExpert,
  riskExpert,
  buildRiskPlan,
  evaluateSymbol,
  computeMaxDrawdownPct,
};
