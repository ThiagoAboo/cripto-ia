# Como aplicar a Etapa 31

## 1. Backend

Adicione o novo arquivo:

- `backend/src/services/socialIntelligence.service.js`

Substitua o arquivo:

- `backend/src/routes/social.routes.js`

Adicione o teste:

- `backend/tests/socialIntelligence.service.test.cjs`

## 2. Frontend

Adicione os arquivos:

- `frontend/src/lib/social-intelligence.js`
- `frontend/src/lib/social-intelligence.test.js`

Esses helpers já permitem integrar a página social sem depender de alterar a tela inteira agora.

## 3. Social worker

Adicione os arquivos:

- `social-worker/social_model.py`
- `social-worker/tests/test_social_model.py`

Esse módulo foi separado para ser importado pelo `main.py` quando você quiser migrar a lógica de score/classificação para uma camada reutilizável.

## 4. Rodar testes

### Backend

```bash
cd backend
node --test tests/socialIntelligence.service.test.cjs
```

### Frontend

```bash
cd frontend
node --test src/lib/social-intelligence.test.js
```

### Python

```bash
cd social-worker
python -m unittest tests/test_social_model.py
```

## Observação

Este pacote foi preparado para **mesclar no seu repositório atual**.
Ele não aplica alterações automaticamente no GitHub remoto.
