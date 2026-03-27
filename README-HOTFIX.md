# HOTFIX runtime + frontend

Este overlay foi montado em cima do estado atual do GitHub e corrige dois blocos:

## Frontend
- `frontend/src/lib/render-safe.js`
  - remove JSX de um arquivo `.js`
  - usa `React.createElement(...)` para evitar erro do Vite/esbuild
  - blinda a renderização de objetos como `{ drift, experts, quality }`
- sincroniza também:
  - `frontend/src/main.jsx`
  - `frontend/src/components/StatCard.jsx`
  - `frontend/src/pages/DashboardPage.jsx`

## Backend
- `backend/src/db/schema.js`
  - serializa o bootstrap com `pg_advisory_lock`
  - cria:
    - `operational_runbooks`
    - `incident_drills`
    - `recovery_actions`
    - `testnet_supervision_reports`
- `backend/src/services/runbooks.service.js`
  - evita corrida no `ensureRunbookTables`
  - serializa criação/seed das tabelas de runbooks

## Como aplicar no Docker

Extraia este ZIP na raiz do projeto e aceite sobrescrever.

Depois rode:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d backend frontend
docker compose logs -f backend frontend
```

Para validar:

```powershell
curl.exe -fsS http://localhost:4000/api/health
curl.exe -fsS http://localhost:4000/api/system
```

No navegador:
- faça `Ctrl + F5`
- confira se o painel abre
- confira se o console parou de mostrar erro de `render-safe.js`

## Observação
Se o banco já estiver em um estado inconsistente e você quiser limpar tudo:

```powershell
cd D:\Projetos\cripto-ia
docker compose down -v --remove-orphans
docker compose up --build -d
```
