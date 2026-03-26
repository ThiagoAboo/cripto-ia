# Etapa 31 — maturidade do social worker

## Objetivo

Tornar o módulo social realmente útil para descoberta de ativos e proteção contra risco social, sem transformar o social em gatilho principal de compra e venda.

## O que entra nesta etapa

- ranking mais forte de moedas em watchlist;
- radar de risco social separado da watchlist de oportunidade;
- leitura de narrativas sociais por grupo (`emerging`, `cooling`, `stable-strong`, `high-risk`);
- health da pipeline social com base no estado dos providers;
- helper Python isolado para a lógica de score/classificação no worker social;
- testes unitários backend, frontend e Python.

## Arquivos do pacote

### Backend

- `backend/src/services/socialIntelligence.service.js`
- `backend/src/routes/social.routes.js`
- `backend/tests/socialIntelligence.service.test.cjs`

### Frontend

- `frontend/src/lib/social-intelligence.js`
- `frontend/src/lib/social-intelligence.test.js`

### Social worker

- `social-worker/social_model.py`
- `social-worker/tests/test_social_model.py`

## Novos endpoints

### `GET /api/social/policy/defaults`
Retorna a policy padrão usada para ranking e filtros.

### `GET /api/social/watchlist`
Retorna a watchlist pronta para painel, com:

- `watchlistRank`
- `opportunityScore`
- `narrativeState`
- `confidenceBand`
- `discoveryLabel`
- contagem de alertas por símbolo

Filtros suportados:

- `classification`
- `minScore`
- `maxRisk`
- `discoveryLabel`
- `confidenceBand`
- `limit`

### `GET /api/social/risk-radar`
Retorna apenas os ativos mais críticos do ponto de vista social.

### `GET /api/social/narratives`
Agrupa os ativos por estado de narrativa para facilitar leitura do painel.

### `GET /api/social/pipeline-health`
Consolida health da pipeline social a partir dos providers + resumo social.

## Regra de negócio mantida

O social continua:

- sugerindo moedas fortes/promissoras;
- elevando ou reduzindo confiança de contexto;
- sinalizando risco social alto.

O social **não** passa a decidir compra e venda sozinho.

## Resultado esperado

- melhor descoberta de ativos;
- leitura mais clara de risco social;
- painel social com informação mais acionável;
- base pronta para futura integração visual na página `SocialPage`.
