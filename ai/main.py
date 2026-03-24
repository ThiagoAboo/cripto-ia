import json
import os
import random
import time
from typing import Any, Dict

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "troque-esta-chave")
WORKER_NAME = os.getenv("WORKER_NAME", "ai-trading-worker")
LOOP_INTERVAL_SEC = int(os.getenv("LOOP_INTERVAL_SEC", "15"))

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "x-internal-api-key": INTERNAL_API_KEY,
})


def get_active_config() -> Dict[str, Any]:
    response = requests.get(f"{BACKEND_URL}/api/config", timeout=10)
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
        timeout=10,
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
        timeout=10,
    )
    response.raise_for_status()


def publish_decision(symbol: str, action: str, confidence: float, blocked: bool, reason: str, payload: Dict[str, Any]) -> None:
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
        timeout=10,
    )
    response.raise_for_status()


def simulate_domain_scores(symbol: str) -> Dict[str, float]:
    random.seed(f"{symbol}:{int(time.time() / LOOP_INTERVAL_SEC)}")
    return {
        "trend": round(random.uniform(0.45, 0.85), 4),
        "momentum": round(random.uniform(0.40, 0.80), 4),
        "volatility": round(random.uniform(0.20, 0.75), 4),
        "liquidity": round(random.uniform(0.55, 0.95), 4),
        "risk": round(random.uniform(0.10, 0.55), 4),
    }


def decide_from_scores(scores: Dict[str, float], buy_threshold: float, sell_threshold: float) -> Dict[str, Any]:
    composite_buy = (
        scores["trend"] * 0.30
        + scores["momentum"] * 0.25
        + scores["liquidity"] * 0.20
        + (1 - scores["volatility"]) * 0.10
        + (1 - scores["risk"]) * 0.15
    )
    composite_sell = (
        scores["risk"] * 0.35
        + scores["volatility"] * 0.20
        + (1 - scores["trend"]) * 0.20
        + (1 - scores["momentum"]) * 0.15
        + (1 - scores["liquidity"]) * 0.10
    )

    if composite_sell >= sell_threshold:
        return {"action": "SELL", "confidence": round(composite_sell, 4), "blocked": False, "reason": "risk_or_reversal_signal"}

    if composite_buy >= buy_threshold:
        return {"action": "BUY", "confidence": round(composite_buy, 4), "blocked": False, "reason": "multi_domain_alignment"}

    return {"action": "HOLD", "confidence": round(max(composite_buy, composite_sell), 4), "blocked": False, "reason": "insufficient_confidence"}


def loop_once() -> None:
    config_row = get_active_config()
    config = config_row.get("config", {})

    symbols = config.get("trading", {}).get("symbols", [])
    buy_threshold = float(config.get("ai", {}).get("minConfidenceToBuy", 0.62))
    sell_threshold = float(config.get("ai", {}).get("minConfidenceToSell", 0.55))

    send_heartbeat(
        "running",
        {
            "configVersion": config_row.get("version", 0),
            "symbols": symbols,
            "loopIntervalSec": LOOP_INTERVAL_SEC,
        },
    )

    publish_event(
        "worker.loop.started",
        {
            "configVersion": config_row.get("version", 0),
            "symbolsCount": len(symbols),
        },
    )

    for symbol in symbols:
        scores = simulate_domain_scores(symbol)
        decision = decide_from_scores(scores, buy_threshold, sell_threshold)

        publish_decision(
            symbol=symbol,
            action=decision["action"],
            confidence=decision["confidence"],
            blocked=decision["blocked"],
            reason=decision["reason"],
            payload={
                "scores": scores,
                "mode": config.get("trading", {}).get("mode", "paper"),
                "timeframe": config.get("trading", {}).get("timeframe", "5m"),
                "configVersion": config_row.get("version", 0),
            },
        )


def main() -> None:
    while True:
        try:
            loop_once()
        except Exception as error:  # noqa: BLE001
            try:
                send_heartbeat("error", {"message": str(error)})
            except Exception:
                pass
            time.sleep(5)
            continue

        time.sleep(LOOP_INTERVAL_SEC)


if __name__ == "__main__":
    main()
