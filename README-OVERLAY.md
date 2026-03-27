# Overlay — layout opção 3 + página Mercado

Este pacote foi montado em cima do estado atual do GitHub do projeto.

## O que entra
- novo layout do dashboard inspirado na opção 3 escolhida
- nova página **Mercado** com:
  - seleção de base do par (USDT, BRL, BTC, ETH)
  - lista de pares carregada do backend em `/api/market/symbols`
  - mini gráficos por ativo com candles recentes
  - variação das últimas 24h usando `/api/market/tickers`
- textos em português-BR
- atalhos visuais para telas relacionadas

## Arquivos sobrescritos
- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/SidebarNav.jsx`
- `frontend/src/hooks/useDashboardController.js`
- `frontend/src/lib/api.js`
- `frontend/src/lib/dashboard-pages.js`
- `frontend/src/pages/DashboardPage.jsx`

## Arquivos novos
- `frontend/src/components/SparklineChart.jsx`
- `frontend/src/pages/MercadoPage.jsx`
- `frontend/src/styles.option3.css`

## Como aplicar
1. extraia o ZIP na raiz do projeto
2. aceite sobrescrever
3. rode:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend backend
```

## Validação rápida
```powershell
curl.exe -fsS http://localhost:4000/api/market/symbols?quoteAsset=USDT
curl.exe -fsS "http://localhost:4000/api/market/tickers?symbols=BTCUSDT,ETHUSDT"
```

Depois abra:
- `http://localhost:5173`

E confira:
- dashboard com a nova organização
- página **Mercado** no menu lateral
- seleção de base e pares funcionando
- cards com mini gráfico e % 24h
