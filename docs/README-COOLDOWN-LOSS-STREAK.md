Este pacote atualiza 2 arquivos para sobrescrever diretamente no projeto:

- frontend/src/pages/DashboardPage.jsx
- backend/src/services/control.service.js

O que muda:
- Card "Cooldowns ativos" no padrão visual dos alertas/runtime, com status em pílula oval, data/hora e motivo.
- Payload de guardrails passa a incluir recentLosses/lossStreakDetails com as perdas da sequência atual.
- Dashboard passa a consumir esse detalhamento e deixa de depender apenas do contador de loss streak.

Aplicação:
1. Extraia na raiz do projeto.
2. Aceite sobrescrever os arquivos.
3. Rode o build/deploy normal.
