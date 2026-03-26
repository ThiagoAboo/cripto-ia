# Pacote da Etapa 26

Este pacote foi montado para ser mesclado ao repositório `cripto-ia`.

## Resumo rápido
O estado atual do projeto já inclui:
- arquitetura multi-serviço com `postgres`, `backend`, `ai-worker`, `social-worker` e `frontend`;
- backend com rotas amplas, incluindo training;
- frontend modular com `pages`, `components` e `lib`;
- scheduler com job `training_recalibration`.

O gargalo agora é validação contínua. Este pacote cria a base de testes e smoke path.

## Ordem de uso
1. descompactar na raiz do projeto;
2. revisar `backend/package.json` e `frontend/package.json`;
3. rodar `bash scripts/test-all.sh`;
4. subir a stack;
5. rodar `bash scripts/smoke-local.sh`.
