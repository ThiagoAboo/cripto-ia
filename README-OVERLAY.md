Extraia este ZIP na raiz do projeto e aceite sobrescrever.

Arquivos incluídos:
- frontend/src/components/SidebarNav.jsx
- frontend/src/components/AppShell.jsx
- frontend/src/lib/dashboard-pages.js
- frontend/src/styles.css
- backend/src/routes/system.routes.js

Depois rode:

Backend:
  cd backend
  npm test

Frontend:
  cd ..\frontend
  npm test

Se estiver usando Docker:
  cd ..
  docker compose up --build -d backend frontend

Validações úteis:
  curl.exe -fsS http://localhost:4000/api/system
  curl.exe -fsS http://localhost:4000/api/system/manifest
  curl.exe -fsS http://localhost:4000/api/system/maintenance-checklist
  curl.exe -fsS http://localhost:4000/api/system/contracts/public-api
