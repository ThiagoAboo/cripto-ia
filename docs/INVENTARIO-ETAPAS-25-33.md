# Inventário consolidado das Etapas 25–33

Este arquivo lista os arquivos herdados de cada etapa que entraram no bundle cumulativo da Etapa 34.

## etapa-25-aprendizado-continuo-experts

- `backend/.env.example`
- `backend/package.json`
- `backend/src/config/env.js`
- `backend/src/db/schema.js`
- `backend/src/routes/training.routes.js`
- `backend/src/services/scheduler.service.js`
- `backend/src/services/trainingRecalibration.service.js`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/trainingRecalibration.service.test.cjs`
- `frontend/src/lib/api.js`

## etapa-26-testes-validacao

- `.github/workflows/etapa-26-tests.yml`
- `backend/package.json`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/scheduler.service.test.cjs`
- `backend/tests/training.routes.test.cjs`
- `frontend/package.json`
- `frontend/src/lib/dashboard.test.js`
- `frontend/src/lib/format.test.js`
- `scripts/smoke-local.sh`
- `scripts/test-all.sh`
- `scripts/test-backend.sh`
- `scripts/test-frontend.sh`

## etapa-27-refatoracao-frontend-modular

- `frontend/src/App.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/hooks/useDashboardController.js`
- `frontend/src/lib/dashboard-pages.js`
- `frontend/src/lib/dashboard-pages.test.js`
- `frontend/src/lib/dashboard-state.js`
- `frontend/src/lib/dashboard-state.test.js`
- `frontend/src/lib/dashboard.js`
- `frontend/src/lib/format.js`

## etapa-28-motor-decisao

- `ai/decision_policy.py`
- `backend/src/routes/decisions.routes.js`
- `backend/src/services/decisionPolicy.service.js`
- `backend/tests/decisionPolicy.service.test.cjs`
- `backend/tests/decisions.routes.test.cjs`
- `backend/tests/helpers/load-with-mocks.cjs`
- `frontend/src/lib/decision-preview.js`
- `frontend/src/lib/decision-preview.test.js`

## etapa-29-backtest-validacao-robusta

- `backend/src/db/schema.js`
- `backend/src/routes/backtests.routes.js`
- `backend/src/services/backtest.service.js`
- `backend/src/services/backtestValidation.service.js`
- `backend/tests/backtestValidation.service.test.cjs`
- `backend/tests/backtests.routes.validation.test.cjs`
- `backend/tests/helpers/load-with-mocks.cjs`
- `frontend/src/lib/backtest-validation.js`
- `frontend/src/lib/backtest-validation.test.js`

## etapa-30-observabilidade-governanca-operacional

- `backend/src/db/schema.js`
- `backend/src/routes/alerts.routes.js`
- `backend/src/routes/observability.routes.js`
- `backend/src/services/alerts.service.js`
- `backend/src/services/governanceAssessment.service.js`
- `backend/src/services/scheduler.service.js`
- `backend/tests/governanceAssessment.service.test.cjs`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/observability.routes.governance.test.cjs`
- `backend/tests/scheduler.governance.test.cjs`
- `frontend/src/lib/api.governance.test.js`
- `frontend/src/lib/api.js`

## etapa-31-social-worker-maturidade

- `backend/src/routes/social.routes.js`
- `backend/src/services/socialIntelligence.service.js`
- `backend/tests/socialIntelligence.service.test.cjs`
- `frontend/src/lib/social-intelligence.js`
- `frontend/src/lib/social-intelligence.test.js`
- `social-worker/social_model.py`
- `social-worker/tests/test_social_model.py`

## etapa-32-testnet-live-governanca-forte

- `backend/src/db/migrations/032_live_governance.sql`
- `backend/src/routes/control.routes.js`
- `backend/src/services/liveGovernance.service.js`
- `backend/src/services/scheduler.service.js`
- `backend/tests/control.routes.live.test.cjs`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/liveGovernance.service.test.cjs`
- `backend/tests/scheduler.live-governance.test.cjs`
- `frontend/src/lib/live-governance.js`
- `frontend/src/lib/live-governance.test.js`

## etapa-33-consolidacao-tecnica-manutencao

- `ai/app/__init__.py`
- `ai/app/runtime_state.py`
- `ai/app/service_manifest.py`
- `ai/tests/test_runtime_state.py`
- `ai/tests/test_service_manifest.py`
- `backend/src/contracts/public-api.contract.json`
- `backend/src/routes/system.routes.js`
- `backend/src/services/systemManifest.service.js`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/system.routes.test.cjs`
- `backend/tests/systemManifest.service.test.cjs`
- `frontend/src/lib/contracts.js`
- `frontend/src/lib/contracts.test.js`
- `frontend/src/lib/system-manifest.js`
- `frontend/src/lib/system-manifest.test.js`
- `scripts/maintenance-audit.sh`
- `scripts/run-maintenance-tests.sh`
- `social-worker/app/__init__.py`
- `social-worker/app/runtime_state.py`
- `social-worker/app/service_manifest.py`
- `social-worker/tests/test_runtime_state.py`
- `social-worker/tests/test_service_manifest.py`
