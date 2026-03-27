# Overlay — Dashboard: um único card de taxas

Este overlay remove a duplicidade do card de PnL no dashboard.

## O que muda
- mantém apenas **um** card de `PnL realizado`
- exibe as taxas em duas linhas dentro do mesmo card:
  - `Taxas USDT` (ou moeda base)
  - `Taxas BNB`

## Como aplicar
1. Extraia este ZIP na raiz do projeto.
2. Aceite sobrescrever.
3. Rebuild do frontend no Docker:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend
```

4. Atualize o navegador com `Ctrl + F5`.
