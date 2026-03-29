# Ajuste da tela Mercado

## O que foi corrigido

- restaurado o visual da lista de **Pares disponíveis na Binance** usando as classes corretas do frontend
- ao remover uma moeda dos **Favoritos** pela estrela, a moeda **continua exibida nos cards** naquele momento
- a remoção da estrela passa a **tirar apenas da lista salva de favoritos**
- a estrela fica **amarela** quando favoritada e **branca** quando não favoritada

## Arquivo alterado

- `frontend/src/pages/MercadoPage.jsx`
