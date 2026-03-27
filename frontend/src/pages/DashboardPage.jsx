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
  traduzirSeveridade,
  traduzirStatusGenerico,
} from '../lib/dashboard';

function emptyText(value, fallback = '—') {
  return value ?? fallback;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractFeeBreakdown(currentPortfolio = {}, baseCurrency = 'USDT') {
  const byCurrency = currentPortfolio?.feesByCurrency || currentPortfolio?.feeBreakdown || {};

  const quoteFee =
    toNumber(currentPortfolio?.feesPaidQuote) ||
    toNumber(currentPortfolio?.feesPaidUsdt) ||
    toNumber(byCurrency?.[baseCurrency]) ||
    toNumber(byCurrency?.USDT) ||
    toNumber(currentPortfolio?.feesPaid);

  const bnbFee =
    toNumber(currentPortfolio?.feesPaidBnb) ||
    toNumber(currentPortfolio?.bnbFeesPaid) ||
    toNumber(byCurrency?.BNB) ||
    toNumber(byCurrency?.bnb);

  return { quoteFee, bnbFee };
}

function EmptyState({ title, description }) {
  return (
    <div className="phase4-empty">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
    </div>
  );
}

export default function DashboardPage({ ctx }) {
  const {
    summaryCards = [],
    baseCurrency = 'USDT',
    currentPortfolio = {},
    currentDecisions = [],
    currentOrders = [],
    activeAlerts = [],
    latestReadiness,
    recentJobRuns = [],
    socialSummary,
    providerStatuses = [],
    trainingSummary,
  } = ctx;

  const positions = currentPortfolio?.positions || [];
  const readinessChecks = (latestReadiness?.checks || []).slice(0, 4);
  const topClassifications = (socialSummary?.topClassifications || []).slice(0, 4);
  const { quoteFee, bnbFee } = extractFeeBreakdown(currentPortfolio, baseCurrency);

  return (
    <div className="page-stack">
      <div className="stats-grid">
        {summaryCards.map((card, index) => (
          <StatCard key={card.key || card.id || `${card.label}-${index}`} {...card} />
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="page-stack">
          <Section
            title="Prontidão mais recente"
            subtitle="Leitura consolidada do backend, alertas críticos e checks que podem bloquear operação ou promoção de estratégia."
          >
            <div className="phase4-kpi-stack">
              <div className="phase4-grid-tight">
                <StatCard
                  label="Status geral"
                  value={traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}
                  hint={emptyText(latestReadiness?.summary, 'Aguardando avaliação de readiness.')}
                />
                <StatCard
                  label="Alertas ativos"
                  value={formatNumber(activeAlerts.length || 0, 0)}
                  hint={activeAlerts.length ? 'Ver detalhes abaixo.' : 'Nenhum alerta ativo no momento.'}
                />
              </div>

              {readinessChecks.length ? (
                <div className="list-stack">
                  {readinessChecks.map((item, index) => (
                    <div key={item.key || `${item.label}-${index}`} className="list-item list-item--column">
                      <strong>{item.label || item.key}</strong>
                      <span className="muted">{item.message || item.status || 'Sem detalhe adicional.'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sem checks recentes"
                  description="Nenhuma validação de prontidão foi registrada ainda."
                />
              )}
            </div>
          </Section>

          <Section
            title="Alertas e jobs automáticos"
            subtitle="Incidentes ativos e últimas execuções do scheduler para ajudar a identificar gargalos rápido."
          >
            <div className="phase4-grid-tight">
              <div className="page-stack">
                <p className="section-subtitle">Alertas ativos</p>
                {activeAlerts.length ? (
                  <div className="list-stack">
                    {activeAlerts.slice(0, 6).map((alert, index) => (
                      <div key={alert.id || alert.alertKey || `${alert.title}-${index}`} className="list-item list-item--column">
                        <strong>
                          {alert.title || alert.alertKey} <span className="muted">• {traduzirSeveridade(alert.severity)}</span>
                        </strong>
                        <span className="muted">{alert.message || 'Sem mensagem adicional.'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhum alerta ativo"
                    description="O backend não reportou alertas neste momento."
                  />
                )}
              </div>

              <div className="page-stack">
                <p className="section-subtitle">Jobs recentes</p>
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
                  <EmptyState
                    title="Nenhum job registrado"
                    description="Ainda não há execuções automáticas registradas nesta base."
                  />
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="page-stack">
          <Section
            title="Patrimônio e exposição"
            subtitle="Resumo financeiro da carteira simulada, posição atual e custos operacionais já acumulados."
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
                hint={`Taxas ${baseCurrency} ${formatMoney(quoteFee, baseCurrency)} • Taxas BNB ${formatNumber(bnbFee, 6)} BNB`}
              />
              <StatCard
                label="Posições abertas"
                value={formatNumber(positions.length || 0, 0)}
                hint={`Exposição ${formatPercent(currentPortfolio?.exposurePct || 0)}`}
              />
            </div>

            <div className="phase4-inline-note">
              <div className="phase4-inline-pill">
                <span>Taxas {baseCurrency}</span>
                <strong>{formatMoney(quoteFee, baseCurrency)}</strong>
              </div>
              <div className="phase4-inline-pill">
                <span>Taxas BNB</span>
                <strong>{formatNumber(bnbFee, 6)} BNB</strong>
              </div>
            </div>

            <p className="section-subtitle top-gap">Posições</p>
            {positions.length ? (
              <div className="phase4-table-shell">
                <div className="phase4-table-scroll compact-scroll">
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
                        <tr key={position.id || position.symbol || `position-${index}`}>
                          <td>
                            <strong>{position.symbol}</strong>
                          </td>
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
                </div>
              </div>
            ) : (
              <EmptyState title="Nenhuma posição aberta" description="A carteira está zerada neste momento." />
            )}
          </Section>

          <Section
            title="IA, social e execução"
            subtitle="Últimos sinais publicados pela IA, ordens recentes e leitura resumida da camada social."
          >
            <div className="phase4-grid-tight">
              <div className="page-stack">
                <p className="section-subtitle">Decisões recentes</p>
                {currentDecisions.length ? (
                  <div className="list-stack">
                    {currentDecisions.slice(0, 8).map((decision, index) => (
                      <div key={decision.id || `decision-${index}`} className="list-item list-item--column">
                        <strong>
                          {decision.symbol} <span className="muted">• {traduzirAcaoDecisao(decision.action)}</span>
                        </strong>
                        <span className="muted">
                          {formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}
                        </span>
                        <span className="phase4-card-caption">
                          <strong>Razão:</strong> {decision.reason || decision.summary || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhuma decisão recente"
                    description="A IA ainda não publicou sinais nesta base."
                  />
                )}
              </div>

              <div className="page-stack">
                <p className="section-subtitle">Ordens recentes</p>
                {currentOrders.length ? (
                  <div className="list-stack">
                    {currentOrders.slice(0, 8).map((order, index) => (
                      <div key={order.id || `order-${index}`} className="list-item list-item--column">
                        <strong>
                          {order.symbol} <span className="muted">• {traduzirAcaoDecisao(order.side)}</span>
                        </strong>
                        <span className="muted">
                          {formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}
                        </span>
                        <span className="phase4-card-caption">
                          <strong>Preço:</strong> {formatMoney(order.price, baseCurrency)} • <strong>PnL:</strong>{' '}
                          {formatMoney(order.realizedPnl || 0, baseCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhuma ordem recente"
                    description="Ainda não há ordens registradas nesta base."
                  />
                )}
              </div>
            </div>

            <div className="phase4-grid-tight top-gap">
              <div className="page-stack">
                <p className="section-subtitle">Radar social</p>
                {topClassifications.length ? (
                  <div className="list-stack">
                    {topClassifications.map((item, index) => (
                      <div key={`${item.classification || 'classification'}-${index}`} className="list-item">
                        <span>{traduzirClassificacaoSocial(item.classification)}</span>
                        <Pill>{item.count}</Pill>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Sem classificações recentes"
                    description="O social worker ainda não publicou classificações consolidadas."
                  />
                )}
              </div>

              <div className="page-stack">
                <p className="section-subtitle">Saúde dos provedores</p>
                {providerStatuses.length ? (
                  <div className="list-stack">
                    {providerStatuses.map((provider, index) => (
                      <div key={provider.provider || `provider-${index}`} className="list-item list-item--column">
                        <strong>{provider.provider}</strong>
                        <span className="muted">
                          {traduzirStatusGenerico(provider.status)}
                          {provider.retryAfterSec ? ` • retry em ${provider.retryAfterSec}s` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Sem provedores carregados"
                    description="Nenhuma telemetria social foi recebida ainda."
                  />
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Runtime e treinamento"
            subtitle="Resumo do estado de runtime consumido pela IA e da última leitura do módulo de treinamento."
          >
            <div className="phase4-grid-tight">
              <StatCard
                label="Regime ativo"
                value={emptyText(trainingSummary?.runtime?.activeRegime || trainingSummary?.activeRegime, '—')}
                hint={`Qualidade ${emptyText(trainingSummary?.qualityStatus, '—')} • Drift ${emptyText(trainingSummary?.driftStatus, '—')}`}
              />
              <StatCard
                label="Última ação da IA"
                value={emptyText(trainingSummary?.runtime?.lastAction || currentDecisions?.[0]?.action, '—')}
                hint={
                  trainingSummary?.runtime?.status
                    ? `Runtime ${trainingSummary.runtime.status}`
                    : 'Aguardando atualização do runtime.'
                }
              />
            </div>

            <div className="phase4-inline-note">
              <div className="phase4-inline-pill">
                <span>Qualidade</span>
                <strong>{emptyText(trainingSummary?.qualityStatus, '—')}</strong>
              </div>
              <div className="phase4-inline-pill">
                <span>Drift</span>
                <strong>{emptyText(trainingSummary?.driftStatus, '—')}</strong>
              </div>
              <div className="phase4-inline-pill">
                <span>Experts</span>
                <strong>{formatList(trainingSummary?.runtime?.experts || trainingSummary?.experts || [], 3)}</strong>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
