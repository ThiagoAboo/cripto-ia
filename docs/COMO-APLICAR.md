# Como aplicar este pacote no repositório

Copie os arquivos deste ZIP para os mesmos caminhos dentro do seu projeto.

## Ordem recomendada
1. Substituir os arquivos do backend
2. Substituir `frontend/src/lib/api.js`
3. Rodar o backend com a nova schema
4. Rodar os testes do backend
5. Validar os novos endpoints

## Smoke test sugerido

### 1. Instalar dependências do backend
```bash
cd backend
npm install
```

### 2. Executar testes
```bash
npm test
```

### 3. Subir ambiente
```bash
docker compose up --build
```

### 4. Validar endpoints
```bash
curl http://localhost:4000/api/training/recalibration/recommendation
curl http://localhost:4000/api/training/recalibration/performance
curl http://localhost:4000/api/training/recalibration/history
curl -X POST http://localhost:4000/api/training/recalibration/run \
  -H 'Content-Type: application/json' \
  -d '{"requestedBy":"dashboard","triggerSource":"manual","autoApply":false}'
```

## Variável nova
```env
SCHEDULER_TRAINING_RECALIBRATION_INTERVAL_SEC=3600
```

## Resultado esperado
- o backend passa a expor recomendação, performance e histórico de recalibração
- o scheduler passa a ter o job `training_recalibration`
- a tabela `training_recalibration_history` passa a registrar execuções
