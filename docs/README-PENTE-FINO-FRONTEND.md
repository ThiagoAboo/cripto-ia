# Pente-fino do frontend

Pacote overlay para extrair na raiz do projeto.

## O que este pacote faz

- substitui o shell principal do frontend por uma estrutura consistente
- restaura estilos de componentes compartilhados
- corrige o Dashboard para não renderizar objetos crus no React
- mantém o card único de PnL com `Taxas USDT` e `Taxas BNB`
- centraliza o visual em `frontend/src/styles.css`
- remove a dependência dos estilos incrementais conflitantes no `main.jsx`

## Arquivos sobrescritos

- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles.css`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/SidebarNav.jsx`
- `frontend/src/components/StatusBadge.jsx`
- `frontend/src/components/Section.jsx`
- `frontend/src/components/Pill.jsx`
- `frontend/src/components/ConfigField.jsx`
- `frontend/src/components/StatCard.jsx`
- `frontend/src/lib/dashboard-pages.js`
- `frontend/src/lib/render-safe.js`
- `frontend/src/pages/DashboardPage.jsx`

## Como aplicar no fluxo Docker

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend
```

Se quiser garantir rebuild mais forte:

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d frontend backend
```

Depois, no navegador:

- `Ctrl + F5`

## O que validar

- menu lateral com layout restaurado
- cards do dashboard com espaçamento e borda corretos
- ausência de tela preta
- ausência de erro `Objects are not valid as a React child`
- ausência de warning de `key` no `DashboardPage`
- um único card de PnL, com taxas separadas por indicador
