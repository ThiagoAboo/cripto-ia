ETAPA 29 — Backtest avançado e validação robusta

Conteúdo do pacote:
- backend/src/services/backtest.service.js
- backend/src/services/backtestValidation.service.js
- backend/src/routes/backtests.routes.js
- backend/src/db/schema.js
- backend/tests/backtestValidation.service.test.cjs
- backend/tests/backtests.routes.validation.test.cjs
- backend/tests/helpers/load-with-mocks.cjs
- frontend/src/lib/backtest-validation.js
- frontend/src/lib/backtest-validation.test.js
- docs/ETAPA-29.md
- docs/COMO-APLICAR.md
- manifest.json

Objetivo:
Adicionar validação robusta em cima do backtest atual, com:
- walk-forward operacional usando janelas train/test
- sweep de robustez por símbolo e profundidade de candles
- score de estabilidade
- persistência de runs de validação e segmentos
- endpoints dedicados para o painel
