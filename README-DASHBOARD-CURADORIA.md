# Hotfix — curadoria do Dashboard

Arquivos incluídos:

- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/components/SidebarNav.jsx`

Objetivo deste patch:

- remover os atalhos/cards provisórios do dashboard
- remover o card institucional da sidebar
- limpar placeholders e textos de apoio incompletos
- mostrar motivo de rejeição nas ordens quando existir no payload
- manter o dashboard como visão executiva limpa, com scroll apenas nas listas

Aplicação:

1. copiar os arquivos por cima do frontend atual
2. subir o build normal
3. revisar o dashboard publicado
