# Fase 5 Hotfix

Este overlay corrige o crash do Dashboard quando um `StatCard` recebe um objeto
no `value` ou `hint`, o que estava derrubando toda a tela em preto no frontend.

## Arquivos
- `frontend/src/components/StatCard.jsx`
- `frontend/src/pages/DashboardPage.jsx`

## Como aplicar
Extraia este ZIP na raiz do projeto e aceite sobrescrever os arquivos.
Depois reinicie o frontend:

```powershell
cd D:\Projetos\cripto-ia\frontend
npm run dev
```

## O que foi corrigido
- `StatCard` agora converte objetos em texto seguro, em vez de tentar renderizar o objeto cru.
- `DashboardPage` ficou mais defensivo para arrays e chaves.
- O card de PnL mostra `Taxas USDT` e `Taxas BNB` separadamente.
