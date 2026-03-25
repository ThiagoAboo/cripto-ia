import Section from '../components/Section';
import StatCard from '../components/StatCard';
import Pill from '../components/Pill';
import { formatDateTime, formatList, formatMoney, formatNumber, formatPercent } from '../lib/format';
import {
  traduzirAcaoDecisao,
  traduzirClassificacaoSocial,
  traduzirModoExecucao,
  traduzirSeveridade,
  traduzirStatusGenerico,
  traduzirRunbook,
  traduzirChaveJob,
  traduzirQualidade,
  traduzirNivelDrift,
} from '../lib/dashboard';

export default function DashboardPage({ ctx }) {
  const {
    summaryCards,
    baseCurrency,
    currentPortfolio,
    currentDecisions,
    currentOrders,
    activeAlerts,
    latestReadiness,
    recentJobRuns,
    socialSummary,
    providerStatuses,
    recentTrainingRuns,
    trainingSummary,
  } = ctx;

  return (
    <div className="page-stack">
      <div className="stats-grid">
        {summaryCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="dashboard-grid">
        <div className="page-stack">
          <Section title="Saúde geral" subtitle="Resumo rápido da operação, prontidão e alertas do sistema.">
            <div className="grid two-columns">
              <div className="list-stack">
                <div className="list-item list-item--column">
                  <strong>Prontidão mais recente</strong>
                  <div className="muted">{latestReadiness?.createdAt ? formatDateTime(latestReadiness.createdAt) : 'Sem avaliação recente.'}</div>
                  <div className="button-row">
                    <Pill tone={latestReadiness?.status === 'ready' ? 'buy' : latestReadiness?.status === 'warning' ? 'warning' : 'high'}>
                      {traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}
                    </Pill>
                    {(latestReadiness?.checks || []).slice(0, 4).map((item) => (
                      <Pill key={item.key} tone={item.status === 'pass' ? 'buy' : item.status === 'warn' ? 'warning' : 'high'}>
                        {item.label || item.key}
                      </Pill>
                    ))}
                  </div>
                </div>

                <div className="list-item list-item--column">
                  <strong>Treinamento e drift</strong>
                  <div className="muted">Qualidade: {traduzirQualidade(trainingSummary?.qualitySummary?.qualityStatus) || '—'}</div>
                  <div className="muted">Drift: {traduzirNivelDrift(trainingSummary?.driftSummary?.driftLevel) || '—'} • score {formatNumber(trainingSummary?.driftSummary?.driftScore || 0, 3)}</div>
                  <div className="muted">Último run: {recentTrainingRuns?.[0]?.createdAt ? formatDateTime(recentTrainingRuns[0].createdAt) : 'Nenhum'}</div>
                </div>
              </div>

              <div className="list-stack compact-scroll">
                <strong>Alertas ativos</strong>
                {activeAlerts?.length ? activeAlerts.slice(0, 6).map((alert) => (
                  <div key={alert.alertKey} className="alert-card">
                    <div className="decision-card__row">
                      <strong>{alert.title || alert.alertKey}</strong>
                      <Pill tone={alert.severity === 'critical' ? 'high' : alert.severity === 'warning' ? 'warning' : 'info'}>
                        {traduzirSeveridade(alert.severity)}
                      </Pill>
                    </div>
                    <div className="muted">{alert.message || 'Sem mensagem adicional.'}</div>
                  </div>
                )) : <div className="muted">Nenhum alerta ativo no momento.</div>}
              </div>
            </div>
          </Section>

          <Section title="Portfólio resumido" subtitle="Visão rápida do saldo, PnL e posições abertas.">
            <div className="metric-grid">
              <div className="list-item list-item--column"><strong>Patrimônio</strong><span>{formatMoney(currentPortfolio?.equity || 0, baseCurrency)}</span></div>
              <div className="list-item list-item--column"><strong>Caixa</strong><span>{formatMoney(currentPortfolio?.cashBalance || 0, baseCurrency)}</span></div>
              <div className="list-item list-item--column"><strong>PnL realizado</strong><span className={Number(currentPortfolio?.realizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(currentPortfolio?.realizedPnl || 0, baseCurrency)}</span></div>
            </div>
            <div className="table-wrap compact-scroll">
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
                  {currentPortfolio?.positions?.length ? currentPortfolio.positions.slice(0, 8).map((position) => (
                    <tr key={position.symbol}>
                      <td>{position.symbol}</td>
                      <td>{formatNumber(position.quantity, 6)}</td>
                      <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                      <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                      <td className={Number(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(position.unrealizedPnl || 0, baseCurrency)}</td>
                    </tr>
                  )) : <tr><td colSpan="5" className="muted">Nenhuma posição aberta.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="page-stack">
          <Section title="Últimas decisões da IA" subtitle="Sinais mais recentes do meta-decisor e resultado operacional imediato.">
            <div className="list-stack compact-scroll">
              {currentDecisions?.length ? currentDecisions.slice(0, 8).map((decision) => (
                <div key={decision.id} className="decision-card">
                  <div className="decision-card__row">
                    <strong>{decision.symbol}</strong>
                    <Pill tone={decision.action === 'BUY' ? 'buy' : decision.action === 'SELL' ? 'sell' : decision.action === 'BLOCK' ? 'high' : 'info'}>
                      {traduzirAcaoDecisao(decision.action)}
                    </Pill>
                  </div>
                  <div className="muted">{formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}</div>
                  <div className="muted">Razão: {decision.reason || decision.summary || '—'}</div>
                </div>
              )) : <div className="muted">Nenhuma decisão recente.</div>}
            </div>
          </Section>

          <Section title="Ordens recentes" subtitle="Ordens paper e tentativas supervisionadas mais recentes.">
            <div className="list-stack compact-scroll">
              {currentOrders?.length ? currentOrders.slice(0, 8).map((order) => (
                <div key={order.id} className="decision-card">
                  <div className="decision-card__row">
                    <strong>{order.symbol}</strong>
                    <Pill tone={order.side === 'BUY' ? 'buy' : 'sell'}>{traduzirAcaoDecisao(order.side)}</Pill>
                  </div>
                  <div className="muted">{formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}</div>
                  <div className="muted">Preço {formatMoney(order.price, baseCurrency)} • PnL {formatMoney(order.realizedPnl || 0, baseCurrency)}</div>
                </div>
              )) : <div className="muted">Nenhuma ordem recente.</div>}
            </div>
          </Section>

          <Section title="Social e jobs" subtitle="Resumo social consultivo e jobs agendados do backend.">
            <div className="list-stack compact-scroll">
              <div className="list-item list-item--column">
                <strong>Radar social</strong>
                <div className="muted">Fortes: {formatNumber(socialSummary?.strongCount || 0, 0)} • Promissoras: {formatNumber(socialSummary?.promisingCount || 0, 0)} • Alto risco: {formatNumber(socialSummary?.highRiskCount || 0, 0)}</div>
                <div className="button-row">
                  {(socialSummary?.topClassifications || []).slice(0, 4).map((item) => (
                    <Pill key={`${item.classification}-${item.count}`} tone={item.classification === 'ALTO_RISCO' ? 'high' : item.classification === 'FORTE' ? 'buy' : 'info'}>
                      {traduzirClassificacaoSocial(item.classification)} {item.count}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="list-item list-item--column">
                <strong>Provedores</strong>
                {providerStatuses?.length ? providerStatuses.map((provider) => (
                  <div key={provider.provider} className="muted">{provider.provider}: {traduzirStatusGenerico(provider.status)} {provider.retryAfterSec ? `• retry em ${provider.retryAfterSec}s` : ''}</div>
                )) : <div className="muted">Sem provedores carregados.</div>}
              </div>

              <div className="list-item list-item--column">
                <strong>Jobs recentes</strong>
                {recentJobRuns?.length ? recentJobRuns.slice(0, 5).map((job) => (
                  <div key={job.id} className="muted">{traduzirChaveJob(job.jobKey)} • {traduzirStatusGenerico(job.status)} • {formatDateTime(job.createdAt)}</div>
                )) : <div className="muted">Nenhum job registrado.</div>}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
