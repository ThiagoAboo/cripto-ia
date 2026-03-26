# Etapa 33 — consolidação técnica e manutenção

Esta etapa fecha a sequência de evolução com foco em **sustentabilidade técnica**.

## Objetivo

Reduzir risco de manutenção do projeto sem reescrever tudo de uma vez. A estratégia aqui é:

- introduzir **contratos públicos de API**;
- criar um **manifesto do sistema** consultável por API;
- preparar módulos reutilizáveis para extração gradual de `ai/main.py` e `social-worker/main.py`;
- adicionar uma **auditoria de manutenção** para identificar acoplamento e arquivos grandes;
- ampliar a base de testes das camadas novas.

## Motivação

No estado atual visível do repositório:

- `ai/main.py` está com **1032 linhas**;
- `social-worker/main.py` está com **536 linhas**;
- o frontend já foi bastante modularizado, com `App.jsx` bem menor;
- backend e frontend já possuem `test` nos `package.json`.

A melhor forma de consolidar agora é criar pontos de extração estáveis e documentados.

## O que entra neste pacote

### Backend
- `backend/src/services/systemManifest.service.js`
- `backend/src/routes/system.routes.js`
- `backend/src/contracts/public-api.contract.json`

### Frontend
- `frontend/src/lib/contracts.js`
- `frontend/src/lib/system-manifest.js`

### AI
- `ai/app/runtime_state.py`
- `ai/app/service_manifest.py`

### Social Worker
- `social-worker/app/runtime_state.py`
- `social-worker/app/service_manifest.py`

### Scripts
- `scripts/maintenance-audit.sh`
- `scripts/run-maintenance-tests.sh`

## Resultado prático

Depois de aplicar esta etapa, o projeto passa a ter:

- uma **fonte única de contratos operacionais**;
- uma rota consultável para saber **versão, módulos, riscos e alvos de refatoração**;
- uma base segura para extrair funções do monolito Python sem quebrar o runtime;
- uma checagem automatizada de manutenção para CI ou uso local.

## Próximos ganhos esperados após aplicar
- extração gradual do loop principal da AI para `ai/app/*`;
- extração gradual do pipeline do social-worker para `social-worker/app/*`;
- dashboards operacionais lendo o manifesto e o checklist do backend;
- regras objetivas para impedir regressão de acoplamento.
