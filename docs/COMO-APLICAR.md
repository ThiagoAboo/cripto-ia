# Como aplicar a Etapa 28

## 1. Backend

Copiar para o repositório:

- `backend/src/services/decisionPolicy.service.js`
- `backend/src/routes/decisions.routes.js`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/decisionPolicy.service.test.cjs`
- `backend/tests/decisions.routes.test.cjs`

## 2. Frontend

Copiar para o repositório:

- `frontend/src/lib/decision-preview.js`
- `frontend/src/lib/decision-preview.test.js`

## 3. AI

Copiar para o repositório:

- `ai/decision_policy.py`

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

## 5. Integração posterior recomendada

No próximo passo, o ideal é ligar a política diretamente no worker da AI para que o `effectiveAction` seja o valor realmente usado na execução.
