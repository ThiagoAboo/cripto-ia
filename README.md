# readme

Documentação funcional do projeto `cripto-ia`, com foco em:

- módulos existentes;
- responsabilidades por serviço;
- principais rotas e funções identificadas;
- estruturas de dados e camadas principais.

> Este arquivo foi feito para servir como README técnico de arquitetura e navegação do código.

---

## 1. Estrutura do repositório

```text
cripto-ia/
├─ ai/
├─ backend/
├─ frontend/
├─ social-worker/
└─ docker-compose.yml
```

### Papéis por pasta

#### `ai/`
Worker principal de decisão de trading.
Responsável por:
- buscar config ativa;
- ler runtime de treinamento;
- consultar mercado;
- consultar portfolio;
- consultar social score;
- avaliar risco/controle;
- publicar decisão;
- enviar ordem paper/execução quando aplicável.

#### `backend/`
API central e orquestrador.
Responsável por:
- persistência em banco;
- exposição REST;
- SSE de status;
- rotas de governança;
- integração com dados de mercado;
- controle de execução;
- backtests;
- optimizer;
- promotions;
- observability;
- training;
- endpoints internos para workers.

#### `frontend/`
Painel de operação e governança.
Responsável por:
- visualizar estado do sistema;
- editar config;
- acompanhar treinamento;
- acionar execuções supervisionadas;
- monitorar observabilidade, alertas, runbooks e incidentes.

#### `social-worker/`
Worker consultivo de sinais sociais.
Responsável por:
- coleta de sinais externos;
- publicação de scores sociais;
- publicação de alertas sociais;
- atualização do status de providers.

---

## 2. Serviços e boot

### `docker-compose.yml`
Serviços existentes:
- `postgres`
- `backend`
- `ai-worker`
- `social-worker`
- `frontend`

Fluxo de dependência:
1. PostgreSQL sobe.
2. Backend sobe e inicializa schema.
3. Workers aguardam backend saudável.
4. Frontend sobe consumindo a API.

---

## 3. Backend

### 3.1 Arquivos principais

#### `backend/src/app.js`
Monta o Express app, middlewares e rotas.

#### `backend/src/server.js`
Faz bootstrap da aplicação:
- inicializa banco;
- sobe servidor HTTP;
- inicia schedulers;
- controla shutdown gracioso.

#### `backend/src/config/env.js`
Centraliza leitura das variáveis de ambiente.

#### `backend/src/db/pool.js`
Conexão com PostgreSQL.

#### `backend/src/db/schema.js`
Cria e mantém o schema inicial do banco.

---

### 3.2 Rotas principais do backend

As rotas abaixo já existem no backend.

#### Saúde e status
- `/api/health`
- `/api/status`
- `/api/status/stream`

#### Configuração
- `/api/config`
- `/api/config/history`
- `/api/config/audit`

#### Mercado
- `/api/market`
- candles
- tickers
- symbols

#### Operação
- `/api/portfolio`
- `/api/portfolio/orders`
- `/api/decisions`
- `/api/control`
- `/api/execution`

#### Pesquisa e estratégia
- `/api/backtests`
- `/api/optimizer`
- `/api/promotions`

#### Governança
- `/api/alerts`
- `/api/readiness`
- `/api/jobs`
- `/api/notifications`
- `/api/policy`
- `/api/observability`
- `/api/runbooks`
- `/api/incidents`

#### Treinamento
- `/api/training`

#### Interno para workers
- `/internal`

---

### 3.3 Rotas de treinamento

Arquivo principal: `backend/src/routes/training.routes.js`

#### Endpoints de leitura
- `GET /api/training/summary`
- `GET /api/training/settings`
- `GET /api/training/regime-presets`
- `GET /api/training/runtime`
- `GET /api/training/logs`
- `GET /api/training/runs`
- `GET /api/training/runs/:id/logs`
- `GET /api/training/quality-reports`
- `GET /api/training/drift-reports`
- `GET /api/training/expert-reports`

#### Endpoints de escrita/ação
- `PUT /api/training/settings`
- `POST /api/training/regime-presets/apply`
- `POST /api/training/runtime/activate-regime`
- `POST /api/training/runtime/sync`
- `POST /api/training/runtime/worker-sync`
- `POST /api/training/run`

#### Observação
O endpoint `POST /api/training/run` já trata o caso de guardrail por qualidade baixa e devolve warning amigável em vez de falha dura, quando o treinamento conclui mas a aplicação automática dos pesos é bloqueada.

---

### 3.4 Serviços principais do backend

#### `scheduler.service.js`
Funções exportadas:
- `startSchedulers`
- `stopSchedulers`
- `runNamedJob`
- `listScheduledJobRuns`

Jobs atualmente tratados:
- `execution_healthcheck`
- `execution_reconciliation`
- `readiness_assessment`
- `alert_scan`
- `observability_snapshot`

#### `trainingAdaptation.service.js`
Funções exportadas:
- `DEFAULT_TRAINING_SETTINGS`
- `getTrainingSettings`
- `updateTrainingSettings`
- `listRegimePresets`
- `applyRegimePreset`

Responsabilidades:
- pesos padrão dos experts;
- presets por regime;
- mistura entre pesos manuais e sugeridos;
- intensidade guiada por qualidade/drift;
- aplicação de preset ao config ativo.

#### `trainingRuntime.service.js`
Funções exportadas:
- `DEFAULT_RUNTIME_STATE`
- `getTrainingRuntimeState`
- `updateTrainingRuntimeState`
- `activateRuntimeRegime`
- `syncRuntimeWithActivePreset`
- `reportWorkerRuntime`

Responsabilidades:
- persistir runtime de treinamento;
- manter peso efetivo em uso;
- acompanhar saúde de sincronização com o worker;
- detectar runtime sem peso efetivo ou worker desatualizado.

#### Outros serviços importantes
- `alerts.service.js`
- `backtest.service.js`
- `binance.service.js`
- `config.service.js`
- `control.service.js`
- `eventBus.service.js`
- `execution.service.js`
- `executionAdapter.service.js`
- `market.service.js`
- `notifications.service.js`
- `observability.service.js`
- `optimizer.service.js`
- `policyGate.service.js`
- `portfolio.service.js`
- `promotion.service.js`
- `readiness.service.js`
- `runbooks.service.js`
- `social.service.js`
- `status.service.js`
- `strategyEngine.service.js`
- `training.service.js`

---

### 3.5 Banco de dados

Arquivo principal: `backend/src/db/schema.js`

Tabelas importantes identificadas:

#### Controle e runtime
- `bot_configs`
- `bot_config_versions`
- `config_change_audit`
- `training_runtime_state`
- `scheduled_job_runs`
- `active_alerts`
- `worker_heartbeats`
- `system_events`
- `symbol_cooldowns`

#### Decisões e execução
- `ai_decisions`
- tabelas ligadas a portfólio/ordens/execução

#### Mercado
- `market_symbols`
- `market_candles`
- `market_tickers`

#### Treinamento
- `training_runs`
- `training_run_logs`
- `expert_evaluation_reports`
- `model_quality_reports`
- `model_drift_reports`

---

## 4. Frontend

### 4.1 Arquivos principais

#### `frontend/src/App.jsx`
Orquestra estado global do painel.
Apesar de já usar páginas, ainda concentra bastante carregamento de dados.

#### `frontend/src/lib/api.js`
Cliente HTTP do frontend.
Concentra chamadas REST para o backend.

#### `frontend/src/lib/dashboard.js`
Defaults do dashboard, traduções e funções utilitárias do painel.

#### `frontend/src/lib/format.js`
Formatadores de número, percentual, moeda, data e listas.

---

### 4.2 Páginas existentes

Páginas identificadas em `frontend/src/pages/`:
- `DashboardPage.jsx`
- `ConfiguracaoPage.jsx`
- `OperacoesPage.jsx`
- `ExecucaoPage.jsx`
- `GovernancaPage.jsx`
- `SocialPage.jsx`
- `TreinamentoPage.jsx`

### 4.3 Componentes existentes

Componentes identificados em `frontend/src/components/`:
- `ConfigField.jsx`
- `Pill.jsx`
- `Section.jsx`
- `SidebarNav.jsx`
- `StatCard.jsx`
- `StatusBadge.jsx`

---

### 4.4 Funções principais do `frontend/src/lib/api.js`

#### Infra
- `getApiBaseUrl`

#### Saúde / status / config
- `fetchHealth`
- `fetchConfig`
- `fetchConfigHistory`
- `fetchConfigAudit`
- `updateConfig`
- `fetchStatus`

#### Portfolio / decisões / social
- `fetchPortfolio`
- `fetchOrders`
- `fetchDecisions`
- `fetchSocialSummary`
- `fetchSocialScores`
- `fetchSocialAlerts`

#### Controle
- `fetchControl`
- `pauseControl`
- `resumeControl`
- `triggerEmergencyStop`
- `fetchCooldowns`
- `clearCooldown`
- `setMaintenanceMode`
- `clearMaintenanceMode`

#### Backtest / optimizer / promotion
- `fetchBacktests`
- `fetchBacktestById`
- `runBacktest`
- `compareBacktests`
- `fetchOptimizations`
- `fetchOptimizationById`
- `runOptimization`
- `fetchPromotions`
- `fetchPromotionRequests`
- `simulatePromotionWinner`
- `requestPromotionApproval`
- `approvePromotionRequest`
- `rejectPromotionRequest`
- `rollbackConfigVersion`
- `promoteOptimizationWinner`

#### Execução
- `fetchExecutionHealthchecks`
- `runExecutionHealthcheck`
- `fetchExecutionReconciliations`
- `runExecutionReconciliation`
- `fetchExecutionActionLogs`
- `previewExecutionOrder`
- `submitLiveOrder`
- `runReadinessCheck`
- `runScheduledJob`

#### Alertas / notificações / policy / observability
- `acknowledgeAlert`
- `resolveAlert`
- `fetchNotificationChannels`
- `fetchNotificationDeliveries`
- `sendTestNotification`
- `fetchPolicyReports`
- `evaluatePromotionPolicy`
- `runObservabilitySnapshot`
- `buildObservabilityExportUrl`

#### Runbooks / incidentes
- `fetchRunbooks`
- `fetchRunbookByKey`
- `fetchIncidentDrills`
- `runIncidentDrill`
- `fetchRecoveryActions`
- `runRecoveryAction`

#### Treinamento
- `fetchTrainingSummary`
- `fetchTrainingSettings`
- `updateTrainingSettings`
- `fetchTrainingRegimePresets`
- `applyTrainingRegimePreset`
- `fetchTrainingRuntime`
- `activateTrainingRuntimeRegime`
- `syncTrainingRuntime`
- `reportTrainingWorkerRuntime`
- `fetchTrainingRuns`
- `fetchTrainingLogs`
- `fetchTrainingRunLogs`
- `fetchTrainingQualityReports`
- `fetchTrainingDriftReports`
- `fetchTrainingExpertReports`
- `runTrainingAssistance`

---

### 4.5 Funções principais do `frontend/src/lib/dashboard.js`

#### Estado e merge
- `DEFAULT_CONFIG`
- `DEFAULT_STATUS`
- `deepClone`
- `deepMerge`
- `mergeConfigWithDefaults`
- `updateAtPath`
- `parseNumberInput`

#### Traduções
- `traduzirModoExecucao`
- `traduzirCanalPromocao`
- `traduzirAcaoDecisao`
- `traduzirClassificacaoSocial`
- `traduzirStatusGenerico`
- `traduzirSeveridade`
- `traduzirNivelDrift`
- `traduzirQualidade`
- `traduzirRegime`
- `traduzirCheckExecucao`
- `traduzirSimNao`
- `traduzirEspecialista`
- `traduzirObjetivo`
- `traduzirChaveJob`
- `traduzirTipoAcaoExecucao`
- `traduzirCanalNotificacao`
- `traduzirRunbook`
- `traduzirGate`
- `traduzirFonte`

### 4.6 Funções principais do `frontend/src/lib/format.js`
- `formatNumber`
- `formatPercent`
- `formatMoney`
- `formatDateTime`
- `formatList`

---

## 5. Worker principal de IA (`ai/main.py`)

### Responsabilidade geral
Loop principal de decisão.

### Funções principais identificadas
- `get_active_config`
- `get_training_runtime`
- `get_candles`
- `get_tickers`
- `get_portfolio`
- `get_social_scores`
- `get_control_state`
- `send_heartbeat`
- `publish_event`
- `publish_decision`
- `submit_paper_order`
- `submit_order`
- `report_training_runtime`
- `sync_position_risk`

### O que esse worker já faz conceitualmente
- lê config ativa do backend;
- lê runtime de treinamento;
- busca dados de mercado;
- consulta portfolio;
- consulta contexto social;
- verifica estado de controle;
- gera decisão;
- publica decisão;
- aciona ordem paper ou execução supervisionada;
- informa runtime do treinamento ao backend.

### Variáveis de ambiente identificadas
- `BACKEND_URL`
- `INTERNAL_API_KEY`
- `WORKER_NAME`
- `LOOP_INTERVAL_SEC`
- `MARKET_REFRESH`
- `REQUEST_TIMEOUT_SEC`
- `BACKEND_WAIT_INTERVAL_SEC`
- `BACKEND_WAIT_MAX_ATTEMPTS`

---

## 6. Worker social (`social-worker/main.py`)

### Responsabilidade geral
Camada consultiva de descoberta e risco social.

### Funções principais identificadas
- `get_active_config`
- `get_market_symbols`
- `get_cached_backend_scores`
- `send_heartbeat`
- `publish_event`
- `publish_scores`
- `publish_alert`
- `publish_provider_status`
- `coingecko_headers`
- `compute_retry_after_from_headers`

### O que esse worker já faz conceitualmente
- lê config ativa;
- busca símbolos de mercado;
- usa cache do backend quando útil;
- publica scores sociais;
- publica alertas sociais;
- informa saúde dos providers;
- usa CoinGecko e sinais relacionados;
- tem leitura de parâmetros ligados a Reddit.

### Variáveis de ambiente identificadas
- `BACKEND_URL`
- `INTERNAL_API_KEY`
- `WORKER_NAME`
- `LOOP_INTERVAL_SEC`
- `REQUEST_TIMEOUT_SEC`
- `BACKEND_WAIT_INTERVAL_SEC`
- `BACKEND_WAIT_MAX_ATTEMPTS`
- `REDDIT_USER_AGENT`
- `COINGECKO_API_BASE`
- `COINGECKO_API_KEY`
- `COINGECKO_ENABLED`
- `COINGECKO_CACHE_FALLBACK_ENABLED`
- `COINGECKO_MIN_RETRY_AFTER_SEC`

---

## 7. Fluxo funcional resumido

### Fluxo normal
1. Backend sobe e inicializa schema.
2. Frontend consome config, status e dados agregados.
3. AI worker consulta backend periodicamente.
4. Social worker consulta fontes externas e publica sinais.
5. Backend persiste eventos, decisões, scores e estados.
6. Painel acompanha tudo por REST + SSE.

### Fluxo de treinamento
1. Painel chama `/api/training/run`.
2. Backend registra `training_runs` e `training_run_logs`.
3. São gerados relatórios:
   - qualidade
   - drift
   - expert evaluation
4. `trainingAdaptation.service` pode sugerir/aplicar presets.
5. `trainingRuntime.service` mantém runtime sincronizado.
6. AI worker reporta runtime ao backend.

### Fluxo de governança
1. Backend gera readiness, alerts e snapshots.
2. Painel acompanha incidentes, runbooks e jobs.
3. Modo paper/testnet/live é controlado por policy e execution.

---

## 8. Problemas estruturais ainda visíveis

Mesmo com a arquitetura já bem avançada, ainda vale registrar:

- `App.jsx` ainda centraliza muita orquestração;
- `ai/main.py` ainda está grande demais;
- `social-worker/main.py` ainda está grande demais;
- o scheduler ainda não mostra um job explícito de recalibração contínua dos experts;
- faltavam testes automatizados no estado analisado.

---

## 9. Recomendação de manutenção do código

### Prioridade alta
- reduzir `App.jsx`;
- modularizar os workers;
- formalizar `.env.example`;
- adicionar testes automatizados;
- criar smoke tests.

### Prioridade média
- fechar aprendizado contínuo real por regime;
- endurecer governança de live;
- criar testes de contrato de rotas.

### Prioridade baixa
- refinamentos visuais e cosméticos do dashboard;
- componentes adicionais de UX.

---

## 10. Conclusão

O projeto já está organizado por domínios e serviços.
O README técnico ideal agora não precisa mais explicar “o que o projeto quer ser”, e sim:

- onde cada responsabilidade mora;
- quais funções e endpoints existem;
- como os serviços conversam;
- onde continuar a evolução com segurança.
