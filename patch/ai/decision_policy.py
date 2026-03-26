from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any, List

DEFAULT_REGIME_POLICIES: Dict[str, Dict[str, float | bool]] = {
    "trend_bull": {
        "buyThresholdAdjustment": -0.04,
        "sellThresholdAdjustment": 0.03,
        "confidenceMultiplier": 1.08,
        "maxSizeMultiplier": 1.20,
        "allowAveragingUp": True,
    },
    "trend_bear": {
        "buyThresholdAdjustment": 0.07,
        "sellThresholdAdjustment": -0.02,
        "confidenceMultiplier": 0.88,
        "maxSizeMultiplier": 0.55,
        "allowAveragingUp": False,
    },
    "range": {
        "buyThresholdAdjustment": 0.02,
        "sellThresholdAdjustment": 0.02,
        "confidenceMultiplier": 0.94,
        "maxSizeMultiplier": 0.80,
        "allowAveragingUp": False,
    },
    "mixed": {
        "buyThresholdAdjustment": 0.0,
        "sellThresholdAdjustment": 0.0,
        "confidenceMultiplier": 1.0,
        "maxSizeMultiplier": 1.0,
        "allowAveragingUp": False,
    },
}

DEFAULT_GUARDRAILS: Dict[str, float] = {
    "minLiquidityUsd": 150000.0,
    "maxSpreadPct": 0.35,
    "maxEstimatedSlippagePct": 0.45,
    "maxPortfolioCorrelation": 0.82,
    "maxOpenRiskPct": 0.60,
    "hardBlockMinConfidence": 0.52,
    "warnCorrelationAbove": 0.70,
}


def _to_number(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _round(value: float, digits: int = 4) -> float:
    return round(_to_number(value, 0.0), digits)


def normalize_regime(regime: Any) -> str:
    normalized = str(regime or "mixed").strip().lower()
    return normalized if normalized in DEFAULT_REGIME_POLICIES else "mixed"


def normalize_action(action: Any) -> str:
    normalized = str(action or "HOLD").strip().upper()
    return normalized if normalized in {"BUY", "SELL", "HOLD"} else "HOLD"


@dataclass
class Guard:
    name: str
    status: str
    message: str | None = None
    observed: float | None = None
    threshold: float | None = None
    penalty: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "observed": self.observed,
            "threshold": self.threshold,
            "penalty": self.penalty,
        }


def _evaluate_market_guards(market: Dict[str, Any], guardrails: Dict[str, float]) -> List[Guard]:
    liquidity = _to_number(market.get("liquidityUsd", market.get("quoteVolumeUsd", 0.0)))
    spread = _to_number(market.get("spreadPct", 0.0))
    slippage = _to_number(market.get("estimatedSlippagePct", spread * 1.25))
    guards: List[Guard] = []

    if liquidity < guardrails["minLiquidityUsd"]:
        guards.append(Guard("liquidity", "block", "Liquidez abaixo do mínimo.", _round(liquidity, 2), guardrails["minLiquidityUsd"], 0.24))
    elif liquidity < guardrails["minLiquidityUsd"] * 1.35:
        guards.append(Guard("liquidity", "warn", "Liquidez apenas marginalmente confortável.", _round(liquidity, 2), guardrails["minLiquidityUsd"], 0.07))
    else:
        guards.append(Guard("liquidity", "pass", observed=_round(liquidity, 2), threshold=guardrails["minLiquidityUsd"], penalty=0.0))

    if spread > guardrails["maxSpreadPct"]:
        guards.append(Guard("spread", "block", "Spread acima do máximo permitido.", _round(spread), guardrails["maxSpreadPct"], 0.18))
    elif spread > guardrails["maxSpreadPct"] * 0.8:
        guards.append(Guard("spread", "warn", "Spread alto para execução eficiente.", _round(spread), guardrails["maxSpreadPct"], 0.05))
    else:
        guards.append(Guard("spread", "pass", observed=_round(spread), threshold=guardrails["maxSpreadPct"], penalty=0.0))

    if slippage > guardrails["maxEstimatedSlippagePct"]:
        guards.append(Guard("slippage", "block", "Slippage acima do limite.", _round(slippage), guardrails["maxEstimatedSlippagePct"], 0.22))
    elif slippage > guardrails["maxEstimatedSlippagePct"] * 0.8:
        guards.append(Guard("slippage", "warn", "Slippage elevado.", _round(slippage), guardrails["maxEstimatedSlippagePct"], 0.06))
    else:
        guards.append(Guard("slippage", "pass", observed=_round(slippage), threshold=guardrails["maxEstimatedSlippagePct"], penalty=0.0))

    return guards


def _evaluate_portfolio_guards(portfolio: Dict[str, Any], position: Dict[str, Any], action: str, regime_policy: Dict[str, Any], guardrails: Dict[str, float]) -> List[Guard]:
    correlation = _to_number(position.get("portfolioCorrelation", portfolio.get("maxObservedCorrelation", 0.0)))
    open_risk = _to_number(position.get("projectedOpenRiskPct", portfolio.get("openRiskPct", 0.0)))
    has_existing_position = bool(position.get("hasExistingPosition"))
    guards: List[Guard] = []

    if correlation > guardrails["maxPortfolioCorrelation"]:
        guards.append(Guard("correlation", "block", "Correlação acima do limite.", _round(correlation), guardrails["maxPortfolioCorrelation"], 0.18))
    elif correlation > guardrails["warnCorrelationAbove"]:
        guards.append(Guard("correlation", "warn", "Correlação elevada; reduzir tamanho.", _round(correlation), guardrails["warnCorrelationAbove"], 0.07))
    else:
        guards.append(Guard("correlation", "pass", observed=_round(correlation), threshold=guardrails["warnCorrelationAbove"], penalty=0.0))

    if open_risk > guardrails["maxOpenRiskPct"]:
        guards.append(Guard("portfolio_risk", "block", "Exposição projetada acima do limite.", _round(open_risk), guardrails["maxOpenRiskPct"], 0.25))
    elif open_risk > guardrails["maxOpenRiskPct"] * 0.85:
        guards.append(Guard("portfolio_risk", "warn", "Exposição total elevada.", _round(open_risk), guardrails["maxOpenRiskPct"], 0.08))
    else:
        guards.append(Guard("portfolio_risk", "pass", observed=_round(open_risk), threshold=guardrails["maxOpenRiskPct"], penalty=0.0))

    if has_existing_position and not regime_policy.get("allowAveragingUp") and action == "BUY":
        guards.append(Guard("position_expansion", "warn", "Regime atual desestimula ampliar posição comprada.", 1.0, 0.0, 0.05))
    else:
        guards.append(Guard("position_expansion", "pass", observed=1.0 if has_existing_position else 0.0, threshold=0.0, penalty=0.0))

    return guards


def harden_decision(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = normalize_action(payload.get("action"))
    regime = normalize_regime(payload.get("regime"))
    regime_policy = DEFAULT_REGIME_POLICIES[regime]
    guardrails = {**DEFAULT_GUARDRAILS, **(payload.get("guardrails") or {})}
    thresholds_input = payload.get("thresholds") or {}
    buy_threshold = _clamp(_to_number(thresholds_input.get("buyThreshold", 0.64)) + _to_number(regime_policy["buyThresholdAdjustment"]), 0.3, 0.95)
    sell_threshold = _clamp(_to_number(thresholds_input.get("sellThreshold", 0.60)) + _to_number(regime_policy["sellThresholdAdjustment"]), 0.3, 0.95)
    base_confidence = _clamp(_to_number(payload.get("confidence", 0.0)), 0.0, 1.0)
    adjusted_confidence = _clamp(base_confidence * _to_number(regime_policy["confidenceMultiplier"], 1.0), 0.0, 1.0)

    guards = _evaluate_market_guards(payload.get("market") or {}, guardrails)
    guards.extend(_evaluate_portfolio_guards(payload.get("portfolio") or {}, payload.get("position") or {}, action, regime_policy, guardrails))

    has_block = any(item.status == "block" for item in guards)
    penalty = sum(item.penalty for item in guards)
    confidence_component = _clamp((adjusted_confidence - 0.45) / 0.55, 0.1, 1.0)
    size_multiplier = _round(_clamp(confidence_component * _to_number(regime_policy["maxSizeMultiplier"], 1.0) - penalty, 0.0, _to_number(regime_policy["maxSizeMultiplier"], 1.0)))

    effective_action = action
    if has_block or adjusted_confidence < guardrails["hardBlockMinConfidence"]:
        effective_action = "HOLD"
    elif action == "BUY" and adjusted_confidence < buy_threshold:
        effective_action = "HOLD"
    elif action == "SELL" and adjusted_confidence < sell_threshold:
        effective_action = "HOLD"

    if effective_action == "HOLD":
        size_multiplier = 0.0

    return {
        "requestedAction": action,
        "effectiveAction": effective_action,
        "blocked": effective_action == "HOLD" and action != "HOLD",
        "regime": regime,
        "baseConfidence": _round(base_confidence),
        "adjustedConfidence": _round(adjusted_confidence),
        "thresholds": {
            "buyThreshold": _round(buy_threshold),
            "sellThreshold": _round(sell_threshold),
        },
        "recommendedSizeFraction": size_multiplier,
        "guards": [item.to_dict() for item in guards],
        "guardrails": guardrails,
    }
