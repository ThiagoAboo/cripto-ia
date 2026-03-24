import json
import math
import os
import statistics
import time
from typing import Any, Dict, List

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "troque-esta-chave")
WORKER_NAME = os.getenv("WORKER_NAME", "ai-trading-worker")
LOOP_INTERVAL_SEC = int(os.getenv("LOOP_INTERVAL_SEC", "15"))
MARKET_REFRESH = os.getenv("MARKET_REFRESH", "false").lower() in {"1", "true", "yes", "on"}
REQUEST_TIMEOUT_SEC = int(os.getenv("REQUEST_TIMEOUT_SEC", "20"))

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "x-internal-api-key": INTERNAL_API_KEY,
})


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def average(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def safe_div(numerator: float, denominator: float, fallback: float = 0.0) -> float:
    if denominator == 0:
        return fallback
    return numerator / denominator


def ema(values: List[float], period: int) -> List[float]:
    if not values:
        return []

    multiplier = 2 / (period + 1)
    ema_values = [values[0]]

    for value in values[1:]:
        ema_values.append((value - ema_values[-1]) * multiplier + ema_values[-1])

    return ema_values


def rsi(values: List[float], period: int = 14) -> float:
    if len(values) < period + 1:
        return 50.0

    gains = []
    losses = []

    for index in range(1, len(values)):
        delta = values[index] - values[index - 1]
        gains.append(max(delta, 0.0))
        losses.append(abs(min(delta, 0.0)))

    avg_gain = average(gains[:period])
    avg_loss = average(losses[:period])

    for index in range(period, len(gains)):
        avg_gain = ((avg_gain * (period - 1)) + gains[index]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[index]) / period

    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def atr(candles: List[Dict[str, Any]], period: int = 14) -> float:
    if len(candles) < period + 1:
        return 0.0

    true_ranges = []
    for index in range(1, len(candles)):
        high = float(candles[index]["high"])
        low = float(candles[index]["low"])
        prev_close = float(candles[index - 1]["close"])
        true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))

    return average(true_ranges[-period:])


def linear_slope(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0

    x_mean = (len(values) - 1) / 2
    y_mean = average(values)
    numerator = 0.0
    denominator = 0.0

    for idx, value in enumerate(values):
        numerator += (idx - x_mean) * (value - y_mean)
        denominator += (idx - x_mean) ** 2

    return safe_div(numerator, denominator, 0.0)


def stddev(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    return statistics.pstdev(values)


def pct_change(current: float, previous: float) -> float:
    return safe_div(current - previous, previous, 0.0)


def get_active_config() -> Dict[str, Any]:
    response = requests.get(f"{BACKEND_URL}/api/config", timeout=REQUEST_TIMEOUT_SEC)
    response.raise_for_status()
    return response.json()


def get_candles(symbol: str, interval: str, limit: int, refresh: bool) -> List[Dict[str, Any]]:
    response = requests.get(
        f"{BACKEND_URL}/api/market/candles/{symbol}",
        params={
            "interval": interval,
            "limit": limit,
            "refresh": str(refresh).lower(),
        },
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("candles", [])


def get_tickers(symbols: List[str], refresh: bool) -> Dict[str, Dict[str, Any]]:
    response = requests.get(
        f"{BACKEND_URL}/api/market/tickers",
        params={
            "symbols": ",".join(symbols),
            "refresh": str(refresh).lower(),
        },
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    return {item["symbol"]: item for item in payload.get("items", [])}


def get_portfolio() -> Dict[str, Any]:
    response = requests.get(f"{BACKEND_URL}/api/portfolio", timeout=REQUEST_TIMEOUT_SEC)
    response.raise_for_status()
    return response.json()


def send_heartbeat(status: str, payload: Dict[str, Any]) -> None:
    response = session.post(
        f"{BACKEND_URL}/internal/heartbeat",
        data=json.dumps({
            "workerName": WORKER_NAME,
            "status": status,
            "payload": payload,
        }),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()


def publish_event(event_type: str, payload: Dict[str, Any]) -> None:
    response = session.post(
        f"{BACKEND_URL}/internal/events",
        data=json.dumps({
            "eventType": event_type,
            "source": WORKER_NAME,
            "payload": payload,
        }),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()


def publish_decision(symbol: str, action: str, confidence: float, blocked: bool, reason: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = session.post(
        f"{BACKEND_URL}/internal/decisions",
        data=json.dumps({
            "workerName": WORKER_NAME,
            "symbol": symbol,
            "action": action,
            "confidence": confidence,
            "blocked": blocked,
            "reason": reason,
            "payload": payload,
        }),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    return response.json()


def submit_paper_order(symbol: str, side: str, linked_decision_id: int, reason: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = session.post(
        f"{BACKEND_URL}/internal/orders/paper",
        data=json.dumps({
            "workerName": WORKER_NAME,
            "symbol": symbol,
            "side": side,
            "linkedDecisionId": linked_decision_id,
            "reason": reason,
            "payload": payload,
        }),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    return response.json()


def compute_market_features(primary_candles: List[Dict[str, Any]], confirmation_candles: List[Dict[str, Any]], ticker: Dict[str, Any]) -> Dict[str, float]:
    closes = [float(item["close"]) for item in primary_candles]
    highs = [float(item["high"]) for item in primary_candles]
    lows = [float(item["low"]) for item in primary_candles]
    volumes = [float(item["quoteVolume"]) for item in primary_candles]

    close_now = closes[-1]
    close_prev = closes[-2]
    ema_fast_series = ema(closes, 9)
    ema_mid_series = ema(closes, 21)
    ema_slow_series = ema(closes, 50)

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_series = [a - b for a, b in zip(ema12, ema26)]
    macd_line = macd_series[-1]
    macd_signal = ema(macd_series, 9)[-1]
    macd_hist = macd_line - macd_signal
    rsi_now = rsi(closes, 14)
    atr_now = atr(primary_candles, 14)
    atr_pct = safe_div(atr_now, close_now, 0.0)
    band_width_pct = safe_div((max(highs[-20:]) - min(lows[-20:])), close_now, 0.0) if len(highs) >= 20 else 0.0
    returns = [pct_change(closes[i], closes[i - 1]) for i in range(1, len(closes))]
    realized_vol = stddev(returns[-20:]) * math.sqrt(20) if len(returns) >= 20 else 0.0
    price_vs_ema_fast = safe_div(close_now - ema_fast_series[-1], close_now, 0.0)
    price_vs_ema_slow = safe_div(close_now - ema_slow_series[-1], close_now, 0.0)
    ema_stack = 1.0 if ema_fast_series[-1] > ema_mid_series[-1] > ema_slow_series[-1] else 0.0
    recent_high_break = 1.0 if close_now >= max(highs[-20:-1]) else 0.0
    recent_low_break = 1.0 if close_now <= min(lows[-20:-1]) else 0.0
    momentum_5 = pct_change(close_now, closes[-6]) if len(closes) >= 6 else 0.0
    momentum_20 = pct_change(close_now, closes[-21]) if len(closes) >= 21 else 0.0
    volume_ratio = safe_div(volumes[-1], average(volumes[-20:]), 1.0) if len(volumes) >= 20 else 1.0
    slope_fast = linear_slope(closes[-15:])

    confirmation_closes = [float(item["close"]) for item in confirmation_candles]
    confirmation_trend = 0.0
    if len(confirmation_closes) >= 50:
        confirmation_fast = ema(confirmation_closes, 21)[-1]
        confirmation_slow = ema(confirmation_closes, 50)[-1]
        confirmation_trend = safe_div(confirmation_fast - confirmation_slow, confirmation_closes[-1], 0.0)

    ticker_quote_volume = float(ticker.get("quoteVolume", 0.0))
    ticker_trade_count = float(ticker.get("tradeCount", 0.0))
    ticker_change_pct = float(ticker.get("priceChangePercent", 0.0)) / 100.0

    return {
        "close": close_now,
        "closePrev": close_prev,
        "rsi": rsi_now,
        "atrPct": atr_pct,
        "bandWidthPct": band_width_pct,
        "realizedVol": realized_vol,
        "priceVsEmaFast": price_vs_ema_fast,
        "priceVsEmaSlow": price_vs_ema_slow,
        "emaStack": ema_stack,
        "recentHighBreak": recent_high_break,
        "recentLowBreak": recent_low_break,
        "momentum5": momentum_5,
        "momentum20": momentum_20,
        "volumeRatio": volume_ratio,
        "macdHist": macd_hist,
        "slopeFast": slope_fast,
        "confirmationTrend": confirmation_trend,
        "tickerQuoteVolume": ticker_quote_volume,
        "tickerTradeCount": ticker_trade_count,
        "tickerChangePct": ticker_change_pct,
    }


def trend_expert(features: Dict[str, float]) -> Dict[str, Any]:
    buy = clamp(
        0.35
        + max(0.0, features["priceVsEmaSlow"]) * 10
        + features["emaStack"] * 0.20
        + max(0.0, features["confirmationTrend"]) * 12,
        0.0,
        1.0,
    )
    sell = clamp(
        0.30
        + max(0.0, -features["priceVsEmaSlow"]) * 10
        + (0.20 if features["emaStack"] == 0 else 0.0)
        + max(0.0, -features["confirmationTrend"]) * 12,
        0.0,
        1.0,
    )
    label = "trend_up" if buy > sell else "trend_down_or_weak"
    return {"buy": round(buy, 4), "sell": round(sell, 4), "label": label}


def momentum_expert(features: Dict[str, float]) -> Dict[str, Any]:
    rsi_buy = clamp((features["rsi"] - 50) / 25, 0.0, 1.0)
    rsi_sell = clamp((50 - features["rsi"]) / 25, 0.0, 1.0)
    buy = clamp(
        0.25
        + max(0.0, features["momentum5"]) * 12
        + max(0.0, features["momentum20"]) * 8
        + max(0.0, features["macdHist"]) * 10
        + rsi_buy * 0.20,
        0.0,
        1.0,
    )
    sell = clamp(
        0.25
        + max(0.0, -features["momentum5"]) * 12
        + max(0.0, -features["momentum20"]) * 8
        + max(0.0, -features["macdHist"]) * 10
        + rsi_sell * 0.20,
        0.0,
        1.0,
    )
    label = "momentum_positive" if buy > sell else "momentum_negative"
    return {"buy": round(buy, 4), "sell": round(sell, 4), "label": label}


def volatility_expert(features: Dict[str, float]) -> Dict[str, Any]:
    ideal_vol = 0.012
    vol_distance = abs(features["atrPct"] - ideal_vol)
    buy = clamp(0.75 - (vol_distance * 20) - max(0.0, features["realizedVol"] - 0.03) * 8, 0.0, 1.0)
    sell = clamp(0.20 + max(0.0, features["atrPct"] - 0.025) * 20 + max(0.0, features["realizedVol"] - 0.04) * 10, 0.0, 1.0)
    label = "volatility_ok" if buy >= sell else "volatility_risk"
    return {"buy": round(buy, 4), "sell": round(sell, 4), "label": label}


def liquidity_expert(features: Dict[str, float]) -> Dict[str, Any]:
    quote_volume_score = clamp(features["tickerQuoteVolume"] / 10_000_000, 0.0, 1.0)
    trade_count_score = clamp(features["tickerTradeCount"] / 50_000, 0.0, 1.0)
    candle_activity_score = clamp(features["volumeRatio"] / 2.0, 0.0, 1.0)
    buy = clamp((quote_volume_score * 0.45) + (trade_count_score * 0.30) + (candle_activity_score * 0.25), 0.0, 1.0)
    sell = clamp(1.0 - buy, 0.0, 1.0)
    label = "liquidity_ok" if buy >= 0.45 else "liquidity_thin"
    return {"buy": round(buy, 4), "sell": round(sell, 4), "label": label}


def regime_expert(features: Dict[str, float]) -> Dict[str, Any]:
    trendiness = clamp(
        abs(features["priceVsEmaSlow"]) * 12
        + abs(features["confirmationTrend"]) * 15
        + abs(features["slopeFast"]) * 120,
        0.0,
        1.0,
    )
    breakout = 0.25 if features["recentHighBreak"] else 0.0
    breakdown = 0.25 if features["recentLowBreak"] else 0.0
    buy = clamp(0.30 + trendiness * 0.45 + breakout, 0.0, 1.0)
    sell = clamp(0.25 + (1 - trendiness) * 0.20 + breakdown + max(0.0, -features["tickerChangePct"]) * 2, 0.0, 1.0)
    label = "trending" if trendiness >= 0.45 else "ranging_or_unclear"
    return {"buy": round(buy, 4), "sell": round(sell, 4), "label": label}


def risk_expert(symbol: str, portfolio: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    open_symbols = set(portfolio.get("openSymbols", []))
    open_positions = int(portfolio.get("openPositionsCount", 0))
    exposure_pct = float(portfolio.get("exposurePct", 0.0))
    max_open_positions = int(config.get("trading", {}).get("maxOpenPositions", 5))
    max_portfolio_exposure = float(config.get("risk", {}).get("maxPortfolioExposurePct", 35))
    allow_averaging_down = bool(config.get("risk", {}).get("allowAveragingDown", False))
    allow_multiple_entries = bool(config.get("execution", {}).get("paper", {}).get("allowMultipleEntriesPerSymbol", False))

    position_exists = symbol in open_symbols
    buy_gate = 1.0
    sell_gate = 0.45 if position_exists else 0.80
    notes: List[str] = []

    if position_exists and not allow_multiple_entries and not allow_averaging_down:
        buy_gate = 0.0
        notes.append("position_already_open")

    if open_positions >= max_open_positions and not position_exists:
        buy_gate = 0.0
        notes.append("max_open_positions_reached")

    if exposure_pct >= max_portfolio_exposure:
        buy_gate = 0.0
        notes.append("portfolio_exposure_limit")

    if position_exists:
        sell_gate = 0.25
        notes.append("position_can_be_reduced")

    label = "risk_ok"
    if notes:
        label = ",".join(notes)

    return {
        "buy": round(buy_gate, 4),
        "sell": round(sell_gate, 4),
        "label": label,
        "positionExists": position_exists,
        "openPositions": open_positions,
        "exposurePct": round(exposure_pct, 4),
    }


def evaluate_symbol(primary_candles: List[Dict[str, Any]], confirmation_candles: List[Dict[str, Any]], ticker: Dict[str, Any], config: Dict[str, Any], portfolio: Dict[str, Any], symbol: str) -> Dict[str, Any]:
    ai_config = config.get("ai", {})
    weights = ai_config.get("expertWeights", {})
    buy_threshold = float(ai_config.get("minConfidenceToBuy", 0.64))
    sell_threshold = float(ai_config.get("minConfidenceToSell", 0.60))
    decision_margin = float(ai_config.get("decisionMargin", 0.05))

    features = compute_market_features(primary_candles, confirmation_candles, ticker)
    experts = {
        "trend": trend_expert(features),
        "momentum": momentum_expert(features),
        "volatility": volatility_expert(features),
        "liquidity": liquidity_expert(features),
        "regime": regime_expert(features),
        "risk": risk_expert(symbol, portfolio, config),
    }

    total_weight = sum(float(weights.get(name, 0.0)) for name in experts) or 1.0
    buy_score = sum(experts[name]["buy"] * float(weights.get(name, 0.0)) for name in experts) / total_weight
    sell_score = sum(experts[name]["sell"] * float(weights.get(name, 0.0)) for name in experts) / total_weight

    blocked = False
    reason = "no_trade_edge"
    action = "HOLD"
    confidence = max(buy_score, sell_score)

    if experts["liquidity"]["buy"] < 0.30:
        blocked = True
        action = "BLOCK"
        reason = "low_liquidity"
        confidence = experts["liquidity"]["sell"]
    elif experts["risk"]["buy"] == 0.0 and buy_score >= sell_score:
        blocked = True
        action = "BLOCK"
        reason = experts["risk"]["label"]
        confidence = max(buy_score, experts["risk"]["sell"])
    elif experts["risk"]["positionExists"] is False and sell_score >= buy_score and sell_score >= sell_threshold:
        action = "HOLD"
        reason = "no_position_to_reduce"
        confidence = sell_score
    elif buy_score >= buy_threshold and (buy_score - sell_score) >= decision_margin:
        action = "BUY"
        reason = "multi_expert_buy_alignment"
        confidence = buy_score
    elif sell_score >= sell_threshold and (sell_score - buy_score) >= decision_margin:
        action = "SELL"
        reason = "multi_expert_sell_alignment"
        confidence = sell_score

    return {
        "action": action,
        "blocked": blocked,
        "reason": reason,
        "confidence": round(confidence, 4),
        "buyScore": round(buy_score, 4),
        "sellScore": round(sell_score, 4),
        "experts": experts,
        "features": {
            key: round(value, 6) if isinstance(value, float) else value
            for key, value in features.items()
        },
    }


def loop_once() -> None:
    config_row = get_active_config()
    config = config_row.get("config", {})
    trading_config = config.get("trading", {})
    ai_config = config.get("ai", {})

    symbols = trading_config.get("symbols", [])
    primary_timeframe = trading_config.get("primaryTimeframe", trading_config.get("timeframe", "5m"))
    confirmation_timeframes = trading_config.get("confirmationTimeframes", ["1h"])
    confirmation_timeframe = confirmation_timeframes[0] if confirmation_timeframes else "1h"
    lookback = int(trading_config.get("lookbackCandles", 240))
    min_data_points = int(ai_config.get("minDataPoints", 120))
    trading_enabled = bool(trading_config.get("enabled", False))
    trading_mode = trading_config.get("mode", "paper")

    tickers = get_tickers(symbols, refresh=MARKET_REFRESH)
    portfolio = get_portfolio()

    send_heartbeat(
        "running",
        {
            "configVersion": config_row.get("version", 0),
            "symbols": symbols,
            "loopIntervalSec": LOOP_INTERVAL_SEC,
            "primaryTimeframe": primary_timeframe,
            "confirmationTimeframe": confirmation_timeframe,
            "tradingEnabled": trading_enabled,
            "tradingMode": trading_mode,
            "portfolio": {
                "equity": portfolio.get("equity", 0),
                "cashBalance": portfolio.get("cashBalance", 0),
                "openPositionsCount": portfolio.get("openPositionsCount", 0),
            },
        },
    )

    publish_event(
        "worker.loop.started",
        {
            "configVersion": config_row.get("version", 0),
            "symbolsCount": len(symbols),
            "primaryTimeframe": primary_timeframe,
            "portfolioEquity": portfolio.get("equity", 0),
            "openPositionsCount": portfolio.get("openPositionsCount", 0),
        },
    )

    processed = 0
    blocked_count = 0
    filled_orders = 0
    rejected_orders = 0

    for symbol in symbols:
        primary_candles = get_candles(symbol, primary_timeframe, lookback, refresh=MARKET_REFRESH)
        confirmation_candles = get_candles(symbol, confirmation_timeframe, max(120, lookback // 2), refresh=MARKET_REFRESH)
        ticker = tickers.get(symbol, {})

        if len(primary_candles) < min_data_points or len(confirmation_candles) < 60:
            blocked_count += 1
            publish_decision(
                symbol=symbol,
                action="BLOCK",
                confidence=0.0,
                blocked=True,
                reason="insufficient_market_history",
                payload={
                    "configVersion": config_row.get("version", 0),
                    "primaryTimeframe": primary_timeframe,
                    "confirmationTimeframe": confirmation_timeframe,
                    "requiredPrimaryCandles": min_data_points,
                    "receivedPrimaryCandles": len(primary_candles),
                    "receivedConfirmationCandles": len(confirmation_candles),
                },
            )
            continue

        decision = evaluate_symbol(primary_candles, confirmation_candles, ticker, config, portfolio, symbol)
        if decision["blocked"]:
            blocked_count += 1

        decision_row = publish_decision(
            symbol=symbol,
            action=decision["action"],
            confidence=decision["confidence"],
            blocked=decision["blocked"],
            reason=decision["reason"],
            payload={
                "configVersion": config_row.get("version", 0),
                "mode": trading_mode,
                "primaryTimeframe": primary_timeframe,
                "confirmationTimeframe": confirmation_timeframe,
                "buyScore": decision["buyScore"],
                "sellScore": decision["sellScore"],
                "experts": decision["experts"],
                "features": decision["features"],
                "portfolio": {
                    "equity": portfolio.get("equity", 0),
                    "cashBalance": portfolio.get("cashBalance", 0),
                    "openPositionsCount": portfolio.get("openPositionsCount", 0),
                    "openSymbols": portfolio.get("openSymbols", []),
                    "exposurePct": portfolio.get("exposurePct", 0),
                },
                "ticker": {
                    "price": float(ticker.get("price", 0.0)),
                    "quoteVolume": float(ticker.get("quoteVolume", 0.0)),
                    "tradeCount": float(ticker.get("tradeCount", 0.0)),
                    "priceChangePercent": float(ticker.get("priceChangePercent", 0.0)),
                },
            },
        )

        if trading_enabled and trading_mode == "paper" and not decision["blocked"] and decision["action"] in {"BUY", "SELL"}:
            order = submit_paper_order(
                symbol=symbol,
                side=decision["action"],
                linked_decision_id=decision_row.get("id"),
                reason=decision["reason"],
                payload={
                    "decisionConfidence": decision["confidence"],
                    "buyScore": decision["buyScore"],
                    "sellScore": decision["sellScore"],
                    "experts": decision["experts"],
                },
            )

            if order.get("status") == "FILLED":
                filled_orders += 1
                portfolio = get_portfolio()
            elif order.get("status") == "REJECTED":
                rejected_orders += 1

        processed += 1

    publish_event(
        "worker.loop.completed",
        {
            "configVersion": config_row.get("version", 0),
            "processedSymbols": processed,
            "blockedSymbols": blocked_count,
            "filledOrders": filled_orders,
            "rejectedOrders": rejected_orders,
            "primaryTimeframe": primary_timeframe,
            "portfolioEquity": portfolio.get("equity", 0),
            "openPositionsCount": portfolio.get("openPositionsCount", 0),
        },
    )


def main() -> None:
    while True:
        try:
            loop_once()
        except Exception as error:  # noqa: BLE001
            try:
                send_heartbeat("error", {"message": str(error)})
                publish_event("worker.loop.error", {"message": str(error)})
            except Exception:
                pass
            time.sleep(5)
            continue

        time.sleep(LOOP_INTERVAL_SEC)


if __name__ == "__main__":
    main()
