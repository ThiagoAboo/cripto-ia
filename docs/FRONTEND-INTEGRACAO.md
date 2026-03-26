# Sugestão de integração no frontend

Este pacote não substitui `frontend/src/pages/TreinamentoPage.jsx` inteiro para evitar conflitar com o trabalho já feito nessa página.

## Helpers novos disponíveis
- `fetchTrainingRecalibrationRecommendation(windowDays, symbolScope)`
- `fetchTrainingRecalibrationPerformance(windowDays, symbolScope)`
- `fetchTrainingRecalibrationHistory(limit)`
- `runTrainingRecalibration(payload)`

## Blocos sugeridos para adicionar na página de Treinamento

### 1. Card: Recomendação atual
Mostrar:
- regime atual
- quality score
- drift score
- experts degradados
- `safeToApply`
- tabela `weightDiff`

### 2. Card: Performance por regime
Mostrar `regimePerformance` com:
- regimeKey
- decisions
- executedDecisions
- winRate
- totalPnl
- topExperts
- degradedExperts

### 3. Card: Histórico de recalibração
Consumir `fetchTrainingRecalibrationHistory` e exibir:
- data
- triggerSource
- applied
- appliedConfigVersion
- quality/drift do summary

### 4. Ação manual
Botão para:
- rodar análise: `runTrainingRecalibration({ autoApply: false })`
- rodar e aplicar: `runTrainingRecalibration({ autoApply: true })`
