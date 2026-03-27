# Correção Windows para testes

Este pacote foi feito para ser extraído **na raiz do repositório** `cripto-ia`, sobrescrevendo arquivos.

## O que ele altera
- `backend/package.json`
- `frontend/package.json`
- adiciona scripts PowerShell em `scripts/`

## Motivo
No Windows + PowerShell, os scripts atuais usam glob no `node --test`:
- backend: `tests/**/*.test.cjs`
- frontend: `src/lib/*.test.js`

No seu ambiente isso está sendo tratado como texto literal. Esta correção troca a execução para diretórios:
- backend: `node --test tests`
- frontend: `node --test src/lib`

## Como usar no VS Code
Abra a raiz do projeto e rode:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\diagnostico-testes.ps1
.\scripts\test-all.ps1
```
