# Ajuste de dashboard, taxas e ordens

## Arquivos incluídos
- `backend/src/services/execution.service.js`
- `backend/src/services/portfolio.service.js`
- `frontend/src/pages/DashboardPage.jsx`

## O que foi ajustado
- `Ordens recentes` deixa de mostrar `Preço: 0,00` e `PnL: 0,00` em ordens sem execução.
- Quando a ordem for rejeitada ou não tiver execução financeira, o card mostra a quantidade/notional solicitado, ou uma mensagem neutra.
- O backend passa a tentar cobrar a taxa em `BNB` quando houver saldo suficiente para pagar a taxa descontada.
- Quando a taxa for cobrada em `BNB`, o saldo da posição `BNB{baseCurrency}` é reduzido.
- Quando a taxa for cobrada em `BNB`, o `cash_balance` não é usado para pagar a fee.
- O PnL de venda passa a considerar o custo econômico da taxa mesmo quando ela for cobrada em `BNB`.
- O resumo de carteira passa a expor `feesPaidBnb` para o dashboard.

## Observações
- O total de `Taxas BNB` no dashboard será confiável para as novas ordens gravadas com este ajuste.
- Ordens antigas que não tinham `payload.fee.bnbAmount` podem continuar fora desse acumulado histórico.
