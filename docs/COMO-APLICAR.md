# Como aplicar a Etapa 32

## 1. Backend

Adicionar/substituir no repositório:

- adicionar `backend/src/services/liveGovernance.service.js`
- substituir `backend/src/routes/control.routes.js`
- substituir `backend/src/services/scheduler.service.js`
- adicionar `backend/src/db/migrations/032_live_governance.sql`
- adicionar testes em `backend/tests/`

## 2. Banco

Executar a migration:

```bash
psql "$DATABASE_URL" -f backend/src/db/migrations/032_live_governance.sql
```

## 3. Frontend

Adicionar:

- `frontend/src/lib/live-governance.js`
- `frontend/src/lib/live-governance.test.js`

## 4. Rodar testes

### Backend
```bash
cd backend
node --test tests/*.test.cjs
```

### Frontend
```bash
cd frontend
node --test src/lib/*.test.js
```

## 5. Validação operacional sugerida

1. criar pedido `testnet`
2. aprovar e ativar `testnet`
3. executar `/api/control/live/supervision/run`
4. corrigir alertas/readiness
5. criar pedido `live`
6. aprovar com dois usuários distintos
7. ativar com `CONFIRMAR_LIVE`
8. testar rollback via `/api/control/live/rollback`
