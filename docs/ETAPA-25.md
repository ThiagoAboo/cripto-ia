# Etapa 25 — aprendizado contínuo real dos experts por regime

Este pacote entrega a base operacional da Etapa 25 em cima da estrutura atual do repositório.

## O que entra neste pacote

### Backend
- `backend/src/services/trainingRecalibration.service.js`
  - calcula performance por regime usando `ai_decisions` + `paper_orders`
  - extrai performance dos experts a partir do payload real gravado pela AI
  - gera pesos recomendados com limite de deslocamento por execução
  - detecta experts degradados
  - decide se a recalibração pode ser aplicada automaticamente
  - grava histórico de recalibração

- `backend/src/routes/training.routes.js`
  - adiciona endpoints:
    - `GET /api/training/recalibration/recommendation`
    - `GET /api/training/recalibration/performance`
    - `GET /api/training/recalibration/history`
    - `POST /api/training/recalibration/run`

- `backend/src/services/scheduler.service.js`
  - adiciona o job `training_recalibration`
  - conecta a nova recalibração ao scheduler existente

- `backend/src/config/env.js`
- `backend/.env.example`
  - adicionam `SCHEDULER_TRAINING_RECALIBRATION_INTERVAL_SEC`

- `backend/src/db/schema.js`
  - adiciona a tabela `training_recalibration_history`

### Frontend
- `frontend/src/lib/api.js`
  - adiciona helpers para consumir os novos endpoints

### Testes
- `backend/tests/trainingRecalibration.service.test.cjs`
  - cobre regras centrais do novo serviço

## O que esta etapa resolve agora
- medir performance dos experts por regime real
- detectar expert degradado
- reduzir/reforçar peso sugerido com guardrails
- comparar pesos recomendados x pesos atuais
- manter histórico formal da recalibração
- permitir recalibração manual ou automática via scheduler

## O que ainda fica para a próxima subetapa
- painel visual dedicado para histórico/recomendação dentro da página de Treinamento
- mostrar cards e tabelas novas no frontend
- opcionalmente sincronizar o runtime automaticamente após aplicar novos pesos
- ampliar governança com aprovação dupla para recalibração automática em produção

## Observação importante
A base atual do projeto usa pesos em mais de um lugar:
- `config.ai.expertWeights`
- `config.training.expertWeights`
- `training_runtime_state.state.effectiveExpertWeights`

Neste pacote, a recalibração atualiza `ai.expertWeights` e `training.expertWeights`, e registra o histórico.
A sincronização automática do runtime foi deixada para a próxima subetapa para evitar mexer no comportamento vivo sem uma validação visual no painel.
