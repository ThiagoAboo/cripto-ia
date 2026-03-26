# Como aplicar a Etapa 33

## 1. Backend
Copie:
- `backend/src/services/systemManifest.service.js`
- `backend/src/routes/system.routes.js`
- `backend/src/contracts/public-api.contract.json`

E registre a rota em `backend/src/app.js`:

```js
const systemRoutes = require('./routes/system.routes');
app.use('/api/system', systemRoutes);
```

## 2. Frontend
Copie:
- `frontend/src/lib/contracts.js`
- `frontend/src/lib/system-manifest.js`

Use estes helpers em páginas de governança, observabilidade ou dashboard técnico.

## 3. AI e Social Worker
Copie as pastas:
- `ai/app/`
- `social-worker/app/`

Elas não substituem o runtime atual. Elas servem como **landing zone** para migrar funções de `main.py` aos poucos.

## 4. Testes
Backend:
```bash
node --test backend/tests/systemManifest.service.test.cjs backend/tests/system.routes.test.cjs
```

Frontend:
```bash
node --test frontend/src/lib/contracts.test.js frontend/src/lib/system-manifest.test.js
```

Python:
```bash
python -m unittest ai.tests.test_runtime_state ai.tests.test_service_manifest social-worker.tests.test_runtime_state social-worker.tests.test_service_manifest
```

## 5. Auditoria de manutenção
```bash
bash scripts/maintenance-audit.sh .
```
