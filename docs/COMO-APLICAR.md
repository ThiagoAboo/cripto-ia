# Como aplicar a Etapa 34

## 1. Descompacte o pacote

Extraia o ZIP em uma pasta temporária.

## 2. Aplique a árvore cumulativa

Exemplo:

```bash
bash scripts/apply-cumulative-package.sh /caminho/para/seu/cripto-ia
```

O script:

- cria backup local dos arquivos que serão sobrescritos;
- copia tudo de `patch/` para o repositório-alvo;
- preserva a estrutura das pastas.

## 3. Revise os pontos manuais

### 3.1 `backend/src/app.js`
Garanta que exista:

```js
const systemRoutes = require('./routes/system.routes');
app.use('/api/system', systemRoutes);
```

### 3.2 migrations
Se o seu fluxo usa migrations formais, aplique:

```bash
backend/src/db/migrations/032_live_governance.sql
```

### 3.3 schema
Compare o `backend/src/db/schema.js` atual com o cumulativo do pacote antes de substituir em produção.

## 4. Rode a checagem estrutural

```bash
bash scripts/check-cumulative-package.sh /caminho/para/seu/cripto-ia
```

## 5. Rode os smoke tests pós-merge

```bash
bash scripts/run-post-merge-smoke.sh /caminho/para/seu/cripto-ia
```

## 6. Rode a auditoria de manutenção

```bash
bash /caminho/para/seu/cripto-ia/scripts/maintenance-audit.sh /caminho/para/seu/cripto-ia
```
