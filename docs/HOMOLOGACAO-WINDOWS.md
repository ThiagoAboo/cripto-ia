# Homologação local — Windows + VS Code + PowerShell

Este guia reúne os comandos e passos para:

- limpar/resetar o ambiente local;
- subir a stack Docker;
- executar testes automatizados;
- validar a API;
- validar manualmente o painel;
- testar controles operacionais.

> Ambiente considerado: **Windows + VS Code + PowerShell + Docker Desktop**

---

## 1. Pré-requisitos

Antes de começar, confirme que você tem instalado e funcionando:

- **VS Code**
- **Docker Desktop**
- **Node.js**
- **Git for Windows**
- **Python 3** (se quiser rodar também os testes Python)

Na raiz do projeto:

```powershell
cd D:\Projetos\cripto-ia
```

---

## 2. Limpeza / reset completo do ambiente

Esse procedimento apaga o banco local da aplicação, incluindo:

- trades em modo simulação;
- ordens;
- histórico operacional;
- relatórios;
- dados persistidos do Postgres da stack local.

### 2.1 Derrubar containers e apagar volumes

```powershell
docker compose down -v --remove-orphans
```

### 2.2 Subir tudo novamente com base limpa

```powershell
docker compose up --build -d
docker compose ps
```

### 2.3 Conferir volumes, se quiser validar

```powershell
docker volume ls
docker volume ls | findstr postgres_data
```

Se quiser remover manualmente um volume específico:

```powershell
docker volume rm NOME_DO_VOLUME
```

### 2.4 Limpeza opcional do navegador

Para evitar estado antigo no frontend:

1. abra `http://localhost:5173`
2. pressione `F12`
3. vá em **Application**
4. limpe:
   - **Local Storage**
   - **Session Storage**

---

## 3. Instalação de dependências

### Backend

```powershell
cd D:\Projetos\cripto-ia\backend
npm install
cd ..
```

### Frontend

```powershell
cd D:\Projetos\cripto-ia\frontend
npm install
cd ..
```

### Python (opcional, para testes Python)

```powershell
cd D:\Projetos\cripto-ia\ai
pip install -r requirements.txt
cd ..

cd D:\Projetos\cripto-ia\social-worker
pip install -r requirements.txt
cd ..
```

---

## 4. Subir a stack local

Com o **Docker Desktop** aberto:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d
docker compose ps
```

### Logs por serviço

```powershell
docker compose logs -f backend
docker compose logs -f ai-worker
docker compose logs -f social-worker
docker compose logs -f frontend
```

### Todos os logs juntos

```powershell
docker compose logs -f
```

---

## 5. Testes automatizados

### 5.1 Backend

```powershell
cd D:\Projetos\cripto-ia\backend
npm test
cd ..
```

### 5.2 Frontend

```powershell
cd D:\Projetos\cripto-ia\frontend
npm test
cd ..
```

### 5.3 Python (opcional)

```powershell
cd D:\Projetos\cripto-ia\ai
python -m pytest
cd ..

cd D:\Projetos\cripto-ia\social-worker
python -m pytest
cd ..
```

### 5.4 Scripts PowerShell do projeto

Se os scripts já estiverem extraídos na raiz do projeto:

```powershell
cd D:\Projetos\cripto-ia
.\scripts\diagnostico-testes.ps1
.\scripts\test-backend.ps1
.\scripts\test-frontend.ps1
.\scripts\test-all.ps1
```

---

## 6. Validação rápida da API

Use `curl.exe` no PowerShell:

```powershell
curl.exe -fsS http://localhost:4000/api/health
curl.exe -fsS http://localhost:4000/api/status
curl.exe -fsS http://localhost:4000/api/training/summary
curl.exe -fsS http://localhost:4000/api/social/summary
curl.exe -fsS http://localhost:4000/api/observability
```

Se a rota de sistema estiver montada no backend:

```powershell
curl.exe -fsS http://localhost:4000/api/system
```

### Critério esperado

- respostas sem erro 500;
- backend respondendo normalmente;
- stack ativa no `docker compose ps`.

---

## 7. Validação manual do painel

Abra no navegador:

- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:4000`

### 7.1 Dashboard

Validar se:

- cards carregam;
- status aparece;
- alertas aparecem;
- decisões aparecem;
- social aparece;
- jobs aparecem.

### 7.2 Treinamento

Na tela **Treinamento**, clicar em:

1. **Rodar treinamento assistido**
2. **Salvar guardrails**
3. **Sincronizar runtime**
4. **Salvar preset**
5. **Ativar no runtime**

Validar se:

- não aparece erro vermelho;
- regime muda;
- runtime sincroniza;
- logs/runs aparecem.

### 7.3 Operações

Na tela **Operações**, clicar em:

1. **Rodar backtest**
2. **Comparar configuração**

Validar se:

- o backtest executa;
- aparecem resultados;
- entram runs novos.

### 7.4 Social

Validar se:

- o resumo social carrega;
- ranking carrega;
- providers carregam;
- não há erro 500.

### 7.5 Governança

Validar se:

- readiness aparece;
- alertas aparecem;
- incidentes aparecem;
- status geral aparece.

---

## 8. Teste dos controles operacionais por API

### 8.1 Pause

```powershell
curl.exe -X POST http://localhost:4000/api/control/pause `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"reason\":\"homologacao_pause\"}"
```

### 8.2 Resume

```powershell
curl.exe -X POST http://localhost:4000/api/control/resume `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"metadata\":{\"source\":\"homologacao\"}}"
```

### 8.3 Maintenance on

```powershell
curl.exe -X POST http://localhost:4000/api/control/maintenance/on `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"reason\":\"homologacao_maintenance\",\"scope\":\"system\"}"
```

### 8.4 Maintenance off

```powershell
curl.exe -X POST http://localhost:4000/api/control/maintenance/off `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"metadata\":{\"source\":\"homologacao\"}}"
```

### 8.5 Emergency stop

> Rode só no final da validação.

```powershell
curl.exe -X POST http://localhost:4000/api/control/emergency-stop `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"reason\":\"homologacao_emergency_stop\"}"
```

Depois disso, valide o estado do sistema e só então faça `resume`, se aplicável.

---

## 9. Sequência recomendada de homologação

Use esta ordem:

### 9.1 Resetar tudo

```powershell
cd D:\Projetos\cripto-ia
docker compose down -v --remove-orphans
docker compose up --build -d
docker compose ps
```

### 9.2 Rodar testes

```powershell
cd D:\Projetos\cripto-ia\backend
npm test
cd ..

cd D:\Projetos\cripto-ia\frontend
npm test
cd ..
```

### 9.3 Validar APIs

```powershell
curl.exe -fsS http://localhost:4000/api/health
curl.exe -fsS http://localhost:4000/api/status
curl.exe -fsS http://localhost:4000/api/training/summary
curl.exe -fsS http://localhost:4000/api/social/summary
curl.exe -fsS http://localhost:4000/api/observability
```

### 9.4 Abrir o painel

Acesse:

- `http://localhost:5173`

E valide:

- Dashboard
- Treinamento
- Operações
- Social
- Governança

### 9.5 Testar controles

```powershell
curl.exe -X POST http://localhost:4000/api/control/pause `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"reason\":\"homologacao_pause\"}"

curl.exe -X POST http://localhost:4000/api/control/resume `
  -H "Content-Type: application/json" `
  -H "x-user-name: homologacao" `
  -d "{\"metadata\":{\"source\":\"homologacao\"}}"
```

---

## 10. Critério de homologação concluída

Considere a homologação aprovada quando:

- `docker compose ps` mostrar a stack ativa;
- backend responder sem erro;
- frontend abrir normalmente;
- testes backend passarem;
- testes frontend passarem;
- treinamento funcionar no painel;
- backtest funcionar no painel;
- social carregar;
- governança carregar;
- pause/resume funcionarem;
- não houver erro 500 novo nos logs.

---

## 11. Comando resumido mais importante

Se quiser um reset completo seguido de subida:

```powershell
cd D:\Projetos\cripto-ia
docker compose down -v --remove-orphans
docker compose up --build -d
docker compose ps
```

