Este pacote ajusta o card "PnL realizado" no Dashboard para exibir somente o somatório das taxas por moeda.

Alteração aplicada:
- remove a linha com contagem de ordens rejeitadas por reserva mínima de BNB do hint do card
- mantém apenas:
  - Taxas USDT (ou moeda base)
  - Taxas BNB

Aplicação:
1. Extraia o conteúdo do ZIP na raiz do projeto
2. Aceite sobrescrever os arquivos
3. Rode o build/deploy normal do frontend
