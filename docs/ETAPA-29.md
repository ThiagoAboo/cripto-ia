# Etapa 29 — Backtest avançado e validação robusta

## O que esta etapa entrega

Esta etapa adiciona uma camada de validação sobre a engine de backtest já existente.

### Entregáveis principais
- **Walk-forward operacional** com janelas de treino/contexto e teste/out-of-sample.
- **Robustness sweep** variando símbolo e profundidade de candles.
- **Stability score** entre 0 e 100 para promoção ou rejeição de configuração.
- **Persistência** de validações e segmentos em banco.
- **Novos endpoints** no backend para consumo pelo painel.
- **Helpers de frontend** para integração da UI.
- **Testes automatizados** da service e das rotas.

## Endpoints novos

### `GET /api/backtests/validation/defaults`
Retorna os defaults da etapa.

### `GET /api/backtests/validation-runs?limit=20`
Lista validações persistidas.

### `GET /api/backtests/validation-runs/:id`
Retorna uma validação com seus segmentos.

### `POST /api/backtests/walk-forward`
Executa validação walk-forward.

Exemplo de payload:
```json
{
  "symbol": "BTCUSDT",
  "candleLimit": 700,
  "objective": "balanced",
  "minTrainCandles": 180,
  "minTestCandles": 80,
  "stepCandles": 80,
  "maxWindows": 4
}
```

### `POST /api/backtests/robustness`
Executa varredura de robustez.

Exemplo de payload:
```json
{
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "candleLimits": [240, 360, 480],
  "objective": "balanced"
}
```

## Lógica da etapa

### Walk-forward
A service busca um bloco maior de candles, divide em janelas e reaproveita a engine de backtest usando:
- parte inicial da janela como **warmup/contexto**
- parte final da janela como **período avaliado**

Isso foi possível com a extensão do backtest para aceitar:
- candles injetados externamente
- `evaluationStartIndex`

### Robustez
A robustez executa múltiplos backtests com a mesma configuração em:
- símbolos diferentes
- horizontes de candles diferentes

O objetivo é detectar sensibilidade excessiva e dependência de um único cenário.

## Score de estabilidade

O `stabilityScore` leva em conta:
- dispersão de retorno
- dispersão de drawdown
- dispersão de performance score
- proporção de janelas lucrativas

### Regra sugerida
- `>= 72`: **candidate_for_promotion**
- `58 até 71.99`: **needs_review**
- `< 58`: **reject_for_now**

## O que ainda não fecha sozinho

Esta etapa melhora muito a validação, mas não substitui:
- otimização de hiperparâmetros
- promoção automática em produção
- seleção dinâmica de melhor configuração por símbolo/regime

Esses pontos podem entrar na próxima etapa de governança/backtest promotion.
