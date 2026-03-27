# Integração final do BNB na execução

Este pacote fecha a regra operacional de BNB no modo paper.

## O que entra

- taxa reduzida via BNB quando houver saldo disponível e `useBnbFeeDiscount = true`
- bloqueio de venda de `BNB{baseCurrency}` quando a venda deixar o saldo abaixo de `minBnbReserveQty`
- defaults da configuração em `execution.paper`:
  - `bnbFeePct`
  - `useBnbFeeDiscount`
  - `minBnbReserveQty`
- payload das ordens passa a registrar:
  - `fee.source`
  - `fee.appliedFeePct`
  - `fee.bnbQuantity`
  - `fee.minBnbReserveQty`

## Arquivos sobrescritos

- `backend/src/services/execution.service.js`
- `backend/src/services/portfolio.service.js`
- `backend/src/db/schema.js`

## Arquivos adicionados

- `backend/src/services/binanceFeePolicy.service.js`
- `backend/tests/binanceFeePolicy.service.test.cjs`

## Como validar

```powershell
cd D:\Projetos\cripto-ia\backend
npm test
```

Depois subir a stack e testar no painel/API:

1. garantir `execution.paper.useBnbFeeDiscount = true`
2. definir `execution.paper.minBnbReserveQty`
3. manter uma posição aberta em `BNBUSDT`
4. executar BUY/SELL de outro ativo e conferir no payload da ordem:
   - `payload.fee.source = bnb_discount`
5. tentar vender `BNBUSDT` abaixo da reserva e conferir rejeição:
   - `rejectionReason = bnb_reserve_protection`
