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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function isPlaceholderText(value) {
  const text = normalizeText(value).toLowerCase();
  return [
    '',
    '—',
    '-',
    '–',
    '?',
    'n/a',
    'na',
    'null',
    'undefined',
    'none',
  ].includes(text);
}

function isMeaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const text = normalizeText(value);
  return Boolean(text && !isPlaceholderText(text));
}

function pickFirst(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
    if (isMeaningful(value) || value === 0 || value === false) return value;
  }
  return undefined;
}

function toText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    const joined = value.map((item) => toText(item, '')).filter(Boolean).join(', ');
    return joined || fallback;
  }
  if (typeof value === 'object') {
    const preferred = [
      'label',
      'status',
      'message',
      'summary',
      'reason',
      'value',
    ];
    const parts = preferred
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => toText(value[key], ''))
      .filter(Boolean);
    return parts.join(' • ') || fallback;
  }
  return String(value);
}

function formatMaybeNumber(value, digits = 2, fallback = '—') {
  if (!isMeaningful(value) && value !== 0) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatNumber(numeric, digits) : fallback;
}

function formatMaybePercent(value, digits = 2, fallback = '—') {
  if (!isMeaningful(value) && value !== 0) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatPercent(numeric, digits) : fallback;
}

function formatMaybeMoney(value, currency = 'USDT', fallback = '—') {
  if (!isMeaningful(value) && value !== 0) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatMoney(numeric, currency) : fallback;
}

function formatOptionalDateTime(value) {
  const formatted = formatDateTime(value);
  return isMeaningful(formatted) ? formatted : '';
}

function formatOptionalPercent(value, digits = 2) {
  if (!isMeaningful(value) && value !== 0) return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatPercent(numeric, digits) : '';
}

function joinMetaParts(parts = []) {
  return parts.filter(isMeaningful).join(' • ');
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

function readLossStreak(controlState = {}, portfolio = {}) {
  const raw = pickFirst(
    controlState?.lossStreak,
    controlState?.currentLossStreak,
    controlState?.consecutiveLosses,
    portfolio?.lossStreak,
    portfolio?.consecutiveLosses,
  );
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function extractOrderReason(order = {}) {
  return pickFirst(
    order?.rejectionReason,
    order?.rejectReason,
    order?.rejectMessage,
    order?.failureReason,
    order?.errorMessage,
    order?.error,
    order?.reason,
    order?.summary,
    order?.notes,
    order?.note,
  );
}

function buildProviderDetail(provider = {}) {
  const providerName = toText(provider.provider || provider.name || provider.source, 'Provedor');
  const statusLabel = toText(
    traduzirStatusGenerico(provider.status || provider.health || provider.state),
    'Sem status',
  );
  const parts = [statusLabel];
  if (Number(provider.retryAfterSec) > 0) {
    parts.push(`retry em ${formatNumber(provider.retryAfterSec, 0)}s`);
  }
  const note = pickFirst(provider.message, provider.reason, provider.summary);
  if (isMeaningful(note)) parts.push(toText(note));
  return {
    providerName,
    detail: parts.join(' • '),
  };
}

function buildTrainingMetrics(trainingSummary = {}) {
  const qualityStatus = pickFirst(
    trainingSummary?.qualityStatus,
    trainingSummary?.latestQualityStatus,
    trainingSummary?.latestQuality?.qualityStatus,
    trainingSummary?.latestQualityReport?.qualityStatus,
  );
  const qualityScore = pickFirst(
    trainingSummary?.qualityScore,
    trainingSummary?.latestQuality?.qualityScore,
    trainingSummary?.latestQualityReport?.qualityScore,
  );

  const driftStatus = pickFirst(
    trainingSummary?.driftStatus,
    trainingSummary?.latestDriftStatus,
    trainingSummary?.latestDrift?.driftStatus,
    trainingSummary?.latestDriftReport?.driftStatus,
  );
  const driftScore = pickFirst(
    trainingSummary?.driftScore,
    trainingSummary?.latestDrift?.driftScore,
    trainingSummary?.latestDriftReport?.driftScore,
  );

  const activeExperts = pickFirst(
    Array.isArray(trainingSummary?.activeExperts)
      ? trainingSummary.activeExperts.length
      : undefined,
    Array.isArray(trainingSummary?.runtime?.activeExperts)
      ? trainingSummary.runtime.activeExperts.length
      : undefined,
    trainingSummary?.activeExpertsCount,
    trainingSummary?.runtime?.activeExpertsCount,
    trainingSummary?.expertsActive,
  );

  return [
    isMeaningful(qualityScore) || isMeaningful(qualityStatus)
      ? {
          key: 'quality',
          label: 'Qualidade',
          value: formatMaybeNumber(qualityScore, 4),
          hint: isMeaningful(qualityStatus)
            ? traduzirQualidade(qualityStatus)
            : 'Último score disponível.',
        }
      : null,
    isMeaningful(driftScore) || isMeaningful(driftStatus)
      ? {
          key: 'drift',
          label: 'Drift',
          value: formatMaybeNumber(driftScore, 4),
          hint: isMeaningful(driftStatus)
            ? traduzirNivelDrift(driftStatus)
            : 'Última leitura de drift.',
        }
      : null,
    isMeaningful(activeExperts) || activeExperts === 0
      ? {
          key: 'experts',
          label: 'Experts ativos',
          value: formatMaybeNumber(activeExperts, 0),
          hint:
            Number(activeExperts) > 0
              ? 'Experts em uso no runtime atual.'
              : 'Nenhum expert ativo neste snapshot.',
        }
      : null,
  ].filter(Boolean);
}

export default function DashboardPage({ ctx }) {
  const {
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
    trainingSummary = {},
    controlState,
    goToPage,
  } = ctx;

  const positions = safeArray(currentPortfolio?.positions);
  const readinessChecks = safeArray(latestReadiness?.checks).slice(0, 4);
  const alerts = safeArray(activeAlerts).slice(0, 4);
  const cooldowns = safeArray(controlState?.activeCooldowns).slice(0, 6);
  const decisions = safeArray(currentDecisions).slice(0, 6);
  const orders = safeArray(currentOrders).slice(0, 6);
  const topClassifications = safeArray(socialSummary?.topClassifications)
    .filter((item) => Number(item?.count || 0) > 0)
    .slice(0, 5);
  const providers = safeArray(providerStatuses).slice(0, 6);
  const trainingRuns = safeArray(recentTrainingRuns).slice(0, 4);
  const jobRuns = safeArray(recentJobRuns).slice(0, 5);

  const { baseFee, bnbFee } = readFeeBreakdown(currentPortfolio);
  const realizedPnl = Number(currentPortfolio?.realizedPnl || 0);
  const equity = Number(currentPortfolio?.equity || 0);
  const cashBalance = Number(currentPortfolio?.cashBalance || 0);
  const lossStreak = readLossStreak(controlState, currentPortfolio);
  const strongSocialCount = topClassifications
    .filter((item) => String(item.classification || '').toUpperCase() === 'FORTE')
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const trainingMetrics = buildTrainingMetrics(trainingSummary);

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
        <>
          <div>Taxas {baseCurrency}: {formatMoney(baseFee, baseCurrency)}</div>
          <div>Taxas BNB: {formatNumber(bnbFee, 6)} BNB</div>
        </>
      ),
    },
    {
      key: 'bot-control',
      label: 'Controle do bot',
      value: controlState?.isPaused ? 'Pausado' : 'Ativo',
      tone:
        controlState?.isPaused || controlState?.emergencyStop ? 'warning' : 'positive',
      hint: controlState?.emergencyStop
        ? 'Parada de emergência ativa.'
        : controlState?.maintenanceMode
          ? 'Modo de manutenção ligado.'
          : cooldowns.length
            ? `${cooldowns.length} bloqueio(s) temporário(s) ativo(s).`
            : 'Sem bloqueios globais.',
    },
  ];

  return (
    <div className="page-stack">
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

      <div className="grid two-columns">
        <Section
          title="Cooldowns e proteção"
          subtitle="Travas ativas, streak de perdas e proteção operacional do bot."
          actions={
            <button className="btn btn--secondary" onClick={() => goToPage('execucao')}>
              Abrir execução
            </button>
          }
        >
          <div className="mini-stat-row">
            <StatCard
              label="Cooldowns ativos"
              value={formatNumber(cooldowns.length, 0)}
              tone={cooldowns.length > 0 ? 'warning' : 'default'}
              hint={
                cooldowns.length
                  ? `${cooldowns.length} bloqueio(s) temporário(s) aberto(s) agora.`
                  : 'Sem travas abertas neste momento.'
              }
            />
            <StatCard
              label="Loss streak"
              value={formatNumber(lossStreak, 0)}
              tone={lossStreak > 0 ? 'warning' : 'default'}
              hint={
                lossStreak > 0
                  ? 'Monitorado pela camada de risco operacional.'
                  : 'Sem sequência recente de perdas.'
              }
            />
          </div>

          {cooldowns.length ? (
            <div className="list-stack compact-scroll">
              {cooldowns.map((item, index) => (
                <div
                  key={`${toText(item.symbol, 'cooldown')}-${index}`}
                  className="list-card"
                >
                  <strong>{toText(item.symbol, 'Cooldown')}</strong>
                  <p>
                    Até {formatDateTime(item.activeUntil || item.expiresAt)}
                    {isMeaningful(item.reason) ? ` • ${toText(item.reason)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Sem travas abertas neste momento.
            </div>
          )}
        </Section>

        <Section
          title="Radar social"
          subtitle="Sinais consultivos, classificações fortes e saúde dos provedores sociais."
          actions={
            <button className="btn btn--secondary" onClick={() => goToPage('social')}>
              Abrir social
            </button>
          }
        >
          <div className="mini-stat-row">
            <StatCard
              label="Fortes"
              value={formatNumber(strongSocialCount, 0)}
              tone={strongSocialCount > 0 ? 'positive' : 'default'}
              hint={
                strongSocialCount > 0
                  ? 'Classificações fortes no radar atual.'
                  : 'Nenhuma classificação forte recente.'
              }
            />
            <StatCard
              label="Providers"
              value={formatNumber(providers.length, 0)}
              tone={providers.length > 0 ? 'positive' : 'default'}
              hint={
                providers.length > 0
                  ? 'Fontes sociais monitoradas.'
                  : 'Nenhuma telemetria social recebida ainda.'
              }
            />
          </div>

          {topClassifications.length ? (
            <div className="pill-cloud">
              {topClassifications.map((item, index) => (
                <Pill key={`${item.classification || 'social'}-${index}`} tone="info">
                  {traduzirClassificacaoSocial(item.classification)} • {formatNumber(item.count, 0)}
                </Pill>
              ))}
            </div>
          ) : null}

          {providers.length ? (
            <div className="list-stack compact-scroll">
              {providers.map((provider, index) => {
                const entry = buildProviderDetail(provider);
                return (
                  <div key={`${entry.providerName}-${index}`} className="list-row">
                    <strong>{entry.providerName}</strong>
                    <span>{entry.detail}</span>
                  </div>
                );
              })}
            </div>
          ) : topClassifications.length ? null : (
            <div className="empty-state">Sem classificações recentes.</div>
          )}
        </Section>
      </div>

      <div className="grid two-columns">
        <Section
          title="Prontidão e alertas"
          subtitle="Checks operacionais recentes e alertas ativos que merecem atenção."
          actions={
            <button className="btn btn--secondary" onClick={() => goToPage('governanca')}>
              Abrir governança
            </button>
          }
        >
          {readinessChecks.length ? (
            <div className="list-stack compact-scroll">
              {readinessChecks.map((item, index) => (
                <div
                  key={`${toText(item.label || item.key, 'check')}-${index}`}
                  className="alert-card"
                >
                  <div className="alert-card__title-row">
                    <strong>{toText(item.label || item.key, 'Check')}</strong>
                    <Pill tone={String(item.status || '').toLowerCase() === 'ok' ? 'success' : 'warning'}>
                      {traduzirStatusGenerico(item.status)}
                    </Pill>
                  </div>
                  <p>{toText(item.message || item.detail || 'Sem detalhe adicional.')}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nenhuma validação de prontidão foi registrada ainda.</div>
          )}

          {alerts.length ? (
            <div className="list-stack compact-scroll">
              {alerts.map((alert, index) => (
                <div key={`${toText(alert.title || alert.alertKey, 'alerta')}-${index}`} className="alert-card">
                  <div className="alert-card__title-row">
                    <strong>{toText(alert.title || alert.alertKey, 'Alerta')}</strong>
                    <Pill tone={String(alert.severity || '').toLowerCase() === 'critical' ? 'danger' : 'warning'}>
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
          title="Treinamento e runtime"
          subtitle="Resumo executivo da IA, drift recente, jobs e últimas execuções do treinamento."
          actions={
            <button className="btn btn--secondary" onClick={() => goToPage('treinamento')}>
              Abrir treinamento
            </button>
          }
        >
          {trainingMetrics.length ? (
            <div className="mini-stat-row">
              {trainingMetrics.map((metric) => (
                <StatCard
                  key={metric.key}
                  label={metric.label}
                  value={metric.value}
                  hint={metric.hint}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem snapshot executivo do treinamento neste momento.</div>
          )}

          {trainingRuns.length ? (
            <div className="list-stack compact-scroll">
              {trainingRuns.map((run, index) => {
                const trainingMeta = joinMetaParts([
                  formatOptionalDateTime(run.createdAt),
                  toText(traduzirStatusGenerico(run.status), ''),
                ]);
                const trainingSummaryText = pickFirst(
                  run.summary,
                  run.reason,
                  run.message,
                  run.description,
                );

                return (
                  <div key={`${toText(run.label || run.objective, 'treino')}-${index}`} className="list-card">
                    <strong>{toText(run.label || run.objective || 'Execução de treinamento')}</strong>
                    {isMeaningful(trainingMeta) ? <p>{trainingMeta}</p> : null}
                    {isMeaningful(trainingSummaryText) ? (
                      <p>{toText(trainingSummaryText)}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {jobRuns.length ? (
            <div className="list-stack compact-scroll">
              {jobRuns.map((job, index) => {
                const jobMeta = joinMetaParts([
                  toText(traduzirStatusGenerico(job.status), ''),
                  formatOptionalDateTime(job.createdAt || job.startedAt || job.finishedAt),
                ]);

                return (
                  <div key={`${toText(job.jobKey, 'job')}-${index}`} className="list-row">
                    <strong>{traduzirChaveJob(job.jobKey)}</strong>
                    {isMeaningful(jobMeta) ? <span>{jobMeta}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : trainingRuns.length ? null : (
            <div className="empty-state">Ainda não há execuções automáticas registradas nesta base.</div>
          )}
        </Section>
      </div>

      <Section
        title="Posições e atividade"
        subtitle="Posições abertas, decisões recentes e ordens já registradas na base."
        actions={
          <button className="btn btn--secondary" onClick={() => goToPage('operacoes')}>
            Abrir operações
          </button>
        }
      >
        {positions.length ? (
          <div className="table-wrap compact-scroll">
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
                {positions.slice(0, 8).map((position, index) => {
                  const unrealizedPnl = Number(position?.unrealizedPnl || 0);
                  return (
                    <tr key={`${toText(position.symbol, 'posicao')}-${index}`}>
                      <td>{toText(position.symbol)}</td>
                      <td>{formatMaybeNumber(position.quantity, 6)}</td>
                      <td>{formatMaybeMoney(position.avgEntryPrice, baseCurrency)}</td>
                      <td>{formatMaybeMoney(position.lastPrice, baseCurrency)}</td>
                      <td className={unrealizedPnl >= 0 ? 'text-positive' : 'text-danger'}>
                        {formatMaybeMoney(unrealizedPnl, baseCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">A carteira está zerada neste momento.</div>
        )}

        <div className="dual-list-grid">
          <div>
            <h3 className="subsection-title">Decisões recentes</h3>
            {decisions.length ? (
              <div className="list-stack compact-scroll">
                {decisions.map((decision, index) => {
                  const decisionMeta = joinMetaParts([
                    formatOptionalDateTime(decision.createdAt),
                    isMeaningful(decision.confidence)
                      ? `confiança ${formatOptionalPercent(decision.confidence, 2)}`
                      : '',
                  ]);
                  const decisionDetail = pickFirst(
                    decision.reason,
                    decision.summary,
                    decision.note,
                    decision.notes,
                  );

                  return (
                    <div key={`${toText(decision.symbol, 'decisao')}-${index}`} className="decision-card">
                      <strong>
                        {toText(decision.symbol)} • {traduzirAcaoDecisao(decision.action)}
                      </strong>
                      {isMeaningful(decisionMeta) ? (
                        <div className="muted">{decisionMeta}</div>
                      ) : null}
                      <div>
                        {isMeaningful(decisionDetail)
                          ? toText(decisionDetail)
                          : 'Sem justificativa detalhada.'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">A IA ainda não publicou sinais nesta base.</div>
            )}
          </div>

          <div>
            <h3 className="subsection-title">Ordens recentes</h3>
            {orders.length ? (
              <div className="list-stack compact-scroll">
                {orders.map((order, index) => {
                  const orderReason = extractOrderReason(order);
                  const status = toText(traduzirStatusGenerico(order.status), 'Sem status');
                  return (
                    <div key={`${toText(order.symbol, 'ordem')}-${index}`} className="decision-card">
                      <strong>
                        {toText(order.symbol)} • {traduzirAcaoDecisao(order.side)}
                      </strong>
                      {isMeaningful(joinMetaParts([
                        formatOptionalDateTime(order.createdAt),
                        status,
                      ])) ? (
                        <div className="muted">
                          {joinMetaParts([
                            formatOptionalDateTime(order.createdAt),
                            status,
                          ])}
                        </div>
                      ) : null}
                      <div className="muted">
                        Preço: {formatMaybeMoney(order.price, baseCurrency)} • PnL:{' '}
                        {formatMaybeMoney(order.realizedPnl, baseCurrency)}
                      </div>
                      {isMeaningful(orderReason) ? (
                        <div>Motivo: {toText(orderReason)}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">Ainda não há ordens registradas nesta base.</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
