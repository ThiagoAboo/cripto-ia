# Ajuste de ordens rejeitadas no dashboard

## Objetivo
Manter a exibição de `Preço` e `PnL` em **Ordens recentes** sem remover essas informações, gravando contexto financeiro também nas ordens rejeitadas quando houver preço de mercado e projeção de resultado.

## O que foi ajustado

### Backend
Arquivo: `backend/src/services/execution.service.js`

- `createRejectedOrder(...)` agora aceita:
  - `price`
  - `feeAmount`
  - `realizedPnl`
  - `pnlPct`
  - `executedNotional`
  - `executedQuantity`
- Em rejeições de venda com contexto calculável, o backend grava também `payload.executionPreview` com:
  - `quantity`
  - `price`
  - `grossProceeds`
  - `costBasis`
  - `feeAmount`
  - `feeCurrency`
  - `feeSource`
  - `feeBnbAmount`
  - `realizedPnl`
  - `pnlPct`

### Frontend
Arquivo: `frontend/src/pages/DashboardPage.jsx`

- O bloco **Ordens recentes** passa a usar os valores reais da ordem quando existirem.
- Para ordens rejeitadas, quando houver `payload.executionPreview`, o dashboard usa esse preview como fallback para exibir `Preço` e `PnL` corretamente.

## Observação
Este ajuste melhora o registro e a exibição das **novas ordens** geradas após a atualização.
Ordens antigas que já foram gravadas zeradas no banco não serão recalculadas retroativamente.
