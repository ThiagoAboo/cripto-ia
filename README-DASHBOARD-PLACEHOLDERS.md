# Hotfix - limpeza de placeholders no Dashboard

Arquivo incluído:
- frontend/src/pages/DashboardPage.jsx

## O que muda
- remove `-`, `—`, `–` e placeholders equivalentes quando faltarem datas/resumos
- não exibe mais separador `•` quando parte da linha estiver vazia
- em `Decisões recentes`, mostra só os metadados realmente disponíveis
- em `Treinamento e runtime`, oculta a linha de resumo quando ela vier vazia ou placeholder
- em `Jobs`, mostra status e horário apenas se houver valor válido
- em `Ordens recentes`, evita linha de status com data vazia

## Aplicação
1. copie o conteúdo da pasta `frontend` por cima do projeto
2. rode o build normal do frontend
3. publique
