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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map((item) => toText(item, '')).filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') {
    const preferred = ['label', 'status', 'mode', 'message', 'value'];
    const parts = preferred
      .filter((key) => key in value)
      .map((key) => `${key}: ${toText(value[key], '')}`)
      .filter(Boolean);
    return parts.join(' • ') || `Objeto com ${Object.keys(value).length} campo(s)`;
  }
  return String(value);
}

function readFeeBreakdown(portfolio = {}) {
  const baseFee = Number(
    portfolio?.feesPaidQuote ?? portfolio?.feesQuote ?? portfolio?.feesPaid ?? portfolio?.quoteFee ?? 0,
  ) || 0;
  const bnbFee = Number(
    portfolio?.feesPaidBnb ?? portfolio?.feesBnb ?? portfolio?.bnbFeesPaid ?? portfolio?.bnbFee ?? 0,
  ) || 0;

  return { baseFee, bnbFee };
}

function ShortcutButton({ label, hint, onClick }) {
  return (
    <button type="button" className="shortcut-card" onClick={onClick}>
      <strong>{label}</strong>
      <span>{hint}</span>
    </button>
  );
}

export default function DashboardPage({ ctx }) {
  const {
    summaryCards = [],
    health,
    baseCurrency = 'USDT',
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
    controlState,
    goToPage,
  } = ctx;

  const positions = safeArray(currentPortfolio?.positions);
  const readinessChecks = safeArray(latestReadiness?.checks).slice(0, 4);
  const topClassifications = safeArray(socialSummary?.topClassifications).slice(0, 4);
  const cooldowns = safeArray(controlState?.activeCooldowns).slice(0, 6);
  const { baseFee, bnbFee } = readFeeBreakdown(currentPortfolio);

  const realizedPnl = Number(currentPortfolio?.realizedPnl || 0);
  const equity = Number(currentPortfolio?.equity || 0);
  const cashBalance = Number(currentPortfolio?.cashBalance || 0);
  const strongSocialCount = topClassifications
    .filter((item) => String(item.classification || '').toUpperCase() === 'FORTE')
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const topCards = [
    {
      key: 'backend',
      label: 'Backend',
      value: health?.ok ? 'Online' : 'Indisponível',
      tone: health?.ok ? 'positive' : 'danger',
      hint: `Última checagem: ${formatDateTime(health?.timestamp || health?.checkedAt)}`,
    },
    {
      key: 'equity',
      label: 'Patrimônio simulado',
      value: formatMoney(equity, baseCurrency),
      hint: `Caixa disponível: ${formatMoney(cashBalance, baseCurrency)}`,
    },
    {
      key: 'pnl',
      label: 'PnL realizado',
      value: formatMoney(realizedPnl, baseCurrency),
      tone: realizedPnl >= 0 ? 'positive' : 'danger',
      hint: (
        <div className="stat-card__stacked-hint">
          <span>Taxas {baseCurrency}: {formatMoney(baseFee, baseCurrency)}</span>
          <span>Taxas BNB: {formatNumber(bnbFee, 6)} BNB</span>
        </div>
      ),
    },
    {
      key: 'bot-control',
      label: 'Controle do bot',
      value: controlState?.isPaused ? 'Pausado' : 'Ativo',
      tone: controlState?.isPaused || controlState?.emergencyStop ? 'warning' : 'positive',
      hint: controlState?.emergencyStop
        ? 'Parada de emergência ativa.'
        : controlState?.maintenanceMode
          ? 'Modo de manutenção ligado.'
          : 'Sem bloqueios globais.',
    },
  ];

  const extraCards = safeArray(summaryCards)
    .filter((card) => !['Backend', 'Patrimônio simulado', 'PnL realizado', 'Controle do bot'].includes(card.label))
    .map((card, index) => ({
      key: card.key || `${String(card.label || 'resumo').toLowerCase().replace(/\s+/g, '-')}-${index}`,
      label: toText(card.label),
      value: toText(card.value),
      hint: toText(card.hint, ''),
      tone: card.tone || 'default',
    }));

  return (
    <div className="page-stack">
      <Section
        title="Resumo executivo"
        subtitle="Visão mais limpa dos indicadores principais, atalhos rápidos e leitura operacional do momento."
      >
        <div className="stats-grid stats-grid--top">
          {topCards.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
            />
          ))}
        </div>

        {extraCards.length ? (
          <div className="stats-grid stats-grid--secondary">
            {extraCards.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
              />
            ))}
          </div>
        ) : null}

        <div className="shortcut-grid">
          <ShortcutButton label="Mercado" hint="Ver pares, mini gráficos e variação em 24h." onClick={() => goToPage('mercado')} />
          <ShortcutButton label="Operações" hint="Acompanhar carteira, ordens e backtests." onClick={() => goToPage('operacoes')} />
          <ShortcutButton label="Execução" hint="Controlar o bot e supervisionar o runtime." onClick={() => goToPage('execucao')} />
          <ShortcutButton label="Governança" hint="Checar prontidão, alertas e incidentes." onClick={() => goToPage('governanca')} />
          <ShortcutButton label="Social" hint="Ver o radar consultivo e os provedores." onClick={() => goToPage('social')} />
          <ShortcutButton label="Treinamento" hint="Ajustar regime, drift e experts." onClick={() => goToPage('treinamento')} />
        </div>
      </Section>

      <div className="dashboard-grid">
        <div className="page-stack">
          <Section
            title="Cooldowns e proteção"
            subtitle="Travas ativas, streak de perdas e proteção operacional do bot."
            actions={<button type="button" className="btn btn--secondary" onClick={() => goToPage('execucao')}>Abrir execução</button>}
          >
            <div className="mini-stat-row">
              <StatCard label="Cooldowns ativos" value={cooldowns.length} hint="Bloqueios temporários abertos agora." />
              <StatCard
                label="Loss streak"
                value={Number(controlState?.guardrails?.lossStreak || 0)}
                hint="Monitorado pela camada de risco operacional."
                tone={Number(controlState?.guardrails?.lossStreak || 0) > 0 ? 'warning' : 'default'}
              />
            </div>

            {cooldowns.length ? (
              <div className="list-stack">
                {cooldowns.map((item, index) => (
                  <div className="list-row" key={`${item.symbol || 'cooldown'}-${item.activeUntil || item.expiresAt || index}`}>
                    <strong>{toText(item.symbol)}</strong>
                    <span>Até {formatDateTime(item.activeUntil || item.expiresAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Sem travas abertas neste momento.</div>
            )}
          </Section>

          <Section
            title="Prontidão e alertas"
            subtitle="Checks operacionais recentes e alertas ativos que merecem atenção."
            actions={<button type="button" className="btn btn--secondary" onClick={() => goToPage('governanca')}>Abrir governança</button>}
          >
            {readinessChecks.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Detalhe</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readinessChecks.map((item, index) => (
                      <tr key={`${item.key || item.label || 'readiness'}-${index}`}>
                        <td>{toText(item.label || item.key)}</td>
                        <td>{toText(item.message || item.status || 'Sem detalhe adicional.')}</td>
                        <td><Pill tone={String(item.status || '').toLowerCase().includes('fail') ? 'danger' : 'info'}>{traduzirStatusGenerico(item.status)}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">Nenhuma validação de prontidão foi registrada ainda.</div>
            )}

            {activeAlerts.length ? (
              <div className="list-stack list-stack--spaced">
                {activeAlerts.slice(0, 4).map((alert, index) => (
                  <div className="alert-card" key={`${alert.alertKey || alert.title || 'alert'}-${index}`}>
                    <div className="alert-card__title-row">
                      <strong>{toText(alert.title || alert.alertKey)}</strong>
                      <Pill tone={String(alert.severity || '').toLowerCase().includes('crit') ? 'danger' : 'warning'}>
                        {traduzirSeveridade(alert.severity)}
                      </Pill>
                    </div>
                    <p>{toText(alert.message || 'Sem mensagem adicional.')}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="Posições e atividade"
            subtitle="Posições abertas, decisões recentes e ordens já registradas na base."
            actions={<button type="button" className="btn btn--secondary" onClick={() => goToPage('operacoes')}>Abrir operações</button>}
          >
            {positions.length ? (
              <div className="table-wrap">
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
                      <tr key={`${position.symbol || 'position'}-${index}`}>
                        <td>{toText(position.symbol)}</td>
                        <td>{formatNumber(position.quantity, 6)}</td>
                        <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                        <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                        <td className={Number(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>
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

            <div className="dual-list-grid">
              <div>
                <h3 className="subsection-title">Decisões recentes</h3>
                {currentDecisions.length ? (
                  <div className="list-stack">
                    {currentDecisions.slice(0, 6).map((decision, index) => (
                      <div className="list-card" key={`${decision.id || decision.symbol || 'decision'}-${index}`}>
                        <strong>{toText(decision.symbol)} • {traduzirAcaoDecisao(decision.action)}</strong>
                        <span>{formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}</span>
                        <p>{toText(decision.reason || decision.summary || 'Sem justificativa detalhada.')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">A IA ainda não publicou sinais nesta base.</div>
                )}
              </div>

              <div>
                <h3 className="subsection-title">Ordens recentes</h3>
                {currentOrders.length ? (
                  <div className="list-stack">
                    {currentOrders.slice(0, 6).map((order, index) => (
                      <div className="list-card" key={`${order.id || order.symbol || 'order'}-${index}`}>
                        <strong>{toText(order.symbol)} • {traduzirAcaoDecisao(order.side)}</strong>
                        <span>{formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}</span>
                        <p>
                          Preço: {formatMoney(order.price, baseCurrency)} • PnL: {formatMoney(order.realizedPnl || 0, baseCurrency)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Ainda não há ordens registradas nesta base.</div>
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="page-stack">
          <Section
            title="Radar social"
            subtitle="Sinais consultivos, classificações principais e saúde dos provedores sociais."
            actions={<button type="button" className="btn btn--secondary" onClick={() => goToPage('social')}>Abrir social</button>}
          >
            <div className="mini-stat-row">
              <StatCard label="Fortes" value={strongSocialCount} hint="Classificações fortes no radar atual." tone={strongSocialCount > 0 ? 'positive' : 'default'} />
              <StatCard label="Providers" value={providerStatuses.length} hint="Fontes sociais monitoradas." />
            </div>

            {topClassifications.length ? (
              <div className="pill-cloud">
                {topClassifications.map((item, index) => (
                  <Pill key={`${item.classification || 'class'}-${index}`} tone={String(item.classification || '').toLowerCase().includes('risco') ? 'danger' : 'info'}>
                    {traduzirClassificacaoSocial(item.classification)} • {item.count}
                  </Pill>
                ))}
              </div>
            ) : (
              <div className="empty-state">Sem classificações recentes.</div>
            )}

            {providerStatuses.length ? (
              <div className="list-stack">
                {providerStatuses.map((provider, index) => (
                  <div className="list-row" key={`${provider.provider || 'provider'}-${index}`}>
                    <strong>{toText(provider.provider)}</strong>
                    <span>
                      {traduzirStatusGenerico(provider.status)}
                      {provider.retryAfterSec ? ` • retry em ${provider.retryAfterSec}s` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhuma telemetria social foi recebida ainda.</div>
            )}
          </Section>

          <Section
            title="Treinamento e runtime"
            subtitle="Resumo do estado da IA, drift recente, jobs e últimas execuções do treinamento."
            actions={<button type="button" className="btn btn--secondary" onClick={() => goToPage('treinamento')}>Abrir treinamento</button>}
          >
            <div className="mini-stat-row">
              <StatCard label="Qualidade" value={traduzirQualidade(trainingSummary?.qualityStatus || '—')} hint="Status atual do treinamento." />
              <StatCard label="Drift" value={traduzirNivelDrift(trainingSummary?.driftStatus || '—')} hint="Coerência recente do runtime." />
            </div>

            <StatCard
              label="Experts ativos"
              value={formatList(trainingSummary?.runtime?.experts || trainingSummary?.experts || [])}
              hint="Resumo dos experts em uso no runtime atual."
            />

            {recentTrainingRuns.length ? (
              <div className="list-stack list-stack--spaced">
                {recentTrainingRuns.slice(0, 4).map((run, index) => (
                  <div className="list-card" key={`${run.id || run.label || 'train-run'}-${index}`}>
                    <strong>{toText(run.label || run.objective || 'Execução de treinamento')}</strong>
                    <span>{formatDateTime(run.createdAt)} • {traduzirStatusGenerico(run.status)}</span>
                    <p>{toText(run.summary || run.reason || 'Sem resumo detalhado.')}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {recentJobRuns.length ? (
              <div className="list-stack">
                {recentJobRuns.slice(0, 5).map((job, index) => (
                  <div className="list-row" key={`${job.id || job.jobKey || 'job'}-${index}`}>
                    <strong>{traduzirChaveJob(job.jobKey)}</strong>
                    <span>{traduzirStatusGenerico(job.status)} • {formatDateTime(job.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Ainda não há execuções automáticas registradas nesta base.</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
