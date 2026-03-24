import json
import os
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:4000").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "troque-esta-chave")
WORKER_NAME = os.getenv("WORKER_NAME", "social-worker")
LOOP_INTERVAL_SEC = int(os.getenv("LOOP_INTERVAL_SEC", "600"))
REQUEST_TIMEOUT_SEC = int(os.getenv("REQUEST_TIMEOUT_SEC", "20"))
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "cripto-ia-social-worker/1.0")
COINGECKO_API_BASE = os.getenv("COINGECKO_API_BASE", "https://api.coingecko.com/api/v3").rstrip("/")
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGECKO_ENABLED = os.getenv("COINGECKO_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
COINGECKO_CACHE_FALLBACK_ENABLED = os.getenv("COINGECKO_CACHE_FALLBACK_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
COINGECKO_MIN_RETRY_AFTER_SEC = int(os.getenv("COINGECKO_MIN_RETRY_AFTER_SEC", "900"))

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "x-internal-api-key": INTERNAL_API_KEY,
})

coingecko_retry_after: Optional[datetime] = None


@dataclass
class ProviderError(Exception):
    provider_key: str
    message: str
    http_status: Optional[int] = None
    retry_after_at: Optional[datetime] = None

    def __str__(self) -> str:
        return self.message


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


def get_cached_backend_scores(limit: int = 100) -> List[Dict[str, Any]]:
    response = requests.get(
        f"{BACKEND_URL}/api/social/scores",
        params={"limit": limit},
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


def publish_provider_status(provider_key: str, provider_name: str, status: str, payload: Dict[str, Any], http_status: Optional[int] = None, retry_after_at: Optional[datetime] = None, mode: str = "free") -> None:
    response = session.post(
        f"{BACKEND_URL}/internal/social/providers/status",
        data=json.dumps({
            "providerKey": provider_key,
            "providerName": provider_name,
            "status": status,
            "mode": mode,
            "lastHttpStatus": http_status,
            "retryAfterAt": retry_after_at.isoformat() if retry_after_at else None,
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


def compute_retry_after_from_headers(response: requests.Response) -> datetime:
    retry_after = response.headers.get("Retry-After")
    seconds = COINGECKO_MIN_RETRY_AFTER_SEC
    if retry_after:
        try:
            seconds = max(int(retry_after), COINGECKO_MIN_RETRY_AFTER_SEC)
        except ValueError:
            seconds = COINGECKO_MIN_RETRY_AFTER_SEC
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def fetch_coingecko_trending() -> List[Dict[str, Any]]:
    global coingecko_retry_after

    if not COINGECKO_ENABLED:
        raise ProviderError("coingecko", "coingecko_disabled")

    if coingecko_retry_after and datetime.now(timezone.utc) < coingecko_retry_after:
        raise ProviderError(
            "coingecko",
            "coingecko_backoff_active",
            retry_after_at=coingecko_retry_after,
        )

    response = requests.get(
        f"{COINGECKO_API_BASE}/search/trending",
        headers=coingecko_headers(),
        timeout=REQUEST_TIMEOUT_SEC,
    )

    if response.status_code in {401, 403, 429}:
        retry_after_at = compute_retry_after_from_headers(response)
        coingecko_retry_after = retry_after_at
        raise ProviderError(
            "coingecko",
            f"coingecko_http_{response.status_code}",
            http_status=response.status_code,
            retry_after_at=retry_after_at,
        )

    response.raise_for_status()
    coingecko_retry_after = None
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


def map_cached_scores_for_symbols(cached_items: List[Dict[str, Any]], market_symbols: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    allowed_symbols = {item["symbol"] for item in market_symbols}
    output = []
    for item in cached_items:
        symbol = str(item.get("symbol", "")).upper()
        if symbol not in allowed_symbols:
            continue
        notes = [note for note in list(item.get("notes") or []) if note != "Fallback do último score salvo localmente"]
        notes.append("Fallback do último score salvo localmente")
        output.append({
            "symbol": symbol,
            "socialScore": float(item.get("socialScore", 0.0) or 0.0),
            "socialRisk": float(item.get("socialRisk", 0.0) or 0.0),
            "classification": item.get("classification", "NEUTRA"),
            "sentiment": float(item.get("sentiment", 0.0) or 0.0),
            "momentum": float(item.get("momentum", 0.0) or 0.0),
            "spamRisk": float(item.get("spamRisk", 0.0) or 0.0),
            "sourceCount": int(item.get("sourceCount", 0) or 0),
            "sources": list(item.get("sources") or []),
            "notes": notes,
            "raw": {
                **(item.get("raw") or {}),
                "fallback": True,
                "fallbackSource": "backend_cached_social_scores",
            },
        })
    return output


def build_social_scores(config: Dict[str, Any], market_symbols: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    social_cfg = config.get("social", {})
    reddit_cfg = social_cfg.get("reddit", {})
    strong_threshold = float(social_cfg.get("strongScoreThreshold", 72))
    promising_threshold = float(social_cfg.get("promisingScoreThreshold", 58))

    symbol_lookup = build_symbol_lookup(market_symbols)
    scores: Dict[str, Dict[str, Any]] = {}
    provider_meta: Dict[str, Any] = {
        "coingecko": {
            "status": "disabled",
            "fallbackUsed": False,
            "items": 0,
        }
    }

    if COINGECKO_ENABLED and "coingecko" in social_cfg.get("sources", ["coingecko"]):
        try:
            coingecko_items = fetch_coingecko_trending()
            provider_meta["coingecko"] = {
                "status": "ok",
                "fallbackUsed": False,
                "items": len(coingecko_items),
            }
            publish_provider_status(
                "coingecko",
                "CoinGecko Demo",
                "ok",
                {
                    "items": len(coingecko_items),
                    "cacheWindowMinutes": 10,
                    "attributionRequired": True,
                },
                mode="demo",
            )

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
                    "notes": [f"CoinGecko trending rank #{item['rank']}"],
                    "raw": {"coingecko": item},
                }
        except ProviderError as provider_error:
            cached_items = get_cached_backend_scores(limit=max(len(market_symbols), 50)) if COINGECKO_CACHE_FALLBACK_ENABLED else []
            fallback_items = map_cached_scores_for_symbols(cached_items, market_symbols)
            if fallback_items:
                provider_meta["coingecko"] = {
                    "status": "degraded",
                    "fallbackUsed": True,
                    "items": len(fallback_items),
                    "reason": str(provider_error),
                }
                publish_provider_status(
                    "coingecko",
                    "CoinGecko Demo",
                    "degraded",
                    {
                        "fallbackUsed": True,
                        "fallbackItems": len(fallback_items),
                        "message": str(provider_error),
                    },
                    http_status=provider_error.http_status,
                    retry_after_at=provider_error.retry_after_at,
                    mode="demo",
                )
                for item in fallback_items:
                    scores[item["symbol"]] = item
            else:
                provider_meta["coingecko"] = {
                    "status": "error",
                    "fallbackUsed": False,
                    "items": 0,
                    "reason": str(provider_error),
                }
                publish_provider_status(
                    "coingecko",
                    "CoinGecko Demo",
                    "error",
                    {
                        "fallbackUsed": False,
                        "message": str(provider_error),
                    },
                    http_status=provider_error.http_status,
                    retry_after_at=provider_error.retry_after_at,
                    mode="demo",
                )

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
    return items, provider_meta


def loop_once() -> None:
    config_row = get_active_config()
    config = config_row.get("config", {})
    social_cfg = config.get("social", {})
    quote_asset = config.get("market", {}).get("symbolsQuoteAsset", "USDT")
    market_symbols = get_market_symbols(quote_asset)
    scores, provider_meta = build_social_scores(config, market_symbols)

    if scores:
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
            "providers": provider_meta,
        },
    )

    publish_event(
        "social.scan.completed",
        {
            "scoresPublished": len(scores),
            "alertsPublished": alerts_sent,
            "sources": social_cfg.get("sources", []),
            "providers": provider_meta,
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
                publish_provider_status(
                    "coingecko",
                    "CoinGecko Demo",
                    "error",
                    {"message": message},
                    mode="demo",
                )
                publish_event("social.scan.failed", {"message": message})
            except Exception as nested_error:  # noqa: BLE001
                print(f"[{WORKER_NAME}] failed to publish error state: {nested_error}")
        time.sleep(LOOP_INTERVAL_SEC)


if __name__ == "__main__":
    main()
