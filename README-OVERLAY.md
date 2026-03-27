# Overlay — Mercado fase seguinte

Baseado no estado atual do GitHub em que:
- `MercadoPage.jsx` já existe no frontend;
- `App.jsx` já inclui a página `mercado`;
- `dashboard-pages.js` já define a navegação da tela;
- o backend já expõe `/api/market/symbols`, `/api/market/tickers` e `/api/market/candles/:symbol`.

## O que entra
- favoritos por ativo com persistência local;
- presets rápidos da watchlist;
- filtro por base de conversão (`USDT`, `BRL`, `BTC`, `ETH`, `BNB`);
- escolha de intervalo para o mini gráfico;
- comparação lado a lado entre dois pares;
- atalhos rápidos para Dashboard, Operações, Execução e Social;
- textos em português-BR.

## Arquivos sobrescritos
- `frontend/src/pages/MercadoPage.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles.phase6.css`
- `frontend/src/lib/dashboard-pages.js`

## Aplicação no seu fluxo Docker
```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend backend
```
