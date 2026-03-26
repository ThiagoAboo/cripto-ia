# Como aplicar a Etapa 29

## 1. Copiar arquivos
Mescle os arquivos deste pacote dentro do seu repositório.

## 2. Atualizar backend
Arquivos alterados:
- `backend/src/services/backtest.service.js`
- `backend/src/routes/backtests.routes.js`
- `backend/src/db/schema.js`

Arquivos novos:
- `backend/src/services/backtestValidation.service.js`
- `backend/tests/backtestValidation.service.test.cjs`
- `backend/tests/backtests.routes.validation.test.cjs`

## 3. Atualizar frontend
Arquivos novos:
- `frontend/src/lib/backtest-validation.js`
- `frontend/src/lib/backtest-validation.test.js`

## 4. Subir banco/backend
Ao iniciar o backend, o `schema.js` cria:
- `backtest_validation_runs`
- `backtest_validation_segments`

## 5. Rodar testes
### Backend
```bash
cd backend
npm test
```

### Frontend
```bash
cd frontend
npm test
```

## 6. Smoke manual
### Walk-forward
```bash
curl -X POST http://localhost:3001/api/backtests/walk-forward \
  -H 'Content-Type: application/json' \
  -d '{
    "symbol":"BTCUSDT",
    "candleLimit":700,
    "objective":"balanced",
    "minTrainCandles":180,
    "minTestCandles":80,
    "stepCandles":80,
    "maxWindows":4
  }'
```

### Robustez
```bash
curl -X POST http://localhost:3001/api/backtests/robustness \
  -H 'Content-Type: application/json' \
  -d '{
    "symbols":["BTCUSDT","ETHUSDT"],
    "candleLimits":[240,360,480],
    "objective":"balanced"
  }'
```
