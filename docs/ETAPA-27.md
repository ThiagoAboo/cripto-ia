# Etapa 27 — refatoração final do frontend modular

## Objetivo

Retirar do `App.jsx` a maior parte da orquestração de estado, carregamento e ações operacionais,
sem quebrar as páginas já modularizadas (`DashboardPage`, `ConfiguracaoPage`, `OperacoesPage`,
`ExecucaoPage`, `GovernancaPage`, `SocialPage`, `TreinamentoPage`).

## O que este pacote entrega

- `frontend/src/hooks/useDashboardController.js`
  - concentra o carregamento inicial do painel
  - unifica SSE, forms, seleção de run de treinamento e handlers operacionais
  - expõe um `pageContext` pronto para as páginas
- `frontend/src/lib/dashboard-state.js`
  - concentra factories de estado inicial
  - resolve fallback entre `status` em tempo real e `auxData`
  - centraliza a montagem dos cards-resumo do topo
- `frontend/src/lib/dashboard-pages.js`
  - registra as páginas do painel em um ponto único
- `frontend/src/components/AppShell.jsx`
  - encapsula sidebar, header, badges e alerts globais
- `frontend/src/App.jsx`
  - vira apenas a casca principal da aplicação
- testes unitários novos:
  - `frontend/src/lib/dashboard-pages.test.js`
  - `frontend/src/lib/dashboard-state.test.js`

## Resultado esperado

- `App.jsx` deixa de concentrar quase toda a aplicação
- a navegação por domínio continua igual
- a lógica de fallback entre SSE/status e dados carregados fica testável
- novos domínios ou páginas passam a ser adicionados com menor acoplamento

## Como aplicar

1. Copiar os arquivos do pacote para as mesmas pastas do projeto.
2. Substituir o `frontend/src/App.jsx` atual pelo arquivo deste pacote.
3. Rodar os testes do frontend:

```bash
cd frontend
npm test
```

4. Validar o build local:

```bash
npm run build
```

## Próximo passo natural

Depois desta etapa, a sequência mais coerente é:

- **Etapa 28 — endurecimento do motor de decisão**
  - sizing por confiança/regime/volatilidade
  - bloqueios por liquidez/spread/slippage
  - regras por regime
