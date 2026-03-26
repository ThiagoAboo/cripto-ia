# roadmap

Diagnóstico do repositório `cripto-ia` com foco em deixar o projeto funcional, sustentável e pronto para evolução.

> Base de análise: arquitetura atual do repositório, rotas expostas, workers, esquema de banco, runtime de treinamento e painel já modularizado em páginas.
> Este documento separa o que já existe no código, o que precisa de ajuste e o que ainda bloqueia a afirmação de “100% funcional”.

---

## 1. Visão executiva

O projeto já passou da fase de protótipo simples.
Hoje ele já tem:

- backend Node/Express com rotas amplas por domínio;
- frontend React/Vite já separado por páginas;
- worker principal de IA independente;
- worker social independente;
- banco PostgreSQL e schema rico;
- treinamento, runtime e adaptação de regime já iniciados.

O que ainda falta não é “construir tudo do zero”, e sim:

1. fechar o ciclo de validação ponta a ponta;
2. endurecer a automação do aprendizado contínuo;
3. reduzir acoplamentos e arquivos grandes;
4. implantar testes automatizados;
5. formalizar operação, instalação e manutenção.

---

## 2. Já pronto

### 2.1 Arquitetura base
- Repositório dividido em `ai`, `backend`, `frontend` e `social-worker`.
- `docker-compose.yml` já sobe `postgres`, `backend`, `ai-worker`, `social-worker` e `frontend`.
- Healthcheck entre serviços já foi incluído no compose.

### 2.2 Backend por domínio
- O backend já expõe rotas para:
  - health
  - config
  - status
  - market
  - portfolio
  - decisions
  - social
  - execution
  - control
  - backtests
  - optimizer
  - promotions
  - alerts
  - readiness
  - jobs
  - notifications
  - policy
  - observability
  - runbooks
  - incidents
  - training
  - internal
- O backend já sobe banco e schedulers no boot.

### 2.3 Frontend mais organizado
- O dashboard deixou de ser totalmente monolítico.
- Já existem páginas separadas para:
  - Dashboard
  - Configuração
  - Operações
  - Execução
  - Governança
  - Social
  - Treinamento
- Já existe navegação lateral e agrupamento por domínio.

### 2.4 Workers independentes
- A IA já trabalha como processo independente do frontend.
- O social-worker também já é independente.
- Os workers usam heartbeat e eventos internos.

### 2.5 Base de dados rica
O schema já contempla várias áreas críticas:

- `worker_heartbeats`
- `system_events`
- `ai_decisions`
- `market_symbols`
- `market_candles`
- `market_tickers`
- `scheduled_job_runs`
- `active_alerts`
- `training_runtime_state`
- `training_runs`
- `training_run_logs`
- `expert_evaluation_reports`
- `model_quality_reports`
- `model_drift_reports`

### 2.6 Treinamento e runtime
- Já existem endpoints para:
  - resumo do treinamento
  - settings
  - regime-presets
  - runtime
  - logs
  - runs
  - quality-reports
  - drift-reports
  - expert-reports
  - execução de run assistida
- Já existe serviço de adaptação com:
  - pesos padrão
  - presets por regime
  - intensidade por qualidade/drift
  - aplicação de preset por regime
- Já existe runtime persistido em `training_runtime_state`.

### 2.7 Operação e governança
- Já existem readiness checks.
- Já existem alertas ativos.
- Já existem jobs agendados.
- Já existem observability snapshots.
- Já existem runbooks e incidentes.
- Já existe base para live/testnet supervisionado.

---

## 3. Precisa ajuste

### 3.1 Frontend ainda centralizado demais
**Situação atual**
- O frontend já foi quebrado em páginas, mas o `App.jsx` ainda concentra orquestração demais.
- Ele segue carregando um volume muito grande de dados em uma única camada principal.

**Risco**
- manutenção difícil;
- maior chance de regressão;
- re-render excessivo;
- lógica de tela ainda espalhada em um ponto só.

**Ação sugerida**
- extrair hooks por domínio:
  - `useDashboardData`
  - `useConfigData`
  - `useTrainingData`
  - `useExecutionData`
  - `useGovernanceData`
- mover forms e actions para componentes container por página.

### 3.2 Workers grandes demais
**Situação atual**
- `ai/main.py` está grande e concentra regras demais.
- `social-worker/main.py` também está grande.

**Risco**
- difícil testar;
- difícil depurar;
- difícil evoluir sem quebrar;
- baixa separação entre cliente HTTP, cálculo, decisão, logging e loop.

**Ação sugerida**
Separar por módulos internos:

#### AI
- `client_backend.py`
- `features.py`
- `experts.py`
- `regime.py`
- `risk.py`
- `decision.py`
- `runtime_sync.py`
- `loop.py`

#### Social
- `providers/coingecko.py`
- `providers/reddit.py`
- `scoring.py`
- `alerts.py`
- `publisher.py`
- `loop.py`

### 3.3 Scheduler ainda não fecha aprendizado contínuo real
**Situação atual**
O scheduler já roda:
- `execution_healthcheck`
- `execution_reconciliation`
- `readiness_assessment`
- `alert_scan`
- `observability_snapshot`

Mas ainda não há, de forma explícita no scheduler atual, um job dedicado a:
- recalibração periódica de experts;
- avaliação automática por regime;
- despromoção de expert degradado;
- sincronização automática de peso recomendado → runtime.

**Ação sugerida**
Adicionar jobs novos:
- `training_quality_assistance`
- `training_regime_recalibration`
- `training_runtime_sync`
- `training_expert_decay_review`

### 3.4 Falta endurecer documentação operacional
**Situação atual**
- README raiz ainda está curto para o nível atual do projeto.

**Ação sugerida**
Documentar:
- infra mínima;
- `.env` por serviço;
- sequência de boot;
- smoke tests;
- troubleshooting;
- fluxo de promoção/configuração;
- fluxos do modo paper/testnet/live.

### 3.5 Testes automatizados ainda não estavam presentes
**Situação atual**
- não havia scripts de teste definidos nos `package.json` analisados.

**Ação sugerida**
- incluir suíte mínima com runner nativo do Node;
- começar por libs puras do frontend e serviços com mocks no backend;
- adicionar smoke tests HTTP em seguida.

---

## 4. Bloqueia funcionamento total

Aqui entram os pontos que impedem afirmar com segurança que o sistema está “100% funcional” em ambiente real.

### 4.1 Falta homologação ponta a ponta real
Sem validar o fluxo inteiro em execução, ainda falta comprovar:
- boot completo do compose;
- schema inicial do banco;
- backend saudável;
- frontend consumindo o backend;
- AI recebendo config/mercado/portfolio;
- social-worker publicando scores;
- painel refletindo status real;
- execução paper fluindo sem falhas.

**Critério de saída**
Checklist mínimo:
- `docker compose up --build`
- `GET /api/health` = ok
- `GET /api/status` = ok
- SSE do painel conectando
- heartbeat dos workers atualizando
- pelo menos 1 decisão registrada
- pelo menos 1 score social registrado
- pelo menos 1 snapshot de observabilidade registrado

### 4.2 Falta conjunto formal de `.env` e credenciais por serviço
Sem isso o projeto pode até subir parcialmente, mas não fica reproduzível.

**Necessário fechar**
- backend `.env`
- frontend `.env`
- ai `.env`
- social-worker `.env`
- política de valores default
- instruções de credenciais reais/testnet

### 4.3 Falta smoke test de integração
Sem smoke test, qualquer alteração quebra fluxo sem aviso.

**Necessário**
- script que verifique saúde das rotas principais;
- script que confirme tabelas básicas no banco;
- script que valide heartbeat de worker;
- script que valide retorno do `/api/status`.

### 4.4 Falta política final do modo live
A base existe, mas “100% funcional” para operação real pede:
- checklist obrigatório antes de live;
- confirmação explícita;
- reconciliação estável;
- política de rollback clara;
- alarmes críticos configurados.

---

## 5. Ordem ideal de implementação

### Fase 1 — fechar base operacional
1. Criar documentação operacional completa.
2. Padronizar `.env` por serviço.
3. Adicionar testes unitários mínimos.
4. Criar smoke test de boot/health/status.

### Fase 2 — reduzir fragilidade estrutural
5. Quebrar `App.jsx` em hooks e containers por página.
6. Modularizar `ai/main.py`.
7. Modularizar `social-worker/main.py`.

### Fase 3 — fechar inteligência adaptativa
8. Implementar job de recalibração automática por regime.
9. Registrar histórico de recalibração.
10. Detectar expert degradado.
11. Aplicar redução automática de peso com guardrails.
12. Sincronizar pesos recomendados com runtime de forma auditável.

### Fase 4 — validar melhor
13. Criar smoke tests HTTP.
14. Criar testes de contrato das principais rotas.
15. Validar fluxo paper end-to-end.
16. Validar fluxo testnet supervisionado.

### Fase 5 — preparar modo real
17. Endurecer readiness.
18. Endurecer policy gates.
19. Configurar notificações externas.
20. Formalizar checklist de live + rollback.

---

## 6. Roadmap sugerido por etapa

### Etapa A — estabilização mínima
- README técnico
- README de instalação
- `.env.example`
- testes unitários mínimos
- smoke test HTTP

### Etapa B — refatoração de frontend
- hooks por domínio
- loaders por página
- redução do `App.jsx`
- tratamento de erro e loading por domínio

### Etapa C — refatoração dos workers
- separar cliente HTTP, cálculo e loop
- introduzir testes de função pura em Python depois
- melhorar rastreabilidade do runtime

### Etapa D — aprendizado contínuo real
- métricas por expert e regime
- histórico de recalibração
- peso recomendado x atual
- expert degradado
- decay / cooldown por expert
- reativação segura

### Etapa E — validação forte
- smoke tests
- integração paper
- integração testnet
- alertas críticos obrigatórios

### Etapa F — prontidão operacional
- incidentes
- notificações
- runbooks refinados
- readiness obrigatório para promoção/live

---

## 7. Indicador final por área

| Área | Indicador | Status sugerido |
|---|---|---|
| Arquitetura multi-serviço | já pronto | bom |
| Backend REST por domínio | já pronto | bom |
| Frontend por páginas | já pronto | bom |
| Frontend desacoplado internamente | precisa ajuste | médio |
| Worker AI independente | já pronto | bom |
| Worker social independente | já pronto | bom |
| Modularização interna dos workers | precisa ajuste | médio |
| Banco e schema | já pronto | bom |
| Treinamento assistido | já pronto | bom |
| Runtime de treinamento | já pronto | bom |
| Aprendizado contínuo automático | precisa ajuste | médio |
| Testes unitários | bloqueia funcionamento total | crítico |
| Smoke test ponta a ponta | bloqueia funcionamento total | crítico |
| Instalação/documentação | bloqueia funcionamento total | crítico |
| Live readiness final | precisa ajuste | alto |

---

## 8. Conclusão honesta

O projeto **já tem base suficiente para funcionar como sistema integrado**, mas ainda **não está no ponto de ser chamado de 100% pronto** sem:

- documentação operacional forte;
- testes automatizados;
- validação ponta a ponta;
- fechamento do aprendizado contínuo real dos experts.

Se eu fosse priorizar uma sequência única, faria:

1. documentação + instalação + `.env`;
2. testes unitários + smoke tests;
3. refatoração do `App.jsx`;
4. refatoração dos workers;
5. aprendizado contínuo real dos experts por regime;
6. testnet supervisionada endurecida;
7. checklist final para live.
