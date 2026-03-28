# readme-install

Guia prático de infraestrutura, variáveis, instalação e execução do projeto `cripto-ia`.

> Este documento assume o estado atual do repositório analisado.
> Como eu não executei os containers nesta conversa, trate este arquivo como **guia operacional recomendado** para deixar o ambiente reproduzível.

---

## 1. Stack identificada

### Containers e runtimes
- PostgreSQL 16 Alpine
- Backend em Node 22 Alpine
- Frontend em Node 20 Alpine
- AI worker em Python 3.12 slim
- Social worker em Python 3.12 slim

### Serviços do compose
- `postgres`
- `backend`
- `ai-worker`
- `social-worker`
- `frontend`

### Portas padrão
- PostgreSQL: `5432`
- Backend: `4000`
- Frontend: `5173`

---

## 2. Pré-requisitos

### Opção recomendada: Docker
Instalar:
- Docker Engine
- Docker Compose V2

### Opção local sem Docker
Instalar:
- Node.js 22 para backend
- Node.js 20+ para frontend
- Python 3.12 para `ai` e `social-worker`
- PostgreSQL 16

> Se quiser simplificar, use Docker para tudo.

---

## 3. Estrutura esperada de `.env`

O `docker-compose.yml` espera estes arquivos:

- `backend/.env`
- `frontend/.env`
- `ai/.env`
- `social-worker/.env`

Se esses arquivos não existirem, o projeto tende a subir parcialmente ou com valores default insuficientes para operação real.

---

## 4. Exemplo de `backend/.env`

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=*

DB_HOST=postgres
DB_PORT=5432
DB_NAME=criptoia
DB_USER=postgres
DB_PASSWORD=postgres

INTERNAL_API_KEY=troque-esta-chave

BINANCE_API_BASE_URL=https://api.binance.com
MARKET_CACHE_TTL_SEC=20
CANDLE_DEFAULT_LIMIT=300

WORKER_STALE_AFTER_SEC=90
SSE_SNAPSHOT_INTERVAL_SEC=15

SCHEDULER_ENABLED=true
SCHEDULER_HEALTHCHECK_INTERVAL_SEC=300
SCHEDULER_RECONCILIATION_INTERVAL_SEC=900
SCHEDULER_READINESS_INTERVAL_SEC=600
SCHEDULER_ALERT_SCAN_INTERVAL_SEC=120
SCHEDULER_OBSERVABILITY_SNAPSHOT_INTERVAL_SEC=300

EXECUTION_LIVE_ENABLED=false
EXECUTION_DEFAULT_MODE=paper
EXECUTION_HEALTHCHECK_TIMEOUT_MS=12000
EXECUTION_RECONCILIATION_LOOKBACK_HOURS=24
EXECUTION_PREVIEW_TICKET_TTL_SEC=600
EXECUTION_READINESS_FRESHNESS_MINUTES=30

BINANCE_TRADE_API_BASE_URL=https://api.binance.com
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_RECV_WINDOW=5000
BINANCE_TESTNET=true
BINANCE_DRY_RUN=true

POLICY_REQUIRE_READINESS_FOR_PROMOTION=true
POLICY_REQUIRE_NO_CRITICAL_ALERTS=true
POLICY_REQUIRE_NO_MAINTENANCE_FOR_PROMOTION=true
POLICY_REQUIRE_TESTNET_FOR_LIVE_CANDIDATE=true
POLICY_REQUIRE_DRY_RUN_FOR_LIVE_CANDIDATE=true
POLICY_REQUIRE_EXPLICIT_CONFIRMATION_FOR_LIVE_CANDIDATE=true

OBSERVABILITY_METRICS_RETENTION_DAYS=30
OBSERVABILITY_EXPORT_MAX_ROWS=5000

NOTIFICATIONS_ENABLED=false
NOTIFICATIONS_MIN_SEVERITY=high

NOTIFY_WEBHOOK_ENABLED=false
NOTIFY_WEBHOOK_URL=
NOTIFY_WEBHOOK_TIMEOUT_MS=8000

NOTIFY_TELEGRAM_ENABLED=false
NOTIFY_TELEGRAM_BOT_TOKEN=
NOTIFY_TELEGRAM_CHAT_ID=
NOTIFY_TELEGRAM_SILENT=true

NOTIFY_EMAIL_ENABLED=false
NOTIFY_EMAIL_FROM=
NOTIFY_EMAIL_TO=
```

---

## 5. Exemplo de `frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:4000
```

Se estiver rodando pelo compose e acessando do navegador da sua máquina, normalmente `http://localhost:4000` é o mais simples.

---

## 6. Exemplo de `ai/.env`

```env
BACKEND_URL=http://backend:4000
INTERNAL_API_KEY=troque-esta-chave
WORKER_NAME=ai-trading-worker

LOOP_INTERVAL_SEC=15
MARKET_REFRESH=false
REQUEST_TIMEOUT_SEC=20
BACKEND_WAIT_INTERVAL_SEC=5
BACKEND_WAIT_MAX_ATTEMPTS=0
```

---

## 7. Exemplo de `social-worker/.env`

```env
BACKEND_URL=http://backend:4000
INTERNAL_API_KEY=troque-esta-chave
WORKER_NAME=social-worker

LOOP_INTERVAL_SEC=600
REQUEST_TIMEOUT_SEC=20
BACKEND_WAIT_INTERVAL_SEC=5
BACKEND_WAIT_MAX_ATTEMPTS=0

REDDIT_USER_AGENT=cripto-ia-social-worker/1.0

COINGECKO_API_BASE=https://api.coingecko.com/api/v3
COINGECKO_API_KEY=
COINGECKO_ENABLED=true
COINGECKO_CACHE_FALLBACK_ENABLED=true
COINGECKO_MIN_RETRY_AFTER_SEC=900
```

---

## 8. Subida com Docker Compose

Na raiz do projeto:

```bash
docker compose up --build
```

Para rodar em background:

```bash
docker compose up --build -d
```

Para derrubar:

```bash
docker compose down
```

Para derrubar também o volume do banco:

```bash
docker compose down -v
```

---

## 9. Verificações após subir

### 9.1 Health do backend
```bash
curl http://localhost:4000/api/health
```

### 9.2 Status consolidado
```bash
curl http://localhost:4000/api/status
```

### 9.3 Frontend
Abrir no navegador:

```text
http://localhost:5173
```

### 9.4 SSE do painel
Verificar no DevTools do navegador se `GET /api/status/stream` conecta sem erro.

---

## 10. Ordem de boot esperada

1. `postgres` fica saudável.
2. `backend` sobe e inicializa schema.
3. `ai-worker` espera backend saudável e começa loop.
4. `social-worker` espera backend saudável e começa loop.
5. `frontend` sobe e consulta API.

Se algo falhar, normalmente os primeiros pontos para checar são:
- `.env` ausente;
- `INTERNAL_API_KEY` inconsistente entre backend e workers;
- banco inacessível;
- erro de CORS;
- endpoint do frontend apontando para URL errada.

---

## 11. Execução local sem Docker

### 11.1 Banco
Suba um PostgreSQL 16 local.
Crie um banco chamado `criptoia`.

### 11.2 Backend
```bash
cd backend
npm install
npm start
```

### 11.3 Frontend
```bash
cd frontend
npm install
npm run dev
```

### 11.4 AI worker
```bash
cd ai
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### 11.5 Social worker
```bash
cd social-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

---

## 12. Instalação das dependências

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

### AI
```bash
cd ai
pip install -r requirements.txt
```

### Social worker
```bash
cd social-worker
pip install -r requirements.txt
```

---

## 13. Scripts de teste sugeridos

Como a base analisada não tinha scripts de teste no `package.json`, segue a sugestão de scripts para adicionar.

### `backend/package.json`
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/**/*.test.cjs"
  }
}
```

### `frontend/package.json`
```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173",
    "test": "node --test src/**/*.test.js"
  }
}
```

Ou usar os scripts shell que acompanham este pacote de entrega:
- `scripts/test-backend.sh`
- `scripts/test-frontend.sh`
- `scripts/test-all.sh`

---

## 14. Smoke test manual mínimo

Depois do ambiente subir, verificar manualmente:

### Backend
- `/api/health`
- `/api/status`
- `/api/config`
- `/api/training/summary`
- `/api/social/summary`

### Workers
- tabela `worker_heartbeats` atualizando;
- algum `system_event` sendo gerado;
- `recentJobRuns` aparecendo no status;
- `recentDecisions` e `social` preenchendo com o tempo.

### Frontend
- dashboard abre sem tela branca;
- SSE conecta;
- páginas laterais funcionam;
- salvar config funciona;
- páginas de treinamento/governança carregam sem erro.

---

## 15. Problemas comuns e correções

### Frontend não conecta ao backend
Verifique:
- `VITE_API_BASE_URL`
- porta 4000 aberta
- CORS do backend

### Worker não autentica nos endpoints internos
Verifique:
- `INTERNAL_API_KEY` igual em todos os serviços

### Backend sobe mas o status vem incompleto
Verifique:
- workers realmente rodando
- banco criado corretamente
- compose com healthchecks passando

### Social worker não traz dados
Verifique:
- internet do host/container
- CoinGecko habilitado
- limite/rate limit do provider
- `COINGECKO_API_KEY` se aplicável

### Execução live não funciona
Verifique:
- `EXECUTION_LIVE_ENABLED`
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `BINANCE_TESTNET`
- `BINANCE_DRY_RUN`
- readiness e policy gates

---

## 16. Recomendação final de instalação

Se seu objetivo imediato é estabilidade, eu recomendo esta ordem:

1. Criar os quatro `.env`.
2. Subir com `docker compose up --build`.
3. Validar `/api/health` e `/api/status`.
4. Abrir o painel.
5. Rodar os testes unitários.
6. Rodar smoke test manual.
7. Só depois habilitar integrações reais/testnet.

---

## 17. Próximo passo recomendado após instalar

Depois do ambiente rodar, faça este pacote mínimo de endurecimento:

- salvar `.env.example` no repositório;
- adicionar scripts de teste no `package.json`;
- adicionar smoke script HTTP;
- documentar troubleshooting no README principal.
