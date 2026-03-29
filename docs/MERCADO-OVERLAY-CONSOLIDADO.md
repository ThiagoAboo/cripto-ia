# Mercado — overlay consolidado

Este pacote sobrescreve a tela de Mercado com foco em manter o estado atual e corrigir o modal.

## Inclui
- `frontend/src/pages/MercadoPage.jsx`
- `frontend/src/styles.css`

## Ajustes
- restaura o modal de Operações / Execução / Social como overlay real
- trava a rolagem do body enquanto o modal estiver aberto
- mantém a moeda visível no card ao remover dos favoritos
- estrela amarela quando favoritada e branca quando não favoritada
- cards ordenados alfabeticamente
- atualização automática a cada 1 minuto
- rótulo `Intervalo do gráfico`
- rótulo dinâmico `Variação de X`
- métricas do gráfico organizadas em 2 linhas:
  - Preço atual / Preço máximo / Preço mínimo
  - Variação de X / Variação máxima / Variação mínima
