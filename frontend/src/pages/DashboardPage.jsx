import Section from '../components/Section';
import StatCard from '../components/StatCard';
import Pill from '../components/Pill';
import {
  formatDateTime,
  formatList,
  formatMoney,
  formatNumber,
  formatPercent,
} from '../lib/format';
import {
  traduzirAcaoDecisao,
  traduzirClassificacaoSocial,
  traduzirChaveJob,
  traduzirNivelDrift,
  traduzirQualidade,
  traduzirRunbook,
  traduzirSeveridade,
  traduzirStatusGenerico,
} from '../lib/dashboard';

function emptyText(value, fallback = '—') {
  return value ?? fallback;
}

export default function DashboardPage({ ctx }) {
  const {
    summaryCards = [],
    baseCurrency,
    currentPortfolio = {},
    currentDecisions = [],
    currentOrders = [],
    activeAlerts = [],
    latestReadiness,
    recentJobRuns = [],
    socialSummary,
    providerStatuses = [],
    recentTrainingRuns = [],
    trainingSummary,
  } = ctx;

  const positions = currentPortfolio?.positions || [];
  const readinessChecks = (latestReadiness?.checks || []).slice(0, 4);
  const topClassifications = (socialSummary?.topClassifications || []).slice(0, 4);

  return (
    <div className="page-stack">
      <div className="stats-grid">
        {summaryCards.map((card, index) => (
          <StatCard
            key={card.key || card.id || `${card.label}-${index}`}
            {...card}
          />
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="page-stack">
          <Section
            title="Prontidão mais recente"
            subtitle={
              latestReadiness?.createdAt
                ? formatDateTime(latestReadiness.createdAt)
                : 'Sem avaliação recente.'
            }
          >
            <div className="list-stack">
              <div className="list-item">
                <span>Status geral</span>
                <Pill tone={latestReadiness?.status === 'blocked' ? 'sell' : latestReadiness?.status === 'degraded' ? 'hold' : 'buy'}>
                  {traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}
                </Pill>
              </div>
              {readinessChecks.length ? (
                readinessChecks.map((item, index) => (
                  <div
                    key={item.key || item.label || `readiness-${index}`}
                    className="list-item list-item--column"
                  >
                    <strong>{item.label || item.key}</strong>
                    <span className="muted">{item.message || item.status || 'Sem detalhe adicional.'}</span>
                  </div>
                ))
              ) : (
                <div className="list-item list-item--column">
                  <strong>Sem checks recentes</strong>
                  <span className="muted">Nenhuma validação de prontidão foi registrada ainda.</span>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Treinamento e drift"
            subtitle="Qualidade recente, risco de drift e último ciclo de aprendizado assistido."
          >
            <div className="metric-grid">
              <StatCard
                label="Qualidade"
                value={traduzirQualidade(trainingSummary?.qualitySummary?.qualityStatus) || '—'}
                hint={
                  trainingSummary?.qualitySummary?.score != null
                    ? `Score ${formatNumber(trainingSummary.qualitySummary.score, 3)}`
                    : 'Sem score recente.'
                }
              />
              <StatCard
                label="Drift"
                value={traduzirNivelDrift(trainingSummary?.driftSummary?.driftLevel) || '—'}
                hint={`Score ${formatNumber(trainingSummary?.driftSummary?.driftScore || 0, 3)}`}
              />
              <StatCard
                label="Último run"
                value={recentTrainingRuns?.[0]?.createdAt ? formatDateTime(recentTrainingRuns[0].createdAt) : 'Nenhum'}
                hint={recentTrainingRuns?.[0]?.label || 'Sem execução recente.'}
              />
            </div>
          </Section>

          <Section
            title="Alertas ativos"
            subtitle="Itens que merecem atenção imediata antes de liberar operação real."
          >
            {activeAlerts.length ? (
              <div className="list-stack">
                {activeAlerts.slice(0, 6).map((alert, index) => (
                  <div key={alert.id || alert.alertKey || `alert-${index}`} className="alert-card">
                    <div className="decision-card__row">
                      <strong>{alert.title || alert.alertKey}</strong>
                      <Pill tone={alert.severity === 'critical' ? 'sell' : alert.severity === 'warning' ? 'hold' : 'info'}>
                        {traduzirSeveridade(alert.severity)}
                      </Pill>
                    </div>
                    <div className="muted">{alert.message || 'Sem mensagem adicional.'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-item list-item--column">
                <strong>Nenhum alerta ativo</strong>
                <span className="muted">O backend não reportou alertas neste momento.</span>
              </div>
            )}
          </Section>

          <Section
            title="Radar social"
            subtitle="Resumo consultivo das narrativas e da saúde dos provedores sociais."
          >
            <div className="metric-grid top-gap">
              <StatCard label="Fortes" value={formatNumber(socialSummary?.strongCount || 0, 0)} />
              <StatCard label="Promissoras" value={formatNumber(socialSummary?.promisingCount || 0, 0)} />
              <StatCard label="Alto risco" value={formatNumber(socialSummary?.highRiskCount || 0, 0)} />
            </div>

            <p className="section-subtitle top-gap">Classificações</p>
            <div className="button-row top-gap">
              {topClassifications.length ? (
                topClassifications.map((item, index) => (
                  <Pill key={`${item.classification || 'classification'}-${index}`} tone="info">
                    {traduzirClassificacaoSocial(item.classification)} {item.count}
                  </Pill>
                ))
              ) : (
                <span className="muted">Sem classificações recentes.</span>
              )}
            </div>

            <p className="section-subtitle top-gap">Provedores</p>
            <div className="list-stack top-gap">
              {providerStatuses.length ? (
                providerStatuses.map((provider, index) => (
                  <div key={provider.provider || `provider-${index}`} className="list-item list-item--column">
                    <strong>{provider.provider}</strong>
                    <span className="muted">
                      {traduzirStatusGenerico(provider.status)}
                      {provider.retryAfterSec ? ` • retry em ${provider.retryAfterSec}s` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="list-item list-item--column">
                  <strong>Sem provedores carregados</strong>
                  <span className="muted">Nenhuma telemetria social foi recebida ainda.</span>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Jobs recentes"
            subtitle="Últimas rotinas automáticas executadas no backend."
          >
            {recentJobRuns.length ? (
              <div className="list-stack">
                {recentJobRuns.slice(0, 5).map((job, index) => (
                  <div key={job.id || `job-${index}`} className="list-item list-item--column">
                    <strong>{traduzirChaveJob(job.jobKey)}</strong>
                    <span className="muted">
                      {traduzirStatusGenerico(job.status)} • {formatDateTime(job.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-item list-item--column">
                <strong>Nenhum job registrado</strong>
                <span className="muted">Ainda não há execuções automáticas registradas nesta base.</span>
              </div>
            )}
          </Section>
        </div>

        <div className="page-stack">
          <Section
            title="Patrimônio e exposição"
            subtitle="Estado atual do portfólio simulado e das posições abertas."
          >
            <div className="metric-grid">
              <StatCard
                label="Patrimônio"
                value={formatMoney(currentPortfolio?.equity || 0, baseCurrency)}
                hint={`Caixa ${formatMoney(currentPortfolio?.cashBalance || 0, baseCurrency)}`}
              />
              <StatCard
                label="PnL realizado"
                value={formatMoney(currentPortfolio?.realizedPnl || 0, baseCurrency)}
                tone={(currentPortfolio?.realizedPnl || 0) >= 0 ? 'positive' : 'danger'}
                hint={`Taxas ${formatMoney(currentPortfolio?.feesPaid || 0, baseCurrency)}`}
              />
              <StatCard
                label="Posições abertas"
                value={formatNumber(positions.length || 0, 0)}
                hint={`Exposição ${formatPercent(currentPortfolio?.exposurePct || 0)}`}
              />
            </div>

            <p className="section-subtitle top-gap">Posições</p>
            <div className="table-wrap top-gap">
              {positions.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Símbolo</th>
                      <th>Qtd</th>
                      <th>Entrada</th>
                      <th>Preço atual</th>
                      <th>Não realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.slice(0, 8).map((position, index) => (
                      <tr key={position.symbol || `position-${index}`}>
                        <td>{position.symbol}</td>
                        <td>{formatNumber(position.quantity, 6)}</td>
                        <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                        <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                        <td className={(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>
                          {formatMoney(position.unrealizedPnl || 0, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="list-item list-item--column">
                  <strong>Nenhuma posição aberta</strong>
                  <span className="muted">A carteira está zerada neste momento.</span>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Decisões recentes"
            subtitle="Sinais emitidos pela IA antes da camada de execução."
          >
            {currentDecisions.length ? (
              <div className="list-stack">
                {currentDecisions.slice(0, 8).map((decision, index) => (
                  <div key={decision.id || `decision-${index}`} className="decision-card">
                    <div className="decision-card__row">
                      <strong>{decision.symbol}</strong>
                      <Pill tone={String(decision.action || '').toLowerCase()}>
                        {traduzirAcaoDecisao(decision.action)}
                      </Pill>
                    </div>
                    <div className="muted">
                      {formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}
                    </div>
                    <div className="top-gap">Razão: {decision.reason || decision.summary || '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-item list-item--column">
                <strong>Nenhuma decisão recente</strong>
                <span className="muted">A IA ainda não publicou sinais nesta base.</span>
              </div>
            )}
          </Section>

          <Section
            title="Ordens recentes"
            subtitle="Execuções mais novas registradas pelo modo paper/testnet/live."
          >
            {currentOrders.length ? (
              <div className="list-stack">
                {currentOrders.slice(0, 8).map((order, index) => (
                  <div key={order.id || `order-${index}`} className="decision-card">
                    <div className="decision-card__row">
                      <strong>{order.symbol}</strong>
                      <Pill tone={String(order.side || '').toLowerCase()}>
                        {traduzirAcaoDecisao(order.side)}
                      </Pill>
                    </div>
                    <div className="muted">
                      {formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}
                    </div>
                    <div className="top-gap">
                      Preço {formatMoney(order.price, baseCurrency)} • PnL {formatMoney(order.realizedPnl || 0, baseCurrency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-item list-item--column">
                <strong>Nenhuma ordem recente</strong>
                <span className="muted">Ainda não há ordens registradas nesta base.</span>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
