# Etapa 26 — testes automatizados e validação ponta a ponta mínima

## Objetivo
Fechar a lacuna mais crítica depois da Etapa 25: provar de forma repetível que o projeto sobe, responde e não quebra com regressões básicas.

## O que entra neste pacote
- scripts `npm test` para backend e frontend
- testes unitários de utilitários do frontend
- testes automatizados para `training.routes.js`
- teste automatizado para `scheduler.service.js`
- workflow de GitHub Actions para executar os testes em push/pull request
- smoke script local para validar backend + frontend com `curl`

## Arquivos incluídos
- `backend/package.json`
- `backend/tests/helpers/load-with-mocks.cjs`
- `backend/tests/scheduler.service.test.cjs`
- `backend/tests/training.routes.test.cjs`
- `frontend/package.json`
- `frontend/src/lib/dashboard.test.js`
- `frontend/src/lib/format.test.js`
- `.github/workflows/etapa-26-tests.yml`
- `scripts/test-backend.sh`
- `scripts/test-frontend.sh`
- `scripts/test-all.sh`
- `scripts/smoke-local.sh`

## O que já fica coberto
### Backend
- execução do job `training_recalibration` pelo scheduler
- publicação do evento `scheduler.job`
- retorno amigável do endpoint `/api/training/run` quando o guardrail de qualidade bloqueia auto-apply
- retorno do endpoint `/api/training/summary`

### Frontend
- merge de configuração com defaults
- update profundo de config por path
- parse numérico com fallback
- traduções utilitárias do dashboard
- formatação numérica, percentual, monetária, data e listas

## Como aplicar
1. Extraia este ZIP na raiz do repositório.
2. Revise os dois `package.json` e confirme que os scripts de teste não conflitam com algo local.
3. Rode:
   - `bash scripts/test-backend.sh`
   - `bash scripts/test-frontend.sh`
4. Depois de subir os containers/serviços, rode:
   - `bash scripts/smoke-local.sh`

## Próximo passo sugerido após esta etapa
### Etapa 27 — refatoração final do frontend modular
- reduzir o peso do `App.jsx`
- mover carregamento de dados para hooks/loaders por página
- separar melhor training, execution, governança e observabilidade no frontend
