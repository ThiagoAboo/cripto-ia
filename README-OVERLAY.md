# Backend tests sync com o GitHub

Este overlay foi preparado para extrair na raiz do projeto.

## O que ele atualiza

- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/system.routes.test.cjs`
- `backend/tests/backtestValidation.service.test.cjs`
- `backend/tests/backtests.routes.validation.test.cjs`
- `backend/src/services/backtestValidation.service.js`
- `backend/src/routes/backtests.routes.js`
- `backend/src/routes/system.routes.js`

## Observação

Os arquivos de `backtestValidation` e `backtests.routes` foram sincronizados com o estado atual do GitHub.

O helper `load-with-mocks.cjs` recebeu uma correção de compatibilidade para resolver caminhos relativos com mais segurança no Windows.

O teste `system.routes.test.cjs` foi ajustado para o estado atual da rota, que já expõe também `GET /`.

## Como aplicar

1. Extraia este ZIP na raiz do projeto.
2. Aceite sobrescrever os arquivos.
3. Rode:

```powershell
cd D:\Projetos\cripto-ia\backend
npm test
```
