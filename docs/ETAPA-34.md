# Etapa 34 — merge cumulativo + estabilização final

## Objetivo

Esta etapa fecha a sequência de pacotes das Etapas 25 a 33 em um **bundle único de merge**.

Em vez de abrir uma funcionalidade nova, o foco aqui é:

- consolidar os arquivos entregues nas Etapas 25–33 em uma única árvore `patch/`;
- reduzir o esforço manual de copiar arquivo por arquivo;
- documentar conflitos de precedência entre pacotes;
- fornecer scripts de aplicação, checagem e smoke pós-merge.

## O que este pacote faz

- junta em `patch/` os arquivos cumulativos das Etapas 25 a 33;
- aplica precedência por ordem de etapa (**33 sobrescreve 32, 32 sobrescreve 31, ...**);
- mantém testes, helpers e scripts operacionais no mesmo bundle;
- preserva o histórico das etapas em inventário separado.

## Resultado do merge

- arquivos únicos na árvore cumulativa: **87**
- conflitos resolvidos por precedência: **5**
- etapas consolidadas: **25, 26, 27, 28, 29, 30, 31, 32 e 33**

## Conflitos resolvidos por precedência

Os conflitos relevantes ficaram concentrados em arquivos já esperados:

- `backend/package.json` ← última versão vinda de **etapa-26-testes-validacao**
- `backend/src/db/schema.js` ← última versão vinda de **etapa-30-observabilidade-governanca-operacional**
- `backend/src/services/scheduler.service.js` ← última versão vinda de **etapa-32-testnet-live-governanca-forte**
- `backend/tests/helpers/load-with-mocks.cjs` ← última versão vinda de **etapa-33-consolidacao-tecnica-manutencao**
- `frontend/src/lib/api.js` ← última versão vinda de **etapa-30-observabilidade-governanca-operacional**

## Estrutura principal do bundle

- `patch/backend/` — rotas, services, schema, migrations, contratos e testes
- `patch/frontend/` — shell modular, hooks e helpers do painel
- `patch/ai/` — base modular para extração progressiva + decision policy
- `patch/social-worker/` — base modular + social model
- `patch/scripts/` — scripts herdados das etapas anteriores
- `patch/.github/` — workflow de testes

## O que ainda exige atenção manual

1. registrar `system.routes` em `backend/src/app.js`, caso ainda não esteja montado;
2. revisar possíveis diferenças entre `schema.js` atual do seu repo e o `schema.js` cumulativo do pacote;
3. aplicar a migration `backend/src/db/migrations/032_live_governance.sql` no fluxo do seu banco, se você usa migrations formais;
4. rodar os smoke tests e a auditoria após a cópia dos arquivos.

## Próximo passo natural após esta etapa

Depois de aplicar este pacote, o projeto entra em uma fase mais curta de **homologação final**:

- merge real no branch principal;
- ajuste fino de wiring (`app.js`, migrations e rotas);
- execução de testes do backend, frontend e Python;
- validação manual do painel e do scheduler.
