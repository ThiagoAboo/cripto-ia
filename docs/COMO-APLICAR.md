# COMO APLICAR

Copie os arquivos deste pacote preservando a estrutura de pastas.

## Backend
- adicionar `backend/src/services/governanceAssessment.service.js`
- substituir:
  - `backend/src/routes/observability.routes.js`
  - `backend/src/routes/alerts.routes.js`
  - `backend/src/services/alerts.service.js`
  - `backend/src/services/scheduler.service.js`
  - `backend/src/db/schema.js`
- adicionar testes em `backend/tests/`

## Frontend
- substituir `frontend/src/lib/api.js`
- adicionar `frontend/src/lib/api.governance.test.js`

## Validação sugerida
### backend
```bash
cd backend
npm test
```

### frontend
```bash
cd frontend
npm test
```
