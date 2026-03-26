# Etapa 28 — endurecimento do motor de decisão

## Objetivo

Adicionar uma camada determinística e testável de governança da decisão para:

- ajustar thresholds por regime
- reduzir ou bloquear entradas com liquidez ruim
- reduzir ou bloquear entradas com spread alto
- reduzir ou bloquear entradas com slippage estimado alto
- reduzir tamanho em correlação elevada de carteira
- reduzir entradas quando o risco agregado do portfólio já estiver alto
- expor um endpoint de preview para o painel simular decisões antes da execução

## Arquivos incluídos

### Backend

- `backend/src/services/decisionPolicy.service.js`
- `backend/src/routes/decisions.routes.js`
- `backend/tests/decisionPolicy.service.test.cjs`
- `backend/tests/decisions.routes.test.cjs`
- `backend/tests/helpers/load-with-mocks.cjs`

### Frontend

- `frontend/src/lib/decision-preview.js`
- `frontend/src/lib/decision-preview.test.js`

### AI

- `ai/decision_policy.py`

## O que entra nesta etapa

### 1. Regras por regime

- `trend_bull`: permite ser um pouco mais agressivo
- `trend_bear`: endurece entrada compradora e corta tamanho
- `range`: mantém postura conservadora
- `mixed`: neutro

### 2. Guardrails de mercado

- liquidez mínima em USD
- spread máximo permitido
- slippage estimado máximo

### 3. Guardrails de portfólio

- correlação máxima da nova posição com a carteira
- risco total máximo já aberto
- aviso para expansão de posição em regime que não favorece aumento

### 4. Resultado final da política

A função principal retorna:

- `requestedAction`
- `effectiveAction`
- `blocked`
- `baseConfidence`
- `adjustedConfidence`
- `thresholds`
- `recommendedSizeFraction`
- `guards`
- `explanation`

## Como integrar

### Backend

Substituir o arquivo de rota `backend/src/routes/decisions.routes.js` pelo arquivo deste pacote.

Isso preserva:

- `GET /api/decisions`

E adiciona:

- `GET /api/decisions/policy/defaults`
- `POST /api/decisions/preview`

### AI

Importar `ai/decision_policy.py` no loop principal e aplicar a política depois do ensemble e antes de enviar a decisão para persistência ou execução.

Fluxo sugerido:

1. experts calculam ação e confiança base
2. runtime informa regime atual
3. calcular inputs de mercado: liquidez, spread, slippage
4. calcular inputs de carteira: correlação e open risk
5. passar tudo para `harden_decision(...)`
6. persistir tanto a ação original quanto a ação endurecida

## Valor prático

Essa etapa não substitui o ensemble; ela cria uma camada de governança para evitar entradas boas no papel, mas ruins na execução real.
