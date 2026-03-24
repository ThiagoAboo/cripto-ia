import json
import os
import re
import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Tuple

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:4000").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "troque-esta-chave")
WORKER_NAME = os.getenv("WORKER_NAME", "social-worker")
LOOP_INTERVAL_SEC = int(os.getenv("LOOP_INTERVAL_SEC", "600"))
REQUEST_TIMEOUT_SEC = int(os.getenv("REQUEST_TIMEOUT_SEC", "20"))
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "cripto-ia-social-worker/1.0")
COINGECKO_API_BASE = os.getenv("COINGECKO_API_BASE", "https://api.coingecko.com/api/v3").rstrip("/")
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "x-internal-api-key": INTERNAL_API_KEY,
})


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def get_active_config() -> Dict[str, Any]:
    response = requests.get(f"{BACKEND_URL}/api/config", timeout=REQUEST_TIMEOUT_SEC)
    response.raise_for_status()
    return response.json()


def get_market_symbols(quote_asset: str) -> List[Dict[str, Any]]:
    response = requests.get(
        f"{BACKEND_URL}/api/market/symbols",
        params={"quoteAsset": quote_asset},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    return response.json().get("items", [])


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


def publish_scores(items: List[Dict[str, Any]]) -> None:
    response = session.post(
        f"{BACKEND_URL}/internal/social/scores",
        data=json.dumps({"items": items}),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()


def publish_alert(symbol: str, alert_type: str, severity: str, action: str, message: str, payload: Dict[str, Any]) -> None:
    response = session.post(
        f"{BACKEND_URL}/internal/social/alerts",
        data=json.dumps({
            "symbol": symbol,
            "alertType": alert_type,
            "severity": severity,
            "action": action,
            "message": message,
            "payload": payload,
        }),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()


def coingecko_headers() -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY
    return headers


def fetch_coingecko_trending() -> List[Dict[str, Any]]:
    response = requests.get(
        f"{COINGECKO_API_BASE}/search/trending",
        headers=coingecko_headers(),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    items = payload.get("coins", [])
    output = []
    for index, wrapper in enumerate(items, start=1):
        item = wrapper.get("item", {})
        output.append({
            "rank": index,
            "id": item.get("id"),
            "name": item.get("name"),
            "symbol": str(item.get("symbol", "")).upper(),
            "score": max(0.0, 100 - ((index - 1) * 6)),
            "marketCapRank": item.get("market_cap_rank") or 9999,
            "priceBtc": item.get("price_btc") or 0,
        })
    return output


def fetch_reddit_mentions(subreddits: List[str], limit_per_subreddit: int) -> Tuple[Counter, Dict[str, List[str]]]:
    mentions = Counter()
    notes: Dict[str, List[str]] = defaultdict(list)

    for subreddit in subreddits:
        try:
            response = requests.get(
                f"https://www.reddit.com/r/{subreddit}/hot.json",
                params={"limit": limit_per_subreddit},
                headers={"User-Agent": REDDIT_USER_AGENT},
                timeout=REQUEST_TIMEOUT_SEC,
            )
            if response.status_code != 200:
                continue
            payload = response.json()
            for child in payload.get("data", {}).get("children", []):
                data = child.get("data", {})
                text = f"{data.get('title', '')} {data.get('selftext', '')}".upper()
                notes[subreddit].append(data.get("title", ""))
                for token in set(re.findall(r"\b[A-Z0-9]{2,15}\b", text)):
                    mentions[token] += 1
        except Exception:
            continue

    return mentions, notes


def build_symbol_lookup(market_symbols: List[Dict[str, Any]]) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for item in market_symbols:
        symbol = item["symbol"]
        base_asset = item.get("baseAsset", "")
        if base_asset:
            lookup[base_asset.upper()] = symbol
        stripped = symbol.replace(item.get("quoteAsset", ""), "")
        if stripped:
            lookup[stripped.upper()] = symbol
    return lookup


def classify_score(score: float, risk: float, strong_threshold: float, promising_threshold: float) -> str:
    if risk >= 85:
        return "ALTO_RISCO"
    if score >= strong_threshold:
        return "FORTE"
    if score >= promising_threshold:
        return "PROMISSORA"
    return "NEUTRA"


def build_social_scores(config: Dict[str, Any], market_symbols: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    social_cfg = config.get("social", {})
    reddit_cfg = social_cfg.get("reddit", {})
    strong_threshold = float(social_cfg.get("strongScoreThreshold", 72))
    promising_threshold = float(social_cfg.get("promisingScoreThreshold", 58))

    symbol_lookup = build_symbol_lookup(market_symbols)
    scores: Dict[str, Dict[str, Any]] = {}

    coingecko_items = []
    if "coingecko" in social_cfg.get("sources", ["coingecko"]):
        coingecko_items = fetch_coingecko_trending()
        for item in coingecko_items:
            mapped_symbol = symbol_lookup.get(item["symbol"])
            if not mapped_symbol:
                continue
            market_cap_rank = int(item.get("marketCapRank") or 9999)
            sentiment = clamp(0.65 - min(market_cap_rank, 200) / 500, -1.0, 1.0)
            momentum = clamp(item["score"] / 100, 0.0, 1.0)
            spam_risk = clamp((1 / max(market_cap_rank, 1)) * 15, 0.0, 35.0)
            risk = clamp(35 - sentiment * 20 + spam_risk, 0.0, 100.0)
            score = clamp(item["score"] + sentiment * 10 - spam_risk * 0.3, 0.0, 100.0)
            scores[mapped_symbol] = {
                "symbol": mapped_symbol,
                "socialScore": round(score, 4),
                "socialRisk": round(risk, 4),
                "sentiment": round(sentiment, 4),
                "momentum": round(momentum, 4),
                "spamRisk": round(spam_risk, 4),
                "sourceCount": 1,
                "sources": ["coingecko"],
                "notes": [f"CoinGecko trending rank #{item['rank']}"] ,
                "raw": {"coingecko": item},
            }

    if reddit_cfg.get("enabled") and "reddit" in social_cfg.get("sources", []):
        mentions, reddit_notes = fetch_reddit_mentions(
            reddit_cfg.get("subreddits", ["CryptoCurrency"]),
            int(reddit_cfg.get("limitPerSubreddit", 25)),
        )
        for token, count in mentions.items():
            mapped_symbol = symbol_lookup.get(token)
            if not mapped_symbol:
                continue

            entry = scores.setdefault(mapped_symbol, {
                "symbol": mapped_symbol,
                "socialScore": 35.0,
                "socialRisk": 40.0,
                "sentiment": 0.0,
                "momentum": 0.0,
                "spamRisk": 10.0,
                "sourceCount": 0,
                "sources": [],
                "notes": [],
                "raw": {},
            })

            mention_boost = min(count * 4, 28)
            spam_risk = clamp(max(0.0, count - 8) * 4, 0.0, 65.0)
            entry["socialScore"] = clamp(entry["socialScore"] + mention_boost, 0.0, 100.0)
            entry["momentum"] = clamp(entry["momentum"] + min(count / 20, 0.35), 0.0, 1.0)
            entry["spamRisk"] = clamp(max(entry["spamRisk"], spam_risk), 0.0, 100.0)
            entry["socialRisk"] = clamp(entry["socialRisk"] + max(0.0, spam_risk - 20) * 0.6, 0.0, 100.0)
            entry["sourceCount"] += 1
            if "reddit" not in entry["sources"]:
                entry["sources"].append("reddit")
            entry["notes"].append(f"{count} menções em Reddit monitorado")
            entry["raw"]["reddit"] = {
                "mentions": count,
                "samples": {sub: titles[:3] for sub, titles in reddit_notes.items()},
            }

    items = []
    for symbol, entry in scores.items():
        entry["classification"] = classify_score(
            float(entry["socialScore"]),
            float(entry["socialRisk"]),
            strong_threshold,
            promising_threshold,
        )
        items.append(entry)

    items.sort(key=lambda item: (item["socialScore"], -item["socialRisk"]), reverse=True)
    return items


def loop_once() -> None:
    config_row = get_active_config()
    config = config_row.get("config", {})
    social_cfg = config.get("social", {})
    quote_asset = config.get("market", {}).get("symbolsQuoteAsset", "USDT")
    market_symbols = get_market_symbols(quote_asset)
    scores = build_social_scores(config, market_symbols)

    publish_scores(scores)

    extreme_threshold = float(social_cfg.get("extremeRiskThreshold", 85))
    alerts_sent = 0
    for item in scores:
        if float(item["socialRisk"]) >= extreme_threshold:
            publish_alert(
                item["symbol"],
                "SOCIAL_RISK_ALERT",
                "high",
                "block_new_entries",
                "risco social extremo detectado",
                item,
            )
            alerts_sent += 1

    send_heartbeat(
        "running",
        {
            "configVersion": config_row.get("version", 0),
            "scoresPublished": len(scores),
            "alertsPublished": alerts_sent,
            "sources": social_cfg.get("sources", []),
        },
    )

    publish_event(
        "social.scan.completed",
        {
            "scoresPublished": len(scores),
            "alertsPublished": alerts_sent,
            "sources": social_cfg.get("sources", []),
        },
    )


def main() -> None:
    publish_event("worker.started", {"workerName": WORKER_NAME})

    while True:
        try:
            loop_once()
        except Exception as error:  # noqa: BLE001
            message = str(error)
            print(f"[{WORKER_NAME}] loop failed: {message}")
            try:
                send_heartbeat("error", {"message": message})
                publish_event("social.scan.failed", {"message": message})
            except Exception as nested_error:  # noqa: BLE001
                print(f"[{WORKER_NAME}] failed to publish error state: {nested_error}")
        time.sleep(LOOP_INTERVAL_SEC)


if __name__ == "__main__":
    main()
