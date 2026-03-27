# Hotfix — exports de mercado no frontend

Este overlay adiciona em `frontend/src/lib/api.js` os exports:
- `fetchMarketSymbols`
- `fetchMarketTickers`
- `fetchMarketCandles`

Uso no ambiente Docker:
```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend backend
```
