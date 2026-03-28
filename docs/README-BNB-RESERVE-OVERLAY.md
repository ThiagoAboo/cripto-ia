# Hotfix BNB reserve

Este ZIP já vem no formato overlay.

## Como aplicar
1. Extraia o ZIP na raiz do projeto.
2. Aceite sobrescrever `backend/src/services/execution.service.js`.
3. Reinicie o backend.

## O que muda
- SELL de `BNBUSDT` passa a respeitar automaticamente a reserva mínima de BNB.
- Quando a venda automática vier acima do máximo permitido, a quantidade é limitada para `saldo atual - reserva`.
- O bloqueio `bnb_reserve_protection` só continua quando realmente não houver saldo vendável acima da reserva.
- O payload de rejeição passa a informar:
  - `attemptedSellQuantity`
  - `adjustedSellQuantity`
  - `maxSellableQuantity`
  - `reserveQty`
