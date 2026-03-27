# Overlay — subtítulos do frontend + política de fee com BNB

## O que entra neste pacote

### Frontend
- textos do shell e do menu lateral mais explicativos
- hints das páginas mais coerentes com a função de cada área
- `ConfiguracaoPage` com campos para:
  - taxa padrão Binance
  - taxa com BNB
  - reserva mínima de BNB
  - toggle de uso do desconto via BNB
- `TreinamentoPage` com subtítulos reescritos para explicar melhor o que cada bloco faz

### Backend
- service nova `binanceFeePolicy.service.js` com lógica pura para:
  - escolher taxa padrão vs taxa com BNB
  - bloquear venda de BNB abaixo da reserva mínima
- teste unitário dessa service

## Observação importante

A lógica da taxa em paper hoje ainda é calculada diretamente dentro de `backend/src/services/execution.service.js`.
No repositório visível, o cálculo usa `settings.feePct / 100` e depois reaplica isso no fluxo de BUY e SELL.
Este pacote **prepara** a policy do BNB em uma service isolada, mas **não sobrescreve** `execution.service.js`, porque esse arquivo é grande e o overlay foi mantido cirúrgico para evitar regressão desnecessária.

## Próxima integração recomendada

Dentro de `executePaperOrder`:
1. localizar a posição `BNBUSDT` aberta no mesmo `accountKey`
2. usar `resolveAppliedFeePct(...)` antes de calcular `feeRate`
3. quando `normalizedSymbol === 'BNBUSDT'` e `normalizedSide === 'SELL'`, chamar `evaluateBnbSellGuard(...)`
4. se bloquear, retornar ordem rejeitada com `rejectionReason = 'bnb_reserve_protection'`
5. registrar em `payload.feeSource` se a taxa aplicada foi `standard` ou `bnb_discount`

## Como aplicar

Extraia o ZIP na raiz do projeto e aceite sobrescrever.
