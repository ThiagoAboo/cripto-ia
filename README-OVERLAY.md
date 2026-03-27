# Pente-fino visual — fase 4

Pacote overlay para extrair na raiz do projeto.

## O que entra

- `frontend/src/main.jsx`
  - importa `styles.phase4.css` depois do `styles.css`
- `frontend/src/styles.phase4.css`
  - refinamentos visuais de tabelas, listas, estados vazios e densidade
- `frontend/src/pages/DashboardPage.jsx`
  - dashboard reorganizado para fase 4
  - exibição separada de taxas em moeda base e em BNB

## Observação sobre `/api/system`

No estado atual do GitHub, o backend já monta `/api/system` em `app.js` e `system.routes.js` já possui `router.get('/')`.
Se no seu ambiente local ainda aparecer 404 em `GET /api/system`, reconstrua o backend:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d backend
```

Depois valide:

```powershell
curl.exe -fsS http://localhost:4000/api/system
curl.exe -fsS http://localhost:4000/api/system/manifest
```

## Como aplicar

1. Extraia o ZIP na raiz do projeto.
2. Aceite sobrescrever.
3. Reinicie o frontend:

```powershell
cd D:\Projetos\cripto-ia\frontend
npm run dev
```
