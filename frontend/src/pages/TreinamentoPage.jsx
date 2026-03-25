import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
import { formatDateTime, formatList, formatMoney, formatNumber, formatPercent } from '../lib/format';
import { traduzirEspecialista, traduzirNivelDrift, traduzirQualidade, traduzirStatusGenerico } from '../lib/dashboard';

export default function TreinamentoPage({ ctx }) {
  const {
    draftConfig,
    trainingForm,
    setTrainingForm,
    trainingLoading,
    handleRunTrainingAssistance,
    trainingSummary,
    recentTrainingRuns,
    recentTrainingQualityReports,
    recentTrainingDriftReports,
    recentTrainingExpertReports,
    trainingLogs,
    selectedTrainingRunId,
    setSelectedTrainingRunId,
    selectedTrainingRun,
  } = ctx;

  return (
    <div className="page-stack">
      <Section title="Treinamento assistido e qualidade do modelo" subtitle="Módulo dedicado para análise, logs e governança do treinamento.">
        <div className="grid two-columns">
          <div className="list-stack">
            <ConfigField label="Rótulo da execução" hint="Ajuda a identificar o motivo desta avaliação.">
              <input value={trainingForm.label} onChange={(event) => setTrainingForm((current) => ({ ...current, label: event.target.value }))} />
            </ConfigField>
            <ConfigField label="Janela de avaliação (dias)" hint="Usa decisões e ordens simuladas recentes para medir qualidade e drift.">
              <input type="number" min="1" max="90" value={trainingForm.windowDays} onChange={(event) => setTrainingForm((current) => ({ ...current, windowDays: Number(event.target.value || 14) }))} />
            </ConfigField>
            <ConfigField label="Escopo de símbolos" hint="Opcional. Deixe vazio para usar a watchlist ativa.">
              <input value={trainingForm.symbolScope} placeholder="BTCUSDT,ETHUSDT" onChange={(event) => setTrainingForm((current) => ({ ...current, symbolScope: event.target.value }))} />
            </ConfigField>
            <label className="checkbox">
              <input type="checkbox" checked={Boolean(trainingForm.applySuggestedWeights)} onChange={(event) => setTrainingForm((current) => ({ ...current, applySuggestedWeights: event.target.checked }))} />
              <span>Aplicar pesos sugeridos automaticamente na config ativa</span>
            </label>
            <div className="button-row">
              <button className="button" disabled={trainingLoading} onClick={handleRunTrainingAssistance}>{trainingLoading ? 'Executando...' : 'Rodar treinamento assistido'}</button>
            </div>
            <div className="muted">Qualidade mínima para aplicar: {formatNumber(draftConfig?.training?.minQualityScoreForApply || 0, 2)}</div>
          </div>

          <div className="list-stack compact-scroll">
            <div className="list-item list-item--column">
              <div className="decision-card__row"><strong>Qualidade atual</strong><Pill tone={trainingSummary?.qualitySummary?.qualityStatus === 'healthy' ? 'buy' : trainingSummary?.qualitySummary?.qualityStatus === 'warning' ? 'warning' : 'high'}>{traduzirQualidade(trainingSummary?.qualitySummary?.qualityStatus) || '—'}</Pill></div>
              <div className="muted">Taxa de acerto: {formatPercent(trainingSummary?.qualitySummary?.winRate || 0)}</div>
              <div className="muted">Fator de lucro: {formatNumber(trainingSummary?.qualitySummary?.profitFactor || 0, 2)} • confiança média: {formatPercent(trainingSummary?.qualitySummary?.avgConfidence || 0)}</div>
              <div className="muted">PnL total: {formatMoney(trainingSummary?.qualitySummary?.totalPnl || 0, draftConfig?.trading?.baseCurrency || 'USDT')}</div>
            </div>

            <div className="list-item list-item--column">
              <div className="decision-card__row"><strong>Drift de mercado</strong><Pill tone={trainingSummary?.driftSummary?.driftLevel === 'low' ? 'buy' : trainingSummary?.driftSummary?.driftLevel === 'moderate' ? 'warning' : 'high'}>{traduzirNivelDrift(trainingSummary?.driftSummary?.driftLevel) || '—'}</Pill></div>
              <div className="muted">Score: {formatNumber(trainingSummary?.driftSummary?.driftScore || 0, 3)}</div>
              <div className="muted">Símbolos: {formatList(trainingSummary?.symbols || [])}</div>
            </div>
          </div>
        </div>
      </Section>

      <div className="grid two-columns">
        <Section title="Especialistas e runs" subtitle="Desempenho dos experts e execuções recentes do treinamento.">
          <div className="list-stack compact-scroll">
            <strong>Especialistas mais fortes</strong>
            {trainingSummary?.expertEvaluations?.length ? trainingSummary.expertEvaluations.slice(0, 7).map((item) => (
              <div key={item.expert} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{traduzirEspecialista(item.expert)}</strong><Pill tone={item.qualityLabel === 'healthy' ? 'buy' : item.qualityLabel === 'warning' ? 'warning' : 'high'}>{traduzirQualidade(item.qualityLabel)}</Pill></div>
                <div className="muted">Amostras: {formatNumber(item.samples || 0, 0)} • acerto: {formatPercent(item.hitRate || 0)}</div>
                <div className="muted">Peso atual: {formatNumber(item.currentWeight || 0, 4)} • sugerido: {formatNumber(trainingSummary?.suggestedWeights?.[item.expert] || 0, 4)}</div>
              </div>
            )) : <div className="muted">Ainda não há avaliação suficiente dos experts.</div>}

            <strong className="top-gap">Execuções recentes</strong>
            {recentTrainingRuns?.length ? recentTrainingRuns.slice(0, 8).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {item.label}</strong><Pill tone={item.applySuggestedWeights ? 'warning' : 'info'}>{item.applySuggestedWeights ? 'aplicou pesos' : 'análise'}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • janela {item.windowDays}d</div>
                <div className="muted">Versão aplicada: {item.appliedConfigVersion || '—'}</div>
              </div>
            )) : <div className="muted">Nenhum run de treinamento assistido ainda.</div>}
          </div>
        </Section>

        <Section title="Relatórios recentes" subtitle="Últimos relatórios de qualidade, drift e experts.">
          <div className="list-stack compact-scroll">
            <strong>Qualidade</strong>
            {recentTrainingQualityReports?.slice(0, 4).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.trainingRunId}</strong><Pill tone={item.qualityStatus === 'healthy' ? 'buy' : item.qualityStatus === 'warning' ? 'warning' : 'high'}>{traduzirQualidade(item.qualityStatus)}</Pill></div>
                <div className="muted">Win rate {formatPercent(item.winRate || 0)} • profit factor {formatNumber(item.profitFactor || 0, 2)}</div>
              </div>
            ))}

            <strong className="top-gap">Drift</strong>
            {recentTrainingDriftReports?.slice(0, 4).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.trainingRunId}</strong><Pill tone={item.driftLevel === 'low' ? 'buy' : item.driftLevel === 'moderate' ? 'warning' : 'high'}>{traduzirNivelDrift(item.driftLevel)}</Pill></div>
                <div className="muted">Score {formatNumber(item.driftScore || 0, 3)} • símbolos {formatList(item.symbolScope || [])}</div>
              </div>
            ))}

            <strong className="top-gap">Experts</strong>
            {recentTrainingExpertReports?.slice(0, 6).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{traduzirEspecialista(item.expert)}</strong><Pill tone={item.qualityLabel === 'healthy' ? 'buy' : item.qualityLabel === 'warning' ? 'warning' : 'high'}>{traduzirQualidade(item.qualityLabel)}</Pill></div>
                <div className="muted">Hit rate {formatPercent(item.hitRate || 0)} • contribuição {formatNumber(item.contributionScore || 0, 3)}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Logs do treinamento" subtitle="Histórico por execução para acompanhar cada etapa do processo de treinamento assistido.">
        <div className="grid two-columns">
          <div className="list-stack">
            <ConfigField label="Selecionar execução">
              <select value={selectedTrainingRunId} onChange={(event) => setSelectedTrainingRunId(event.target.value)}>
                <option value="">Todas</option>
                {recentTrainingRuns?.map((item) => <option key={item.id} value={item.id}>{`#${item.id} • ${item.label}`}</option>)}
              </select>
            </ConfigField>
            <div className="list-item list-item--column">
              <strong>Execução selecionada</strong>
              <div className="muted">{selectedTrainingRun ? `${selectedTrainingRun.label} • ${formatDateTime(selectedTrainingRun.createdAt)}` : 'Mostrando logs de todas as execuções recentes.'}</div>
            </div>
          </div>

          <div className="list-stack compact-scroll training-log-list">
            {trainingLogs?.length ? trainingLogs.map((item) => (
              <div key={item.id} className="list-item list-item--column training-log-item">
                <div className="decision-card__row"><strong>{item.stepKey || 'etapa'}</strong><Pill tone={item.level === 'error' ? 'high' : item.level === 'warning' ? 'warning' : 'info'}>{traduzirStatusGenerico(item.level)}</Pill></div>
                <div className="muted">Run #{item.trainingRunId} • {formatDateTime(item.createdAt)}</div>
                <div>{item.message}</div>
                {item.payload ? <pre className="code-block">{JSON.stringify(item.payload, null, 2)}</pre> : null}
              </div>
            )) : <div className="muted">Nenhum log disponível para esta execução.</div>}
          </div>
        </div>
      </Section>
    </div>
  );
}
