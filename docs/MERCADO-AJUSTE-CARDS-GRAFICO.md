# Ajuste da tela Mercado

## O que foi alterado

- Inclusão de **Variação máxima** e **Variação mínima** no card do gráfico, mantendo **Preço atual**, **Variação** e **Volume**.
- As novas variações são calculadas a partir do início do período carregado no mini gráfico.
- Redução visual dos mini cards de métricas para ficarem mais compactos.

## Arquivos alterados

- `frontend/src/pages/MercadoPage.jsx`
- `frontend/src/styles.css`

## Observação

As métricas usam o mesmo período escolhido em **Intervalo do mini gráfico**.
