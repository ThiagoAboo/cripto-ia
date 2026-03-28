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

function pickDateCandidate(record = {}) {
  return pickFirst(
    record?.finishedAt,
    record?.completedAt,
    record?.endedAt,
    record?.executedAt,
    record?.runAt,
    record?.startedAt,
    record?.createdAt,
    record?.created_at,
    record?.decidedAt,
    record?.updatedAt,
    record?.timestamp,
    record?.at,
  );
}


function buildSummaryList(items = [], emptyLabel = 'Sem detalhe adicional.') {
  if (!items.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="list-stack compact-scroll">
      {items.map((item, index) => (
        <div key={`${item.key || item.title || 'item'}-${index}`} className="list-card">
          <strong>{item.title}</strong>
          {isMeaningful(item.meta) ? <p>{item.meta}</p> : null}
          {isMeaningful(item.detail) ? <p>{item.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

function buildAlertCardList(items = [], emptyLabel = 'Sem detalhe adicional.') {
  if (!items.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="list-stack compact-scroll">
      {items.map((item, index) => (
        <div key={`${item.key || item.title || 'item'}-${index}`} className="alert-card">
          <div className="alert-card__title-row">
            <strong>{item.title}</strong>
            <Pill tone={item.statusTone || 'neutral'}>{item.statusLabel || 'Sem status'}</Pill>
          </div>
          {isMeaningful(item.dateText) ? <p>{item.dateText}</p> : null}
          {isMeaningful(item.detail) ? <p>{item.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

function readFeeBreakdown(portfolio = {}) {
  const baseFeeRaw = pickFirst(
    portfolio?.feesPaidQuote,
    portfolio?.feesQuote,
    portfolio?.feesPaid,
    portfolio?.quoteFee,
    portfolio?.feeBreakdown?.quote,
    portfolio?.fees?.quote,
    portfolio?.fees?.baseCurrency,
  );

  const bnbFeeRaw = pickFirst(
    portfolio?.feesPaidBnb,
    portfolio?.feesBnb,
    portfolio?.bnbFeesPaid,
    portfolio?.bnbFee,
    portfolio?.feeBreakdown?.bnb,
    portfolio?.fees?.bnb,
    portfolio?.fees?.bnbPaid,
    portfolio?.execution?.fees?.bnb,
  );

  return {
    baseFee: Number(baseFeeRaw ?? 0) || 0,
    bnbFee: Number(bnbFeeRaw ?? 0) || 0,
    hasBnbFeeField: bnbFeeRaw !== undefined && bnbFeeRaw !== null,
  };
}

function readLossStreak(controlState = {}, portfolio = {}) {
  const raw = pickFirst(
    controlState?.lossStreak,
    controlState?.currentLossStreak,
    controlState?.consecutiveLosses,
    controlState?.guardrails?.lossStreak,
    controlState?.guardrails?.consecutiveLosses,
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

function buildStrongSocialEntries(socialSummary = {}) {
  const candidateArrays = [
    socialSummary?.strongSignals,
    socialSummary?.strongItems,
    socialSummary?.strongAssets,
    socialSummary?.strongCoins,
    socialSummary?.strongPairs,
    socialSummary?.recentStrongAssets,
    socialSummary?.topStrong,
    socialSummary?.highlights,
    socialSummary?.summary?.strong,
    socialSummary?.recommendations?.strong,
  ];

  const rawItems = candidateArrays.find((value) => Array.isArray(value) && value.length) || [];

  return rawItems.slice(0, 6).map((item, index) => {
    if (typeof item === 'string') {
      return {
        key: `forte-${index}`,
        title: item,
        meta: '',
        detail: '',
      };
    }

    const title = toText(
      item?.symbol || item?.asset || item?.pair || item?.coin || item?.label || item?.title || item?.name,
      'Item forte',
    );

    const meta = joinMetaParts([
      isMeaningful(item?.classification)
        ? traduzirClassificacaoSocial(item.classification)
        : '',
      isMeaningful(item?.score) || item?.score === 0
        ? `score ${formatMaybeNumber(item.score, 2)}`
        : '',
      isMeaningful(item?.count) || item?.count === 0
        ? `menções ${formatMaybeNumber(item.count, 0)}`
        : '',
    ]);

    const detail = joinMetaParts([
      toText(item?.provider || item?.source || item?.channel, ''),
      toText(item?.reason || item?.summary || item?.message, ''),
    ]);

    return {
      key: `${title}-${index}`,
      title,
      meta,
      detail,
    };
  });
}

function mapCooldownVisualState(item = {}) {
  const raw = normalizeText(
    pickFirst(
      item.status,
      item.severity,
      item.cooldownType,
      item.payload?.status,
      item.payload?.severity,
      item.reason,
    ),
  ).toLowerCase();

  if (
    [
      'critical',
      'critico',
      'crítico',
      'circuit',
      'loss_streak',
      'daily_loss',
      'max_loss',
      'guardrail',
      'risk',
    ].some((token) => raw.includes(token))
  ) {
    return { statusLabel: 'Crítico', statusTone: 'danger' };
  }

  if (
    [
      'warning',
      'cooldown',
      'protection',
      'protec',
      'reserve',
      'manual',
      'maintenance',
      'retry',
      'hold',
      'blocked',
      'bloque',
    ].some((token) => raw.includes(token))
  ) {
    return { statusLabel: 'Proteção', statusTone: 'warning' };
  }

  return { statusLabel: 'Ativo', statusTone: 'info' };
}

function buildCooldownEntries(cooldowns = []) {
  return cooldowns.map((item, index) => {
    const visualState = mapCooldownVisualState(item);
    const detailParts = [
      isMeaningful(item?.cooldownType) ? toText(item.cooldownType, '') : '',
      isMeaningful(item?.reason)
        ? toText(item.reason, '')
        : pickFirst(item?.payload?.reason, item?.payload?.summary, item?.payload?.message, ''),
    ].filter((part, partIndex, allParts) => isMeaningful(part) && allParts.indexOf(part) === partIndex);

    return {
      key: `${toText(item.symbol, 'cooldown')}-${index}`,
      title: toText(item.symbol, 'Cooldown'),
      statusLabel: visualState.statusLabel,
      statusTone: visualState.statusTone,
      dateText: formatOptionalDateTime(
        item.activeUntil || item.expiresAt || item.createdAt || item.updatedAt,
      ),
      detail: detailParts.length
        ? detailParts.join(' • ')
        : 'Proteção temporária aberta para este ativo.',
    };
  });
}

function buildLossStreakEntries(controlState = {}, portfolio = {}, orders = [], currency = 'USDT') {
  const candidateArrays = [
    controlState?.lossStreakDetails,
    controlState?.guardrails?.lossStreakDetails,
    controlState?.recentLosses,
    controlState?.guardrails?.recentLosses,
    portfolio?.recentLosses,
    portfolio?.lossHistory,
  ];

  const rawEntries = candidateArrays.find((value) => Array.isArray(value) && value.length);
  if (rawEntries?.length) {
    return rawEntries.slice(0, 6).map((item, index) => ({
      key: `loss-${index}`,
      title: toText(item?.symbol || item?.asset || item?.pair || item?.title, 'Perda recente'),
      meta: joinMetaParts([
        formatOptionalDateTime(pickDateCandidate(item)),
        isMeaningful(item?.realizedPnl) || item?.realizedPnl === 0
          ? formatMaybeMoney(item.realizedPnl, currency)
          : '',
      ]),
      detail: toText(
        item?.reason
          || item?.summary
          || item?.message
          || item?.payload?.reason
          || item?.payload?.summary
          || item?.payload?.message,
        '',
      ),
    }));
  }

  const negativeOrders = safeArray(orders)
    .filter((item) => Number(item?.realizedPnl) < 0)
    .slice(0, 6)
    .map((item, index) => ({
      key: `loss-order-${index}`,
      title: toText(item?.symbol, 'Perda recente'),
      meta: joinMetaParts([
        formatOptionalDateTime(pickDateCandidate(item)),
        formatMaybeMoney(item?.realizedPnl, currency),
      ]),
      detail: isMeaningful(extractOrderReason(item))
        ? `Motivo: ${toText(extractOrderReason(item))}`
        : 'Perda registrada nas ordens recentes.',
    }));

  return negativeOrders;
}

function mapStatusTone(status) {
  const raw = normalizeText(status).toLowerCase();
  if (!raw) return 'neutral';

  if (
    [
      'ok',
      'success',
      'successful',
      'completed',
      'complete',
      'done',
      'healthy',
      'ready',
      'ativo',
      'online',
      'concluido',
      'concluído',
    ].some((token) => raw.includes(token))
  ) {
    return 'success';
  }

  if (
    [
      'error',
      'erro',
      'failed',
      'failure',
      'critical',
      'blocked',
      'bloqueado',
      'crash',
      'offline',
      'invalid',
    ].some((token) => raw.includes(token))
  ) {
    return 'danger';
  }

  if (
    [
      'warning',
      'warn',
      'pending',
      'degraded',
      'retry',
      'paused',
      'pausado',
      'attention',
      'aguardando',
      'partial',
      'parcial',
    ].some((token) => raw.includes(token))
  ) {
    return 'warning';
  }

  if (
    [
      'running',
      'processing',
      'in_progress',
      'in-progress',
      'started',
      'executing',
      'queued',
      'loading',
      'sincronizando',
      'sincronizado',
      'em andamento',
    ].some((token) => raw.includes(token))
  ) {
    return 'info';
  }

  return 'neutral';
}

function mapActionTone(action) {
  const raw = normalizeText(action).toLowerCase();
  if (!raw) return 'neutral';

  if (
    [
      'buy',
      'compra',
      'comprar',
      'long',
      'entry',
      'entrar',
      'increase',
      'aumentar',
    ].some((token) => raw.includes(token))
  ) {
    return 'success';
  }

  if (
    [
      'sell',
      'venda',
      'vender',
      'short',
      'exit',
      'saida',
      'saída',
      'close',
      'encerrar',
      'reduzir',
      'reduce',
    ].some((token) => raw.includes(token))
  ) {
    return 'danger';
  }

  if (
    [
      'block',
      'bloquear',
      'bloqueado',
      'reject',
      'rejeitar',
      'rejeitado',
      'deny',
      'denied',
      'cancel',
      'cancelado',
    ].some((token) => raw.includes(token))
  ) {
    return 'warning';
  }

  if (
    [
      'hold',
      'manter',
      'aguardar',
      'esperar',
      'wait',
      'skip',
      'noop',
      'no-op',
      'neutral',
    ].some((token) => raw.includes(token))
  ) {
    return 'neutral';
  }

  return 'info';
}

function buildRuntimeEntries(trainingRuns = [], jobRuns = []) {
  const runtimeEntries = [
    ...trainingRuns.map((run, index) => {
      const rawStatus = pickFirst(run.status, run.state, run.health, run.resultStatus);
      const translatedStatus = toText(traduzirStatusGenerico(rawStatus), 'Sem status');
      const dateText = formatOptionalDateTime(pickDateCandidate(run));
      const detail = toText(
        pickFirst(run.reason, run.summary, run.message, run.description, run.note, run.result),
        '',
      );

      return {
        key: `training-${index}`,
        sortDateRaw: pickDateCandidate(run),
        label: toText(
          traduzirChaveJob(run.jobKey || run.key || run.label || run.objective || run.name),
          'Execução de treinamento',
        ),
        statusLabel: translatedStatus,
        statusTone: mapStatusTone(translatedStatus || rawStatus),
        dateText,
        detail,
      };
    }),
    ...jobRuns.map((job, index) => {
      const rawStatus = pickFirst(job.status, job.state, job.health, job.resultStatus);
      const translatedStatus = toText(traduzirStatusGenerico(rawStatus), 'Sem status');
      const dateText = formatOptionalDateTime(pickDateCandidate(job));
      const detail = toText(
        pickFirst(job.reason, job.summary, job.message, job.detail, job.result, job.note),
        '',
      );

      return {
        key: `job-${index}`,
        sortDateRaw: pickDateCandidate(job),
        label: toText(
          traduzirChaveJob(job.jobKey || job.key || job.name || job.label),
          'Execução automática',
        ),
        statusLabel: translatedStatus,
        statusTone: mapStatusTone(translatedStatus || rawStatus),
        dateText,
        detail,
      };
    }),
  ];

  return runtimeEntries
    .map((entry, index) => ({
      ...entry,
      originalIndex: index,
      sortValue: Number.isFinite(Date.parse(entry.sortDateRaw)) ? Date.parse(entry.sortDateRaw) : 0,
    }))
    .sort((a, b) => {
      if (a.sortValue === b.sortValue) return a.originalIndex - b.originalIndex;
      return b.sortValue - a.sortValue;
    })
    .slice(0, 8);
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
  const recentOrders = safeArray(currentOrders);
  const orders = recentOrders.slice(0, 6);
  const topClassifications = safeArray(socialSummary?.topClassifications)
    .filter((item) => Number(item?.count || 0) > 0)
    .slice(0, 5);
  const providers = safeArray(providerStatuses).slice(0, 6);
  const trainingRuns = safeArray(recentTrainingRuns).slice(0, 4);
  const jobRuns = safeArray(recentJobRuns).slice(0, 5);

  const { baseFee, bnbFee, hasBnbFeeField } = readFeeBreakdown(currentPortfolio);
  const realizedPnl = Number(currentPortfolio?.realizedPnl || 0);
  const equity = Number(currentPortfolio?.equity || 0);
  const cashBalance = Number(currentPortfolio?.cashBalance || 0);
  const lossStreak = readLossStreak(controlState, currentPortfolio);
  const strongSocialCount = topClassifications
    .filter((item) => String(item.classification || '').toUpperCase() === 'FORTE')
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const trainingMetrics = buildTrainingMetrics(trainingSummary);
  const strongSocialEntries = buildStrongSocialEntries(socialSummary);
  const providerEntries = providers.map((provider, index) => {
    const entry = buildProviderDetail(provider);
    return {
      key: `${entry.providerName}-${index}`,
      title: entry.providerName,
      meta: entry.detail,
      detail: '',
    };
  });
  const cooldownEntries = buildCooldownEntries(cooldowns);
  const lossStreakEntries = buildLossStreakEntries(
    controlState,
    currentPortfolio,
    recentOrders.slice(0, 20),
    baseCurrency,
  );
  const runtimeEntries = buildRuntimeEntries(trainingRuns, jobRuns);

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
          <div>Taxas {baseCurrency}: {formatNumber(baseFee, 2)}</div>
          <div>Taxas BNB: {formatNumber(hasBnbFeeField ? bnbFee : 0, 2)}</div>

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
          <div className="dual-list-grid">
            <div>
              <h3 className="subsection-title">Cooldowns ativos</h3>
              {buildAlertCardList(cooldownEntries, 'Sem travas abertas neste momento.')}
            </div>
            <div>
              <h3 className="subsection-title">Loss streak</h3>
              {lossStreakEntries.length ? (
                buildSummaryList(lossStreakEntries, 'Sem sequência recente de perdas.')
              ) : (
                <div className="empty-state">
                  {lossStreak > 0
                    ? `Sequência atual de ${formatNumber(lossStreak, 0)} perda(s), sem detalhamento no payload atual.`
                    : 'Sem sequência recente de perdas.'}
                </div>
              )}
            </div>
          </div>
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
          <div className="dual-list-grid">
            <div>
              <h3 className="subsection-title">Fortes</h3>
              {strongSocialEntries.length ? (
                buildSummaryList(strongSocialEntries, 'Nenhum ativo forte no payload atual.')
              ) : topClassifications.length ? (
                <div className="list-stack compact-scroll">
                  {topClassifications.map((item, index) => (
                    <div key={`${item.classification || 'social'}-${index}`} className="list-card">
                      <strong>{traduzirClassificacaoSocial(item.classification)}</strong>
                      <p>{formatNumber(item.count, 0)} ocorrência(s) no resumo social.</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Nenhuma classificação forte recente.</div>
              )}
            </div>
            <div>
              <h3 className="subsection-title">Providers</h3>
              {providerEntries.length ? (
                buildSummaryList(providerEntries, 'Nenhum provider social disponível.')
              ) : (
                <div className="empty-state">Nenhuma telemetria social recebida ainda.</div>
              )}
            </div>
          </div>

          {strongSocialCount > 0 ? (
            <div className="pill-cloud">
              <Pill tone="success">{formatNumber(strongSocialCount, 0)} forte(s) no radar</Pill>
            </div>
          ) : null}
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

          {runtimeEntries.length ? (
            <div className="list-stack compact-scroll">
              {runtimeEntries.map((entry) => (
                <div key={entry.key} className="alert-card">
                  <div className="alert-card__title-row">
                    <strong>{entry.label}</strong>
                    <Pill tone={entry.statusTone}>{entry.statusLabel}</Pill>
                  </div>
                  {isMeaningful(entry.dateText) ? <p>{entry.dateText}</p> : null}
                  {isMeaningful(entry.detail) ? <p>{entry.detail}</p> : null}
                </div>
              ))}
            </div>
          ) : (
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
                  const actionLabel = toText(traduzirAcaoDecisao(decision.action), 'Sem ação');
                  const decisionMeta = joinMetaParts([
                    formatOptionalDateTime(
                      pickFirst(
                        decision.createdAt,
                        decision.created_at,
                        decision.decidedAt,
                        decision.timestamp,
                        decision.updatedAt,
                      ),
                    ),
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
                    <div key={`${toText(decision.symbol, 'decisao')}-${index}`} className="alert-card">
                      <div className="alert-card__title-row">
                        <strong>{toText(decision.symbol)}</strong>
                        <Pill tone={mapActionTone(`${decision.action || ''} ${actionLabel}`)}>{actionLabel}</Pill>
                      </div>
                      {isMeaningful(decisionMeta) ? <p>{decisionMeta}</p> : null}
                      <p>
                        {isMeaningful(decisionDetail)
                          ? toText(decisionDetail)
                          : 'Sem justificativa detalhada.'}
                      </p>
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
                  const sideLabel = toText(traduzirAcaoDecisao(order.side), 'Sem ação');
                  const orderMeta = joinMetaParts([
                    formatOptionalDateTime(order.createdAt),
                    status,
                  ]);
                  return (
                    <div key={`${toText(order.symbol, 'ordem')}-${index}`} className="alert-card">
                      <div className="alert-card__title-row">
                        <strong>{toText(order.symbol)}</strong>
                        <Pill tone={mapActionTone(`${order.side || ''} ${sideLabel}`)}>{sideLabel}</Pill>
                      </div>
                      {isMeaningful(orderMeta) ? <p>{orderMeta}</p> : null}
                      <p>
                        Preço: {formatMaybeMoney(order.price, baseCurrency)} • PnL:{' '}
                        {formatMaybeMoney(order.realizedPnl, baseCurrency)}
                      </p>
                      {isMeaningful(orderReason) ? <p>Motivo: {toText(orderReason)}</p> : null}
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
