# Integração da política de decisão na AI

## Ponto de entrada sugerido

No `ai/main.py`, aplicar a política após o ensemble consolidar:

- ação sugerida
- confiança base
- regime atual
- pesos efetivos

## Dados mínimos esperados

```python
policy_input = {
    "action": action,
    "confidence": confidence,
    "regime": runtime_context.get("currentRegime", "mixed"),
    "thresholds": {
        "buyThreshold": buy_threshold,
        "sellThreshold": sell_threshold,
    },
    "market": {
        "liquidityUsd": features.get("quote_volume_usd"),
        "spreadPct": features.get("spread_pct"),
        "estimatedSlippagePct": features.get("estimated_slippage_pct"),
    },
    "portfolio": {
        "openRiskPct": portfolio_state.get("openRiskPct"),
        "maxObservedCorrelation": portfolio_state.get("maxObservedCorrelation"),
    },
    "position": {
        "portfolioCorrelation": candidate_position.get("portfolioCorrelation"),
        "projectedOpenRiskPct": candidate_position.get("projectedOpenRiskPct"),
        "hasExistingPosition": candidate_position.get("hasExistingPosition"),
    },
}
```

## Saída útil

A política retorna:

- `effectiveAction`
- `blocked`
- `recommendedSizeFraction`
- `guards`

Esses campos podem alimentar:

- persistência em `ai_decisions.payload`
- painel de explicabilidade
- travas antes da execução real
