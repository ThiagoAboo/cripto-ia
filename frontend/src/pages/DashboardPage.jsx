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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readFeeBreakdown(portfolio = {}) {
  const baseFee =
    Number(
      portfolio?.feesPaidQuote ??
        portfolio?.feesQuote ??
        portfolio?.feesPaid ??
        portfolio?.quoteFee ??
        0,
    ) || 0;

  const bnbFee =
    Number(
      portfolio?.feesPaidBnb ??
        portfolio?.feesBnb ??
        portfolio?.bnbFeesPaid ??
        portfolio?.bnbFee ??
        0,
    ) || 0;

  return { baseFee, bnbFee };
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

  const positions = safeArray(currentPortfolio?.positions);
  const readinessChecks = safeArray(latestReadiness?.checks).slice(0, 4);
  const topClassifications = safeArray(socialSummary?.topClassifications).slice(0, 4);
  const { baseFee, bnbFee } = readFeeBreakdown(currentPortfolio);

  return (
    <div className="page-stack">
      <Section
        title="Dashboard"
        subtitle="Visão executiva da operação, do capital simulado, dos riscos e da atividade mais recente do sistema."
      >
        <div className="stats-grid">
          {safeArray(summaryCards).map((card, index) => (
            <StatCard
              key={card.key || card.id || `${card.label || 'card'}-${index}`}
              {...card}
            />
          ))}

          <StatCard
            key="realized-pnl-fees"
            label="PnL realizado"
            value={formatMoney(currentPortfolio?.realizedPnl || 0, baseCurrency)}
            tone={Number(currentPortfolio?.realizedPnl || 0) >= 0 ? 'positive' : 'danger'}
            hint={`Taxas ${baseCurrency}: ${formatMoney(baseFee, baseCurrency)} • Taxas BNB: ${formatNumber(bnbFee, 6)} BNB`}
          />
        </div>
      </Section>

      <div className="dashboard-grid">
        <div className="page-stack">
          <Section
            title="Prontidão e alertas"
            subtitle={`Status geral: ${traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}`}
          >
            <div className="page-stack">
              {readinessChecks.length ? (
                readinessChecks.map((item, index) => (
                  <div className="list-row" key={item.key || item.label || index}>
                    <strong>{item.label || item.key}</strong>
                    <span>{item.message || item.status || 'Sem detalhe adicional.'}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Nenhuma validação de prontidão foi registrada ainda.</div>
              )}
            </div>
          </Section>

          <Section title="Alertas ativos">
            <div className="page-stack">
              {activeAlerts.length ? (
                activeAlerts.slice(0, 6).map((alert, index) => (
                  <div className="list-row" key={alert.id || alert.alertKey || index}>
                    <strong>{alert.title || alert.alertKey}</strong>
                    <span>
                      {traduzirSeveridade(alert.severity)} • {alert.message || 'Sem mensagem adicional.'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">O backend não reportou alertas neste momento.</div>
              )}
            </div>
          </Section>

          <Section title="Jobs recentes">
            <div className="page-stack">
              {recentJobRuns.length ? (
                recentJobRuns.slice(0, 5).map((job, index) => (
                  <div className="list-row" key={job.id || `${job.jobKey}-${job.createdAt || index}`}>
                    <strong>{traduzirChaveJob(job.jobKey)}</strong>
                    <span>
                      {traduzirStatusGenerico(job.status)} • {formatDateTime(job.createdAt)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Ainda não há execuções automáticas registradas nesta base.</div>
              )}
            </div>
          </Section>
        </div>

        <div className="page-stack">
          <Section title="Posições">
            {positions.length ? (
              <div className="table-scroll">
                <table className="data-table">
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
                      <tr key={position.symbol || index}>
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
              </div>
            ) : (
              <div className="empty-state">A carteira está zerada neste momento.</div>
            )}
          </Section>

          <Section title="Decisões recentes">
            <div className="page-stack">
              {currentDecisions.length ? (
                currentDecisions.slice(0, 8).map((decision, index) => (
                  <div className="list-row" key={decision.id || `${decision.symbol}-${decision.createdAt || index}`}>
                    <strong>
                      {decision.symbol} • {traduzirAcaoDecisao(decision.action)}
                    </strong>
                    <span>
                      {formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}
                    </span>
                    <span>Razão: {decision.reason || decision.summary || '—'}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">A IA ainda não publicou sinais nesta base.</div>
              )}
            </div>
          </Section>

          <Section title="Ordens recentes">
            <div className="page-stack">
              {currentOrders.length ? (
                currentOrders.slice(0, 8).map((order, index) => (
                  <div className="list-row" key={order.id || `${order.symbol}-${order.createdAt || index}`}>
                    <strong>
                      {order.symbol} • {traduzirAcaoDecisao(order.side)}
                    </strong>
                    <span>
                      {formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}
                    </span>
                    <span>
                      Preço: {formatMoney(order.price, baseCurrency)} • PnL: {formatMoney(order.realizedPnl || 0, baseCurrency)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Ainda não há ordens registradas nesta base.</div>
              )}
            </div>
          </Section>

          <Section title="Radar social">
            <div className="pill-row">
              {topClassifications.length ? (
                topClassifications.map((item, index) => (
                  <Pill key={`${item.classification}-${index}`}>
                    {traduzirClassificacaoSocial(item.classification)} {item.count}
                  </Pill>
                ))
              ) : (
                <div className="empty-state">Sem classificações recentes.</div>
              )}
            </div>
          </Section>

          <Section title="Saúde dos provedores">
            <div className="page-stack">
              {providerStatuses.length ? (
                providerStatuses.map((provider, index) => (
                  <div className="list-row" key={provider.provider || index}>
                    <strong>{provider.provider}</strong>
                    <span>
                      {traduzirStatusGenerico(provider.status)}
                      {provider.retryAfterSec ? ` • retry em ${provider.retryAfterSec}s` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Nenhuma telemetria social foi recebida ainda.</div>
              )}
            </div>
          </Section>

          <Section title="Treinamento">
            <div className="stats-grid">
              <StatCard label="Qualidade" value={traduzirQualidade(emptyText(trainingSummary?.qualityStatus, '—'))} />
              <StatCard label="Drift" value={traduzirNivelDrift(emptyText(trainingSummary?.driftStatus, '—'))} />
              <StatCard label="Experts" value={formatList(trainingSummary?.runtime?.experts || trainingSummary?.experts || [], 3)} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
