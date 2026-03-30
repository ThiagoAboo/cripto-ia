# Hotfix de colunas numéricas do paper mode

Este pacote corrige bancos antigos em que colunas financeiras de `paper_accounts`,
`paper_positions`, `paper_orders` e `portfolio_snapshots` ainda ficaram como
`INTEGER`. Isso faz o Postgres rejeitar valores decimais como `610.44` no fluxo
de taxa em BNB.

## Arquivos
- `backend/src/db/schema.js`
- `backend/src/db/paper-numeric-columns-hotfix.sql`
- `backend/src/db/apply-paper-numeric-columns-hotfix.cjs`

## Aplicação recomendada
1. Extraia o ZIP na raiz do projeto e aceite sobrescrever.
2. Reinicie o backend.

## Se o banco já estiver criado e você quiser aplicar imediatamente
### Local
```powershell
cd backend
node .\src\db\apply-paper-numeric-columns-hotfix.cjs
```

### Docker Compose
```powershell
docker compose exec backend node /app/src/db/apply-paper-numeric-columns-hotfix.cjs
```

## O que o hotfix altera
- `paper_accounts`: `starting_balance`, `cash_balance`, `realized_pnl`, `fees_paid`, `last_equity`
- `paper_positions`: `quantity`, `avg_entry_price`, `cost_basis`, `last_price`, `market_value`, `unrealized_pnl`, `realized_pnl`
- `paper_orders`: `requested_notional`, `executed_notional`, `requested_quantity`, `executed_quantity`, `price`, `fee_amount`, `slippage_pct`, `realized_pnl`, `pnl_pct`
- `portfolio_snapshots`: `cash_balance`, `positions_value`, `equity`, `realized_pnl`, `unrealized_pnl`
