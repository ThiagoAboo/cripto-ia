from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List


@dataclass(frozen=True)
class SocialWeights:
    score_weight: float = 0.46
    momentum_weight: float = 0.24
    sentiment_weight: float = 0.18
    risk_weight: float = 0.38
    spam_weight: float = 0.22
    source_bonus_cap: int = 8


DEFAULT_WEIGHTS = SocialWeights()


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def opportunity_score(asset: Dict, weights: SocialWeights = DEFAULT_WEIGHTS) -> float:
    source_bonus = min(int(asset.get('sourceCount', 0) or 0), weights.source_bonus_cap)
    score = (
        float(asset.get('socialScore', 0) or 0) * weights.score_weight
        + float(asset.get('momentum', 0) or 0) * weights.momentum_weight
        + float(asset.get('sentiment', 0) or 0) * weights.sentiment_weight
        + source_bonus
        - float(asset.get('socialRisk', 0) or 0) * weights.risk_weight
        - float(asset.get('spamRisk', 0) or 0) * weights.spam_weight
    )
    return round(clamp(score, 0.0, 100.0), 2)


def classify_asset(asset: Dict) -> str:
    score = float(asset.get('socialScore', 0) or 0)
    risk = float(asset.get('socialRisk', 0) or 0)
    momentum = float(asset.get('momentum', 0) or 0)
    spam_risk = float(asset.get('spamRisk', 0) or 0)

    if risk >= 80 or spam_risk >= 75:
        return 'ALTO_RISCO'
    if score >= 75 and risk <= 35 and momentum >= 0:
        return 'FORTE'
    if score >= 60 and risk <= 55 and momentum >= 10:
        return 'PROMISSORA'
    return 'NEUTRA'


def rank_assets(items: Iterable[Dict]) -> List[Dict]:
    ranked = []
    for row in items:
      normalized = dict(row)
      normalized['symbol'] = str(row.get('symbol', '')).upper()
      normalized['opportunityScore'] = opportunity_score(row)
      normalized['classification'] = classify_asset(row)
      ranked.append(normalized)

    ranked.sort(key=lambda item: (-item['opportunityScore'], item.get('socialRisk', 0), -item.get('socialScore', 0)))
    for index, item in enumerate(ranked, start=1):
        item['watchlistRank'] = index
    return ranked


def should_emit_alert(asset: Dict) -> bool:
    return classify_asset(asset) == 'ALTO_RISCO' or float(asset.get('spamRisk', 0) or 0) >= 80
