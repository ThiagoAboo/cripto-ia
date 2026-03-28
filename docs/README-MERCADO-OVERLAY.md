Aplicação do overlay

1. Extraia este ZIP na raiz do projeto.
2. Aceite sobrescrever os arquivos.
3. Reinicie o backend para aplicar a criação da tabela dashboard_preferences e a nova rota /api/market/preferences.
4. Refaça o build/deploy do frontend.

O pacote implementa:
- seletor multi-selecionável com filtro interno em Mercado
- remoção dos botões de atalho superiores na página Mercado
- remoção da comparação lado a lado
- favoritos com salvamento automático no backend
- navegação Mercado -> Operações / Execução / Social com filtro da moeda
- páginas Operações / Execução / Social lendo o filtro vindo do Mercado
