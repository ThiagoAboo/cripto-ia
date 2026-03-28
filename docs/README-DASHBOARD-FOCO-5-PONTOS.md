Patch focado no Dashboard

Arquivos:
- frontend/src/pages/DashboardPage.jsx

O que muda:
- Decisões recentes: tenta exibir data/hora antes da confiança usando mais campos de timestamp.
- Treinamento e runtime: unifica manual-training-assistance e jobs automáticos no mesmo padrão visual.
- Jobs/runtime: usa mais campos de tempo (finishedAt/completedAt/startedAt/createdAt etc.) para reduzir datas repetidas por fallback ruim.
- Radar social: troca totalizadores por listas de Fortes e Providers.
- Cooldowns e proteção: troca totalizadores por resumos legíveis de cooldowns e loss streak.
- Taxas BNB: evita mostrar zero enganoso quando o payload não traz acumulado separado; passa a exibir "acumulado não disponível no payload atual".
- Ordens recentes: mantém o motivo e destaca quando houver rejeição por reserva mínima de BNB.

Aplicação:
1. copie o arquivo por cima do frontend atual
2. rode o build
3. publique

Observação:
- Para o campo "Fortes" mostrar ativos específicos, o backend precisa enviar uma lista detalhada (ex.: strongSignals/strongItems/etc.). Se vier só o agregado topClassifications, o patch cai em fallback resumido.
- Para "Taxas BNB" mostrar número real, o backend precisa expor o acumulado separado no payload do dashboard/carteira.
