import Section from '../components/Section';
import StatCard from '../components/StatCard';
import Pill from '../components/Pill';
import {
  formatDateTime,
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
  traduzirSeveridade,
  traduzirStatusGenerico,
} from '../lib/dashboard';

function renderEmpty(text) {
  return <p className="text-sm text-slate-400">{text}</p>;
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
  } = ctx || {};

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <StatCard
            key={card?.key || card?.id || `${card?.label || 'card'}-${index}`}
            {...card}
          />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Prontidão mais recente">
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={latestReadiness?.status === 'blocked' ? 'danger' : 'info'}>
                {traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}
              </Pill>
              <span className="text-sm text-slate-400">
                {latestReadiness?.createdAt
                  ? formatDateTime(latestReadiness.createdAt)
                  : 'Sem avaliação recente.'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(latestReadiness?.checks || []).slice(0, 4).map((item, index) => (
                <Pill key={item?.key || `${item?.label || 'check'}-${index}`}>
                  {item?.label || item?.key}
                </Pill>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Treinamento e drift">
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
            <p>
              Qualidade:{' '}
              <strong>
                {traduzirQualidade(trainingSummary?.qualitySummary?.qualityStatus) || '—'}
              </strong>
            </p>
            <p>
              Drift:{' '}
              <strong>
                {traduzirNivelDrift(trainingSummary?.driftSummary?.driftLevel) || '—'}
              </strong>{' '}
              • score {formatNumber(trainingSummary?.driftSummary?.driftScore || 0, 3)}
            </p>
            <p>
              Último run:{' '}
              <strong>
                {recentTrainingRuns?.[0]?.createdAt
                  ? formatDateTime(recentTrainingRuns[0].createdAt)
                  : 'Nenhum'}
              </strong>
            </p>
          </div>
        </Section>

        <Section title="Alertas ativos">
          <div className="space-y-3">
            {activeAlerts.length
              ? activeAlerts.slice(0, 6).map((alert, index) => (
                  <div
                    key={alert?.id || alert?.alertKey || `${alert?.title || 'alert'}-${index}`}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{alert?.title || alert?.alertKey}</strong>
                      <Pill tone={alert?.severity === 'critical' ? 'danger' : 'warning'}>
                        {traduzirSeveridade(alert?.severity)}
                      </Pill>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {alert?.message || 'Sem mensagem adicional.'}
                    </p>
                  </div>
                ))
              : renderEmpty('Nenhum alerta ativo no momento.')}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Portfólio">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard label="Patrimônio" value={formatMoney(currentPortfolio?.equity || 0, baseCurrency)} />
              <StatCard label="Caixa" value={formatMoney(currentPortfolio?.cashBalance || 0, baseCurrency)} />
              <StatCard
                label="PnL realizado"
                value={formatMoney(currentPortfolio?.realizedPnl || 0, baseCurrency)}
                tone={(currentPortfolio?.realizedPnl || 0) >= 0 ? 'positive' : 'danger'}
              />
            </div>
            {currentPortfolio?.positions?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="pb-2 pr-4">Símbolo</th>
                      <th className="pb-2 pr-4">Qtd</th>
                      <th className="pb-2 pr-4">Entrada</th>
                      <th className="pb-2 pr-4">Preço atual</th>
                      <th className="pb-2 pr-4">Não realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPortfolio.positions.slice(0, 8).map((position, index) => (
                      <tr key={position?.id || `${position?.symbol || 'position'}-${index}`} className="border-t border-slate-800">
                        <td className="py-2 pr-4">{position?.symbol}</td>
                        <td className="py-2 pr-4">{formatNumber(position?.quantity, 6)}</td>
                        <td className="py-2 pr-4">{formatMoney(position?.avgEntryPrice, baseCurrency)}</td>
                        <td className="py-2 pr-4">{formatMoney(position?.lastPrice, baseCurrency)}</td>
                        <td className={`py-2 pr-4 ${(position?.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatMoney(position?.unrealizedPnl || 0, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              renderEmpty('Nenhuma posição aberta.')
            )}
          </div>
        </Section>

        <Section title="Decisões recentes">
          <div className="space-y-3">
            {currentDecisions.length ? (
              currentDecisions.slice(0, 8).map((decision, index) => (
                <div
                  key={decision?.id || `${decision?.symbol || 'decision'}-${decision?.createdAt || index}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{decision?.symbol}</strong>
                    <Pill>{traduzirAcaoDecisao(decision?.action)}</Pill>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    {formatDateTime(decision?.createdAt)} • confiança {formatPercent(decision?.confidence || 0)}
                  </p>
                  <p className="mt-2 text-sm">Razão: {decision?.reason || decision?.summary || '—'}</p>
                </div>
              ))
            ) : (
              renderEmpty('Nenhuma decisão recente.')
            )}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Ordens recentes">
          <div className="space-y-3">
            {currentOrders.length ? (
              currentOrders.slice(0, 8).map((order, index) => (
                <div
                  key={order?.id || `${order?.symbol || 'order'}-${order?.createdAt || index}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{order?.symbol}</strong>
                    <Pill>{traduzirAcaoDecisao(order?.side)}</Pill>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    {formatDateTime(order?.createdAt)} • {traduzirStatusGenerico(order?.status)}
                  </p>
                  <p className="mt-2 text-sm">
                    Preço {formatMoney(order?.price, baseCurrency)} • PnL {formatMoney(order?.realizedPnl || 0, baseCurrency)}
                  </p>
                </div>
              ))
            ) : (
              renderEmpty('Nenhuma ordem recente.')
            )}
          </div>
        </Section>

        <Section title="Radar social">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
            <p>
              Fortes: {formatNumber(socialSummary?.strongCount || 0, 0)} • Promissoras: {formatNumber(socialSummary?.promisingCount || 0, 0)} • Alto risco: {formatNumber(socialSummary?.highRiskCount || 0, 0)}
            </p>
            <div className="flex flex-wrap gap-2">
              {(socialSummary?.topClassifications || []).slice(0, 4).map((item, index) => (
                <Pill key={item?.classification || `classification-${index}`}>
                  {traduzirClassificacaoSocial(item?.classification)} {item?.count}
                </Pill>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-200">Provedores</h3>
              {providerStatuses.length ? (
                providerStatuses.map((provider, index) => (
                  <div
                    key={provider?.provider || `provider-${index}`}
                    className="rounded-xl border border-slate-800 px-3 py-2"
                  >
                    {provider?.provider}: {traduzirStatusGenerico(provider?.status)}{' '}
                    {provider?.retryAfterSec ? `• retry em ${provider.retryAfterSec}s` : ''}
                  </div>
                ))
              ) : (
                renderEmpty('Sem provedores carregados.')
              )}
            </div>
          </div>
        </Section>
      </div>

      <Section title="Jobs recentes">
        <div className="space-y-3">
          {recentJobRuns.length ? (
            recentJobRuns.slice(0, 5).map((job, index) => (
              <div
                key={job?.id || `${job?.jobKey || 'job'}-${job?.createdAt || index}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm"
              >
                {traduzirChaveJob(job?.jobKey)} • {traduzirStatusGenerico(job?.status)} • {formatDateTime(job?.createdAt)}
              </div>
            ))
          ) : (
            renderEmpty('Nenhum job registrado.')
          )}
        </div>
      </Section>
    </div>
  );
}
