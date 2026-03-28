# Hotfix Windows para os testes

Este pacote corrige a execução dos testes no Windows + PowerShell + VS Code.

## O que foi ajustado

### Backend
O `backend/package.json` foi alterado de:

```json
"test": "node --test tests/**/*.test.cjs",
"test:watch": "node --test --watch tests/**/*.test.cjs"
```

para:

```json
"test": "node --test tests",
"test:watch": "node --test --watch tests"
```

### Frontend
O `frontend/package.json` usa o formato por diretório:

```json
"test": "node --test src/lib",
"test:watch": "node --test --watch src/lib"
```

## Como aplicar

1. Feche os terminais que estiverem rodando na pasta do projeto.
2. Copie os arquivos deste pacote por cima do seu repositório:
   - `backend/package.json`
   - `frontend/package.json`
   - `scripts/*.ps1`
3. No VS Code, abra a raiz do projeto.
4. Abra um terminal PowerShell.

## Comandos

### Diagnóstico
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnostico-testes.ps1 -ProjectRoot .
```

### Backend
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-backend.ps1 -ProjectRoot .
```

### Frontend
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-frontend.ps1 -ProjectRoot .
```

### Tudo
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1 -ProjectRoot .
```

## Observações

- Se o PowerShell bloquear a execução, use `-ExecutionPolicy Bypass` como nos exemplos acima.
- Se `npm test` falhar por dependência ausente, rode `npm install` em `backend/` e `frontend/`.
- Se os testes existirem, mas o Node ainda falhar, rode `node -v` e `npm -v` pelo script de diagnóstico para confirmar o ambiente.
