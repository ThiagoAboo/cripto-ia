# Runtime schema hotfix

Este pacote adiciona um hotfix seguro para o runtime do backend sem sobrescrever o `schema.js` inteiro.

## O que ele cria/corrige

- `live_mode_events`
- `testnet_supervision_reports`
- índice básico para ambas
- compatibilidade de `paper_positions.last_price` para `NUMERIC(28, 12)` caso sua base antiga ainda tenha outro tipo

## Como aplicar

Na raiz do projeto:

```powershell
cd backend
node .\src\db\apply-runtime-schema-hotfix.cjs
```

Se estiver usando Docker e quiser executar dentro do container do backend:

```powershell
docker compose exec backend node /app/src/db/apply-runtime-schema-hotfix.cjs
```

## Validação rápida

Depois rode o backend normalmente e confira se pararam os erros de tabela inexistente no Postgres.

## Observação

Este hotfix é intencionalmente isolado. Ele não substitui o `schema.js`; ele corrige o banco atual com o menor risco possível.
