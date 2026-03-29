# Correção do modal da página Mercado

## Objetivo
Restaurar a abertura em modal/overlay ao clicar em:
- Operações
- Execução
- Social

## O que foi ajustado
- import do arquivo `market-modal-fix.css` em `frontend/src/main.jsx`
- regras globais para `[role="dialog"][aria-modal="true"]`
- trava de rolagem do `body` enquanto o modal estiver aberto
- container interno com largura, altura máxima e sombra de modal
- cabeçalho do modal fixo no topo do painel

## Arquivos
- `frontend/src/main.jsx`
- `frontend/src/market-modal-fix.css`
