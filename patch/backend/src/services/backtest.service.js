
const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { getCandles } = require('./market.service');
const { evaluateSymbol, computeMaxDrawdownPct } = require('./strategyEngine.service');

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function roundTo(value, decimals = 8) {
  return Number(Number(value || 0).toFixed(decimals));
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }

  if (typeof base !== 'object' || base === null) {
    return override !== undefined ? override : base;
  }

  const result = { ...base };
  const source = override || {};

  Object.keys(source).forEach((key) => {
    const baseValue = result[key];
    const nextValue = source[key];

    if (
      baseValue
      && nextValue
      && typeof baseValue === 'object'
      && typeof nextValue === 'object'
      && !Array.isArray(baseValue)
      && !Array.isArray(nextValue)
    ) {
      result[key] = deepMerge(baseValue, nextValue);
    } else {
      result[key] = nextValue;
    }
  });

  return result;
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function stddev(values = []) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (Number(value || 0) - avg) ** 2));
  return Math.sqrt(variance);
}

function inferMarketRegime(primaryCandles = [], confirmationCandles = []) {
  if (primaryCandles.length < 60) return 'mixed';

  const closes = primaryCandles.map((item) => Number(item.close || 0)).filter((value) => value > 0);
  const returns = closes.slice(1).map((value, index) => (closes[index] > 0 ? (value - closes[index]) / closes[index] : 0));
  const start = closes[Math.max(0, closes.length - 60)] || closes[0] || 1;
  const end = closes[closes.length - 1] || start;
  const totalReturn = start > 0 ? ((end - start) / start) * 100 : 0;
  const vol = stddev(returns.slice(-40)) * Math.sqrt(40) * 100;

  const confirmationCloses = confirmationCandles.map((item) => Number(item.close || 0)).filter((value) => value > 0);
  const confStart = confirmationCloses[Math.max(0, confirmationCloses.length - 30)] || confirmationCloses[0] || 1;
  const confEnd = confirmationCloses[confirmationCloses.length - 1] || confStart;
  const confirmationReturn = confStart > 0 ? ((confEnd - confStart) / confStart) * 100 : 0;

  if (vol >= 9) return 'volatile';
  if (totalReturn >= 5 && confirmationReturn >= 2) return 'trend_bull';
  if (totalReturn <= -5 && confirmationReturn <= -2) return 'trend_bear';
  if (Math.abs(totalReturn) <= 3) return 'range';
  return 'mixed';
}

function buildBacktestPortfolioState(state, currentPrice) {
  const marketValue = state.position ? state.position.quantity * currentPrice : 0;
  const equity = state.cash + marketValue;

  return {
    equity,
    cashBalance: state.cash,
    positionsValue: marketValue,
    openPositionsCount: state.position ? 1 : 0,
    openSymbols: state.position ? [state.symbol] : [],
    exposurePct: equity > 0 ? (marketValue / equity) * 100 : 0,
  };
}

function createPosition({ executionPrice, notional, quantity, riskPlan, candle }) {
  return {
    quantity,
    avgEntryPrice: executionPrice,
    costBasis: notional,
    stopLossPrice: Number(riskPlan.stopLossPrice || 0),
    takeProfitPrice: Number(riskPlan.takeProfitPrice || 0),
    trailingStopPrice: Number(riskPlan.trailingStopPrice || 0),
    highestPrice: Math.max(Number(riskPlan.highestPrice || executionPrice), Number(candle.high || executionPrice)),
    atrAtEntry: Number(riskPlan.atr || 0),
    riskStatus: 'NORMAL',
    openedAt: candle.openTime,
  };
}

function simulateSell({ state, candle, nextCandle, settings, reason, forcedPrice = null, decision = null }) {
  if (!state.position || state.position.quantity <= 0) return null;

  const priceBase = Number(forcedPrice || nextCandle?.open || candle.close || 0);
  if (priceBase <= 0) return null;

  const slippageMultiplier = 1 - (Number(settings.slippagePct || 0) / 100);
  const executionPrice = priceBase * slippageMultiplier;
  const quantity = Number(state.position.quantity || 0);
  const grossNotional = quantity * executionPrice;
  const feeAmount = grossNotional * (Number(settings.feePct || 0) / 100);
  const netNotional = grossNotional - feeAmount;
  const realizedPnl = netNotional - Number(state.position.costBasis || 0);
  const pnlPct = state.position.costBasis > 0 ? (realizedPnl / state.position.costBasis) * 100 : 0;

  state.cash += netNotional;
  state.realizedPnl += realizedPnl;
  state.feesPaid += feeAmount;
  state.trades.push({
    side: 'SELL',
    reason,
    symbol: state.symbol,
    candleTime: candle.closeTime,
    executionTime: nextCandle?.openTime || candle.closeTime,
    price: roundTo(executionPrice),
    quantity: roundTo(quantity),
    notional: roundTo(netNotional),
    feeAmount: roundTo(feeAmount),
    realizedPnl: roundTo(realizedPnl),
    pnlPct: roundTo(pnlPct, 4),
    confidence: Number(decision?.confidence || 0),
    decisionAction: decision?.action || 'SELL',
    meta: {
      blocked: Boolean(decision?.blocked),
      reason: decision?.reason || reason,
      experts: decision?.experts || null,
    },
  });

  state.position = null;
  return realizedPnl;
}

function maybeTriggerRiskExit({ state, candle, nextCandle, settings }) {
  if (!state.position) return false;

  state.position.highestPrice = Math.max(Number(state.position.highestPrice || 0), Number(candle.high || 0));

  if (settings.enableTrailingStop && Number(state.position.atrAtEntry || 0) > 0) {
    const candidateTrailing = state.position.highestPrice - (state.position.atrAtEntry * Number(settings.trailingStopAtr || 1.2));
    state.position.trailingStopPrice = Math.max(Number(state.position.trailingStopPrice || 0), candidateTrailing);
  }

  if (Number(state.position.stopLossPrice || 0) > 0 && Number(candle.low || 0) <= Number(state.position.stopLossPrice)) {
    state.position.riskStatus = 'STOP_LOSS_HIT';
    simulateSell({ state, candle, nextCandle, settings, reason: 'stop_loss_hit', forcedPrice: state.position.stopLossPrice });
    return true;
  }

  if (Number(state.position.takeProfitPrice || 0) > 0 && Number(candle.high || 0) >= Number(state.position.takeProfitPrice)) {
    state.position.riskStatus = 'TAKE_PROFIT_HIT';
    simulateSell({ state, candle, nextCandle, settings, reason: 'take_profit_hit', forcedPrice: state.position.takeProfitPrice });
    return true;
  }

  if (
    settings.enableTrailingStop
    && Number(state.position.trailingStopPrice || 0) > 0
    && Number(candle.low || 0) <= Number(state.position.trailingStopPrice)
    && Number(state.position.highestPrice || 0) > Number(state.position.avgEntryPrice || 0)
  ) {
    state.position.riskStatus = 'TRAILING_STOP_HIT';
    simulateSell({ state, candle, nextCandle, settings, reason: 'trailing_stop_hit', forcedPrice: state.position.trailingStopPrice });
    return true;
  }

  return false;
}

function buildRollingTicker(primarySlice) {
  const current = primarySlice[primarySlice.length - 1];
  const window = primarySlice.slice(-48);
  const reference = primarySlice[Math.max(0, primarySlice.length - 49)] || current;
  return {
    price: Number(current.close),
    quoteVolume: window.reduce((sum, item) => sum + Number(item.quoteVolume || 0), 0),
    tradeCount: window.reduce((sum, item) => sum + Number(item.trades || 0), 0),
    priceChangePercent: reference.close > 0 ? ((Number(current.close) - Number(reference.close)) / Number(reference.close)) * 100 : 0,
  };
}

function computeDrawdowns(curve = []) {
  let peak = 0;
  return curve.map((point) => {
    peak = Math.max(peak, Number(point.equity || 0));
    const drawdownPct = peak > 0 ? (((Number(point.equity || 0) - peak) / peak) * 100) : 0;
    return { ...point, drawdownPct: roundTo(drawdownPct, 4) };
  });
}

function computeTradeStats(sellTrades = []) {
  const wins = sellTrades.filter((item) => Number(item.realizedPnl || 0) > 0);
  const losses = sellTrades.filter((item) => Number(item.realizedPnl || 0) < 0);
  const grossProfit = wins.reduce((sum, item) => sum + Number(item.realizedPnl || 0), 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, item) => sum + Number(item.realizedPnl || 0), 0));
  const avgWin = wins.length ? average(wins.map((item) => Number(item.realizedPnl || 0))) : 0;
  const avgLossAbs = losses.length ? Math.abs(average(losses.map((item) => Number(item.realizedPnl || 0)))) : 0;
  const winRate = sellTrades.length ? (wins.length / sellTrades.length) : 0;
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLossAbs);
  const payoffRatio = avgLossAbs > 0 ? avgWin / avgLossAbs : null;

  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  sellTrades.forEach((trade) => {
    const pnl = Number(trade.realizedPnl || 0);
    if (pnl > 0) {
      consecutiveWins += 1;
      consecutiveLosses = 0;
    } else if (pnl < 0) {
      consecutiveLosses += 1;
      consecutiveWins = 0;
    } else {
      consecutiveWins = 0;
      consecutiveLosses = 0;
    }
    maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
    maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
  });

  return {
    grossProfit,
    grossLossAbs,
    wins: wins.length,
    losses: losses.length,
    avgWin,
    avgLossAbs,
    expectancy,
    payoffRatio,
    maxConsecutiveWins,
    maxConsecutiveLosses,
  };
}

function computeAdvancedMetrics({ equityCurve = [], sellTrades = [], startingBalance = 0, endingEquity = 0, maxDrawdownPct = 0 }) {
  const returns = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = Number(equityCurve[index - 1]?.equity || 0);
    const current = Number(equityCurve[index]?.equity || 0);
    returns.push(previous > 0 ? ((current - previous) / previous) : 0);
  }

  const avgReturn = average(returns);
  const returnsStd = stddev(returns);
  const downsideReturns = returns.filter((value) => value < 0);
  const downsideStd = stddev(downsideReturns);
  const scale = Math.sqrt(Math.max(returns.length, 1));
  const sharpeRatio = returnsStd > 0 ? (avgReturn / returnsStd) * scale : 0;
  const sortinoRatio = downsideStd > 0 ? (avgReturn / downsideStd) * scale : 0;
  const totalReturnPct = startingBalance > 0 ? ((endingEquity - startingBalance) / startingBalance) * 100 : 0;
  const calmarRatio = Math.abs(maxDrawdownPct) > 0 ? totalReturnPct / Math.abs(maxDrawdownPct) : 0;
  const tradeStats = computeTradeStats(sellTrades);
  const recoveryFactor = Math.abs(maxDrawdownPct) > 0 ? (endingEquity - startingBalance) / (startingBalance * Math.abs(maxDrawdownPct / 100)) : 0;

  return {
    sharpeRatio: roundTo(sharpeRatio, 4),
    sortinoRatio: roundTo(sortinoRatio, 4),
    calmarRatio: roundTo(calmarRatio, 4),
    expectancy: roundTo(tradeStats.expectancy, 4),
    avgWin: roundTo(tradeStats.avgWin, 4),
    avgLossAbs: roundTo(tradeStats.avgLossAbs, 4),
    payoffRatio: tradeStats.payoffRatio === null ? null : roundTo(tradeStats.payoffRatio, 4),
    maxConsecutiveWins: tradeStats.maxConsecutiveWins,
    maxConsecutiveLosses: tradeStats.maxConsecutiveLosses,
    recoveryFactor: roundTo(recoveryFactor, 4),
    grossProfit: roundTo(tradeStats.grossProfit, 4),
    grossLossAbs: roundTo(tradeStats.grossLossAbs, 4),
    wins: tradeStats.wins,
    losses: tradeStats.losses,
  };
}

function computePerformanceScore(metrics = {}, objective = 'balanced') {
  const totalReturn = Number(metrics.totalReturnPct || 0);
  const sharpe = Number(metrics.sharpeRatio || 0);
  const sortino = Number(metrics.sortinoRatio || 0);
  const calmar = Number(metrics.calmarRatio || 0);
  const drawdownPenalty = Math.abs(Number(metrics.maxDrawdownPct || 0));
  const winRateBonus = Number(metrics.winRatePct || 0) / 10;
  const outperformance = Number(metrics.outperformancePct || 0);
  const expectancy = Number(metrics.expectancy || 0);
  const tradesCount = Number(metrics.tradesCount || 0);
  const tradePenalty = tradesCount < 3 ? 15 : 0;

  if (objective === 'return') {
    return roundTo((totalReturn * 1.2) + (outperformance * 0.6) + (winRateBonus * 0.3) - (drawdownPenalty * 0.55) - tradePenalty, 4);
  }

  if (objective === 'risk_adjusted') {
    return roundTo((sharpe * 14) + (sortino * 12) + (calmar * 8) + (outperformance * 0.4) - (drawdownPenalty * 0.45) - tradePenalty, 4);
  }

  if (objective === 'defensive') {
    return roundTo((sortino * 10) + (expectancy * 0.08) + (winRateBonus * 0.5) - (drawdownPenalty * 0.75) + (Math.min(totalReturn, 25) * 0.4) - tradePenalty, 4);
  }

  return roundTo((totalReturn * 0.7) + (sharpe * 10) + (sortino * 9) + (outperformance * 0.5) + (expectancy * 0.05) - (drawdownPenalty * 0.55) + (winRateBonus * 0.4) - tradePenalty, 4);
}

async function persistBacktestRun(client, payload) {
  const insertResult = await client.query(
    `
      INSERT INTO backtest_runs (
        label,
        symbol,
        interval,
        confirmation_interval,
        candle_limit,
        config_snapshot,
        status,
        started_at,
        finished_at,
        metrics,
        payload,
        regime_label,
        performance_score,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW(), $8::jsonb, $9::jsonb, $10, $11, NOW(), NOW())
      RETURNING id
    `,
    [
      payload.label,
      payload.symbol,
      payload.interval,
      payload.confirmationInterval,
      payload.candleLimit,
      JSON.stringify(payload.configSnapshot),
      payload.status,
      JSON.stringify(payload.metrics),
      JSON.stringify(payload.payload || {}),
      payload.metrics.regimeLabel || 'mixed',
      Number(payload.metrics.performanceScore || 0),
    ],
  );

  const runId = insertResult.rows[0].id;

  for (const trade of payload.trades) {
    await client.query(
      `
        INSERT INTO backtest_trades (
          run_id,
          symbol,
          side,
          reason,
          decision_action,
          confidence,
          price,
          quantity,
          notional,
          fee_amount,
          realized_pnl,
          pnl_pct,
          candle_time,
          execution_time,
          meta,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TO_TIMESTAMP($13 / 1000.0), TO_TIMESTAMP($14 / 1000.0), $15::jsonb, NOW())
      `,
      [
        runId,
        trade.symbol,
        trade.side,
        trade.reason,
        trade.decisionAction,
        trade.confidence,
        trade.price,
        trade.quantity,
        trade.notional,
        trade.feeAmount,
        trade.realizedPnl,
        trade.pnlPct,
        trade.candleTime,
        trade.executionTime,
        JSON.stringify(trade.meta || {}),
      ],
    );
  }

  const sampleEvery = payload.equityCurve.length > 700 ? Math.ceil(payload.equityCurve.length / 700) : 1;
  for (let index = 0; index < payload.equityCurve.length; index += sampleEvery) {
    const point = payload.equityCurve[index];
    await client.query(
      `
        INSERT INTO backtest_equity_points (
          run_id,
          point_time,
          equity,
          cash_balance,
          positions_value,
          drawdown_pct,
          created_at
        )
        VALUES ($1, TO_TIMESTAMP($2 / 1000.0), $3, $4, $5, $6, NOW())
      `,
      [runId, point.time, point.equity, point.cashBalance, point.positionsValue, point.drawdownPct],
    );
  }

  return runId;
}

async function runSingleBacktest({
  label,
  symbol,
  interval,
  confirmationInterval,
  limit,
  config,
  persist = true,
  meta = {},
  marketDataOverride = null,
  evaluationStartIndex = null,
}) {
  const primaryCandles = marketDataOverride?.primaryCandles
    || (await getCandles({ symbol, interval, limit, refresh: false })).candles
    || [];
  const confirmationCandles = marketDataOverride?.confirmationCandles
    || (await getCandles({ symbol, interval: confirmationInterval, limit, refresh: false })).candles
    || [];
  const minDataPoints = Number(config?.ai?.minDataPoints || 120);
  const paper = config?.execution?.paper || {};
  const initialCapital = Number(paper.initialCapital || 10000);
  const orderSizePct = Number(paper.orderSizePct || 10);
  const minOrderNotional = Number(paper.minOrderNotional || 50);
  const feePct = Number(paper.feePct || 0.1);
  const slippagePct = Number(paper.slippagePct || 0.05);
  const enableTrailingStop = Boolean(config?.risk?.enableTrailingStop ?? true);
  const trailingStopAtr = Number(config?.risk?.trailingStopAtr || 1.2);
  const objective = meta.objective || config?.optimizer?.defaultObjective || 'balanced';
  const requestedEvaluationStart = Number.isFinite(Number(evaluationStartIndex))
    ? Number(evaluationStartIndex)
    : minDataPoints;
  const evaluationStart = Math.max(minDataPoints, Math.min(Math.trunc(requestedEvaluationStart), Math.max(minDataPoints, primaryCandles.length - 2)));

  if (primaryCandles.length < minDataPoints + 3) {
    throw new Error(`not_enough_primary_candles_for_backtest:${symbol}:${interval}`);
  }

  if (confirmationCandles.length < minDataPoints + 3) {
    throw new Error(`not_enough_confirmation_candles_for_backtest:${symbol}:${confirmationInterval}`);
  }

  const regimeLabel = inferMarketRegime(primaryCandles, confirmationCandles);

  const state = {
    symbol,
    cash: initialCapital,
    startingBalance: initialCapital,
    realizedPnl: 0,
    feesPaid: 0,
    position: null,
    trades: [],
    equityCurve: [],
    rejectedSignals: 0,
    blockedSignals: 0,
    holdSignals: 0,
    buySignals: 0,
    sellSignals: 0,
  };

  for (let index = evaluationStart; index < primaryCandles.length - 1; index += 1) {
    const candle = primaryCandles[index];
    const nextCandle = primaryCandles[index + 1];
    const primarySlice = primaryCandles.slice(0, index + 1);
    const confirmationSlice = confirmationCandles.filter((item) => Number(item.openTime) <= Number(candle.openTime));
    const alignedConfirmation = confirmationSlice.slice(-Math.max(minDataPoints, 120));

    if (alignedConfirmation.length < minDataPoints) continue;

    const settings = { feePct, slippagePct, enableTrailingStop, trailingStopAtr };
    const riskExitTriggered = maybeTriggerRiskExit({ state, candle, nextCandle, settings });

    const portfolio = buildBacktestPortfolioState(state, Number(candle.close));
    const decision = evaluateSymbol({
      primaryCandles: primarySlice,
      confirmationCandles: alignedConfirmation,
      ticker: buildRollingTicker(primarySlice),
      config,
      portfolio,
      symbol,
      socialScore: {},
      controlState: { isPaused: false, emergencyStop: false, cooldownActive: false },
    });

    if (decision.blocked) state.blockedSignals += 1;
    if (decision.action === 'HOLD') state.holdSignals += 1;
    if (decision.action === 'BUY') state.buySignals += 1;
    if (decision.action === 'SELL') state.sellSignals += 1;

    if (!riskExitTriggered && !decision.blocked) {
      if (decision.action === 'BUY' && !state.position) {
        let requestedNotional = state.cash * (orderSizePct / 100);
        requestedNotional = Math.max(requestedNotional, minOrderNotional);
        requestedNotional = Math.min(requestedNotional, state.cash);

        if (requestedNotional >= minOrderNotional && requestedNotional <= state.cash && Number(nextCandle.open || 0) > 0) {
          const executionPrice = Number(nextCandle.open) * (1 + (slippagePct / 100));
          const feeAmount = requestedNotional * (feePct / 100);
          const quantity = executionPrice > 0 ? (requestedNotional - feeAmount) / executionPrice : 0;

          if (quantity > 0) {
            state.cash -= requestedNotional;
            state.feesPaid += feeAmount;
            state.position = createPosition({ executionPrice, notional: requestedNotional, quantity, riskPlan: decision.riskPlan, candle: nextCandle });
            state.trades.push({
              side: 'BUY',
              reason: decision.reason,
              symbol,
              candleTime: candle.closeTime,
              executionTime: nextCandle.openTime,
              price: roundTo(executionPrice),
              quantity: roundTo(quantity),
              notional: roundTo(requestedNotional),
              feeAmount: roundTo(feeAmount),
              realizedPnl: 0,
              pnlPct: 0,
              confidence: Number(decision.confidence || 0),
              decisionAction: 'BUY',
              meta: { blocked: false, experts: decision.experts, riskPlan: decision.riskPlan },
            });
          } else {
            state.rejectedSignals += 1;
          }
        } else {
          state.rejectedSignals += 1;
        }
      } else if (decision.action === 'SELL' && state.position) {
        simulateSell({ state, candle, nextCandle, settings, reason: decision.reason, decision });
      }
    }

    const marketValue = state.position ? state.position.quantity * Number(candle.close) : 0;
    const equity = state.cash + marketValue;
    state.equityCurve.push({
      time: Number(candle.closeTime),
      equity: roundTo(equity, 4),
      cashBalance: roundTo(state.cash, 4),
      positionsValue: roundTo(marketValue, 4),
      drawdownPct: 0,
    });
  }

  if (state.position) {
    const finalCandle = primaryCandles[primaryCandles.length - 1];
    simulateSell({
      state,
      candle: finalCandle,
      nextCandle: finalCandle,
      settings: { feePct, slippagePct, enableTrailingStop, trailingStopAtr },
      reason: 'backtest_end_flatten',
      forcedPrice: Number(finalCandle.close),
      decision: { action: 'SELL', confidence: 1, blocked: false, reason: 'backtest_end_flatten' },
    });
    state.equityCurve.push({
      time: Number(finalCandle.closeTime),
      equity: roundTo(state.cash, 4),
      cashBalance: roundTo(state.cash, 4),
      positionsValue: 0,
      drawdownPct: 0,
    });
  }

  const maxDrawdownPct = computeMaxDrawdownPct(state.equityCurve);
  state.equityCurve = computeDrawdowns(state.equityCurve);

  const sellTrades = state.trades.filter((item) => item.side === 'SELL');
  const grossProfit = sellTrades.filter((item) => item.realizedPnl > 0).reduce((sum, item) => sum + item.realizedPnl, 0);
  const grossLoss = Math.abs(sellTrades.filter((item) => item.realizedPnl < 0).reduce((sum, item) => sum + item.realizedPnl, 0));
  const wins = sellTrades.filter((item) => item.realizedPnl > 0).length;
  const endingEquity = state.equityCurve[state.equityCurve.length - 1]?.equity ?? state.cash;
  const totalReturnPct = state.startingBalance > 0 ? ((endingEquity - state.startingBalance) / state.startingBalance) * 100 : 0;
  const buyHoldBasePrice = Number(primaryCandles[evaluationStart]?.close || primaryCandles[minDataPoints]?.close || 0);
  const buyHoldReturnPct = primaryCandles.length > 1 && buyHoldBasePrice > 0
    ? ((Number(primaryCandles[primaryCandles.length - 1].close) - buyHoldBasePrice) / buyHoldBasePrice) * 100
    : 0;
  const avgTradePct = sellTrades.length ? sellTrades.reduce((sum, item) => sum + Number(item.pnlPct || 0), 0) / sellTrades.length : 0;

  const advanced = computeAdvancedMetrics({
    equityCurve: state.equityCurve,
    sellTrades,
    startingBalance: state.startingBalance,
    endingEquity,
    maxDrawdownPct,
  });

  const metrics = {
    startingBalance: roundTo(state.startingBalance, 4),
    endingEquity: roundTo(endingEquity, 4),
    realizedPnl: roundTo(state.realizedPnl, 4),
    feesPaid: roundTo(state.feesPaid, 4),
    totalReturnPct: roundTo(totalReturnPct, 4),
    buyHoldReturnPct: roundTo(buyHoldReturnPct, 4),
    outperformancePct: roundTo(totalReturnPct - buyHoldReturnPct, 4),
    maxDrawdownPct: roundTo(maxDrawdownPct, 4),
    tradesCount: sellTrades.length,
    ordersCount: state.trades.length,
    winRatePct: roundTo(sellTrades.length ? (wins / sellTrades.length) * 100 : 0, 4),
    profitFactor: grossLoss > 0 ? roundTo(grossProfit / grossLoss, 4) : (grossProfit > 0 ? null : 0),
    avgTradePct: roundTo(avgTradePct, 4),
    blockedSignals: state.blockedSignals,
    rejectedSignals: state.rejectedSignals,
    holdSignals: state.holdSignals,
    buySignals: state.buySignals,
    sellSignals: state.sellSignals,
    candlesProcessed: primaryCandles.length,
    regimeLabel,
    ...advanced,
  };
  metrics.performanceScore = computePerformanceScore(metrics, objective);

  const summary = {
    label: label || `Backtest ${symbol} ${interval}`,
    symbol,
    interval,
    confirmationInterval,
    candleLimit: limit,
    configSnapshot: config,
    status: 'completed',
    metrics,
    trades: state.trades,
    equityCurve: state.equityCurve,
    payload: {
      meta,
      evaluation: {
        evaluationStartIndex: evaluationStart,
        warmupCandles: evaluationStart,
        source: marketDataOverride ? 'override' : 'provider',
      },
      generatedAt: new Date().toISOString(),
    },
  };

  let runId = null;
  if (persist) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      runId = await persistBacktestRun(client, summary);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { id: runId, ...summary };
}

async function runBacktest({ label, symbol, interval, confirmationInterval, limit, configOverride = null, persist = true, meta = {} }) {
  const configRow = await getActiveConfig();
  const activeConfig = configRow?.config || {};
  const finalConfig = configOverride ? deepMerge(activeConfig, configOverride) : activeConfig;
  const finalSymbol = String(symbol || finalConfig?.trading?.symbols?.[0] || '').toUpperCase();
  const finalInterval = interval || finalConfig?.trading?.primaryTimeframe || '5m';
  const finalConfirmationInterval = confirmationInterval || finalConfig?.trading?.confirmationTimeframes?.[0] || '15m';
  const finalLimit = Math.min(Math.max(Number(limit || finalConfig?.trading?.lookbackCandles || 300), 150), 1000);

  if (!finalSymbol) throw new Error('backtest_symbol_required');

  return runSingleBacktest({
    label,
    symbol: finalSymbol,
    interval: finalInterval,
    confirmationInterval: finalConfirmationInterval,
    limit: finalLimit,
    config: finalConfig,
    persist,
    meta,
  });
}

async function compareBacktests({ symbol, interval, confirmationInterval, limit, challengerConfig = {}, baseConfig = null }) {
  const configRow = await getActiveConfig();
  const activeConfig = baseConfig || configRow?.config || {};

  const baseline = await runBacktest({
    label: `baseline:${symbol || activeConfig?.trading?.symbols?.[0] || 'symbol'}`,
    symbol,
    interval,
    confirmationInterval,
    limit,
    configOverride: activeConfig === (configRow?.config || {}) ? null : activeConfig,
    persist: true,
    meta: { comparisonRole: 'baseline' },
  });

  const challengerMerged = deepMerge(activeConfig, challengerConfig || {});
  const challenger = await runSingleBacktest({
    label: `challenger:${symbol || challengerMerged?.trading?.symbols?.[0] || 'symbol'}`,
    symbol: String(symbol || challengerMerged?.trading?.symbols?.[0] || '').toUpperCase(),
    interval: interval || challengerMerged?.trading?.primaryTimeframe || '5m',
    confirmationInterval: confirmationInterval || challengerMerged?.trading?.confirmationTimeframes?.[0] || '15m',
    limit: Math.min(Math.max(Number(limit || challengerMerged?.trading?.lookbackCandles || 300), 150), 1000),
    config: challengerMerged,
    persist: true,
    meta: { comparisonRole: 'challenger' },
  });

  const delta = {
    totalReturnPct: roundTo(Number(challenger.metrics.totalReturnPct || 0) - Number(baseline.metrics.totalReturnPct || 0), 4),
    maxDrawdownPct: roundTo(Number(challenger.metrics.maxDrawdownPct || 0) - Number(baseline.metrics.maxDrawdownPct || 0), 4),
    winRatePct: roundTo(Number(challenger.metrics.winRatePct || 0) - Number(baseline.metrics.winRatePct || 0), 4),
    profitFactor: (challenger.metrics.profitFactor === null || baseline.metrics.profitFactor === null) ? null : roundTo(Number(challenger.metrics.profitFactor || 0) - Number(baseline.metrics.profitFactor || 0), 4),
    tradesCount: Number(challenger.metrics.tradesCount || 0) - Number(baseline.metrics.tradesCount || 0),
    outperformancePct: roundTo(Number(challenger.metrics.outperformancePct || 0) - Number(baseline.metrics.outperformancePct || 0), 4),
    performanceScore: roundTo(Number(challenger.metrics.performanceScore || 0) - Number(baseline.metrics.performanceScore || 0), 4),
    sharpeRatio: roundTo(Number(challenger.metrics.sharpeRatio || 0) - Number(baseline.metrics.sharpeRatio || 0), 4),
    sortinoRatio: roundTo(Number(challenger.metrics.sortinoRatio || 0) - Number(baseline.metrics.sortinoRatio || 0), 4),
  };

  return {
    baseline: { id: baseline.id, label: baseline.label, symbol: baseline.symbol, interval: baseline.interval, metrics: baseline.metrics },
    challenger: { id: challenger.id, label: challenger.label, symbol: challenger.symbol, interval: challenger.interval, metrics: challenger.metrics },
    delta,
  };
}

async function listBacktestRuns({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await pool.query(
    `
      SELECT
        id,
        label,
        symbol,
        interval,
        confirmation_interval AS "confirmationInterval",
        candle_limit AS "candleLimit",
        status,
        metrics,
        regime_label AS "regimeLabel",
        performance_score AS "performanceScore",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM backtest_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map((row) => ({ ...row, performanceScore: Number(row.performanceScore || 0) }));
}

async function getBacktestRunById(id) {
  const runResult = await pool.query(
    `
      SELECT
        id,
        label,
        symbol,
        interval,
        confirmation_interval AS "confirmationInterval",
        candle_limit AS "candleLimit",
        config_snapshot AS "configSnapshot",
        status,
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        metrics,
        payload,
        regime_label AS "regimeLabel",
        performance_score AS "performanceScore",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM backtest_runs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  const run = runResult.rows[0] || null;
  if (!run) return null;

  const [tradesResult, equityResult] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          symbol,
          side,
          reason,
          decision_action AS "decisionAction",
          confidence,
          price,
          quantity,
          notional,
          fee_amount AS "feeAmount",
          realized_pnl AS "realizedPnl",
          pnl_pct AS "pnlPct",
          candle_time AS "candleTime",
          execution_time AS "executionTime",
          meta,
          created_at AS "createdAt"
        FROM backtest_trades
        WHERE run_id = $1
        ORDER BY execution_time ASC, id ASC
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          point_time AS "pointTime",
          equity,
          cash_balance AS "cashBalance",
          positions_value AS "positionsValue",
          drawdown_pct AS "drawdownPct"
        FROM backtest_equity_points
        WHERE run_id = $1
        ORDER BY point_time ASC
      `,
      [id],
    ),
  ]);

  return {
    ...run,
    performanceScore: Number(run.performanceScore || 0),
    trades: tradesResult.rows.map((row) => ({
      ...row,
      confidence: Number(row.confidence || 0),
      price: Number(row.price || 0),
      quantity: Number(row.quantity || 0),
      notional: Number(row.notional || 0),
      feeAmount: Number(row.feeAmount || 0),
      realizedPnl: Number(row.realizedPnl || 0),
      pnlPct: Number(row.pnlPct || 0),
    })),
    equityCurve: equityResult.rows.map((row) => ({
      ...row,
      equity: Number(row.equity || 0),
      cashBalance: Number(row.cashBalance || 0),
      positionsValue: Number(row.positionsValue || 0),
      drawdownPct: Number(row.drawdownPct || 0),
    })),
  };
}



async function runBacktestFromCandles({
  label,
  symbol,
  interval,
  confirmationInterval,
  primaryCandles = [],
  confirmationCandles = [],
  config,
  persist = false,
  meta = {},
  evaluationStartIndex = null,
}) {
  if (!Array.isArray(primaryCandles) || primaryCandles.length === 0) {
    throw new Error('backtest_primary_candles_required');
  }
  if (!Array.isArray(confirmationCandles) || confirmationCandles.length === 0) {
    throw new Error('backtest_confirmation_candles_required');
  }
  const finalInterval = interval || '5m';
  const finalConfirmationInterval = confirmationInterval || '15m';
  return runSingleBacktest({
    label,
    symbol: String(symbol || '').toUpperCase(),
    interval: finalInterval,
    confirmationInterval: finalConfirmationInterval,
    limit: primaryCandles.length,
    config: config || {},
    persist,
    meta,
    marketDataOverride: {
      primaryCandles,
      confirmationCandles,
    },
    evaluationStartIndex,
  });
}

module.exports = {
  runBacktest,
  runBacktestFromCandles,
  compareBacktests,
  listBacktestRuns,
  getBacktestRunById,
  deepMerge,
  inferMarketRegime,
  computePerformanceScore,
};
