export const DEFAULT_CONFIG = {
  trading: {
    enabled: false,
    mode: 'paper',
    baseCurrency: 'USDT',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    primaryTimeframe: '5m',
    confirmationTimeframes: ['15m', '1h'],
    lookbackCandles: 240,
    maxOpenPositions: 5,
  },
  risk: {
    maxRiskPerTradePct: 1,
    maxPortfolioExposurePct: 35,
    maxSymbolExposurePct: 12,
    stopLossAtr: 1.8,
    takeProfitAtr: 2.6,
    trailingStopAtr: 1.2,
    enableTrailingStop: true,
    allowAveragingDown: false,
    cooldownMinutesAfterLoss: 45,
    cooldownMinutesAfterStopLoss: 90,
    maxConsecutiveLosses: 3,
    dailyMaxLossPct: 3,
    autoPauseOnCircuitBreaker: true,
  },
  execution: {
    paper: {
      initialCapital: 10000,
      orderSizePct: 10,
      minOrderNotional: 50,
      feePct: 0.1,
      slippagePct: 0.05,
      allowMultipleEntriesPerSymbol: false,
      sellFractionOnSignal: 1,
    },
    live: {
      enabled: false,
      provider: 'binance_spot',
      useTestnet: true,
      dryRun: true,
      requireBackendLiveFlag: true,
      requireExplicitConfirmation: true,
      confirmationPhrase: 'EXECUTAR_LIVE_TESTNET',
      maxOrderNotional: 250,
      recvWindow: 5000,
    },
  },
  ai: {
    loopIntervalSec: 15,
    minDataPoints: 120,
    minConfidenceToBuy: 0.64,
    minConfidenceToSell: 0.6,
    decisionMargin: 0.05,
    respectRuntimePause: true,
    respectSymbolCooldowns: true,
    expertWeights: {
      trend: 0.21,
      momentum: 0.19,
      volatility: 0.12,
      liquidity: 0.12,
      regime: 0.15,
      pattern: 0.11,
      risk: 0.1,
    },
    useSocialBlockOnly: true,
    socialExtremeRiskThreshold: 85,
  },
  social: {
    enabled: true,
    blockOnlyOnExtremeRisk: true,
    extremeRiskThreshold: 85,
    strongScoreThreshold: 72,
    promisingScoreThreshold: 58,
    refreshIntervalSec: 600,
    sources: ['coingecko'],
    reddit: {
      enabled: false,
      subreddits: ['CryptoCurrency', 'CryptoMarkets'],
      limitPerSubreddit: 25,
    },
    coingecko: {
      enabled: true,
      useDemo: true,
      cacheFallbackEnabled: true,
      attributionRequired: true,
      minRetryAfterSec: 900,
    },
  },
  market: {
    source: 'binance_spot',
    symbolsQuoteAsset: 'USDT',
    defaultCandleLimit: 300,
    candleCacheTtlSec: 20,
  },
  frontend: {
    refreshIntervalSec: 5,
  },
  optimizer: {
    enabled: true,
    maxCandidatesPerRun: 8,
    defaultObjective: 'balanced',
    objectives: ['balanced', 'return', 'risk_adjusted', 'defensive'],
    symbols: [],
  },
  backtest: {
    defaultLimit: 400,
    defaultInterval: '5m',
    defaultConfirmationInterval: '15m',
    persistEquityCurve: true,
  },
  training: {
    enabled: true,
    evaluationWindowDays: 14,
    allowSuggestedWeightsApply: true,
    minQualityScoreForApply: 0.56,
    maxHighDriftForApply: false,
  },
};

export const DEFAULT_STATUS = {
  workers: [],
  recentEvents: [],
  recentDecisions: [],
  recentOrders: [],
  portfolio: { baseCurrency: 'USDT', positions: [] },
  execution: { mode: 'paper', dryRun: true, capabilities: {}, recentLiveAttempts: [], recentActionLogs: [], latestHealthCheck: null, recentHealthChecks: [], recentReconciliations: [] },
  social: { topScores: [], recentAlerts: [], providers: [], attribution: {} },
  activeAlerts: [],
  latestReadiness: null,
  recentReadinessReports: [],
  recentJobRuns: [],
  notifications: { enabled: false, channels: [], recentDeliveries: [] },
  policy: { recentReports: [] },
  observability: { current: null, recentSnapshots: [], exportKinds: [] },
  control: { isPaused: false, emergencyStop: false, maintenanceMode: false, activeCooldowns: [], guardrails: {} },
  configHistory: [],
  recentBacktests: [],
  recentOptimizations: [],
  recentPromotions: [],
  recentApprovalRequests: [],
  configAudit: [],
  runbooks: [],
  recentIncidentDrills: [],
  recentRecoveryActions: [],
  training: {
    summary: null,
    latestRun: null,
    latestQualityReport: null,
    latestDriftReport: null,
    latestExpertReport: null,
    recentRuns: [],
    recentQualityReports: [],
    recentDriftReports: [],
    recentExpertEvaluations: [],
  },
};

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  if (typeof base !== 'object' || base === null) {
    return override !== undefined ? override : base;
  }
  const result = { ...base };
  const source = override || {};
  Object.keys(source).forEach((key) => {
    const baseValue = result[key];
    const nextValue = source[key];
    if (
      baseValue
      && nextValue
      && typeof baseValue === 'object'
      && typeof nextValue === 'object'
      && !Array.isArray(baseValue)
      && !Array.isArray(nextValue)
    ) {
      result[key] = deepMerge(baseValue, nextValue);
    } else {
      result[key] = nextValue;
    }
  });
  return result;
}

export function mergeConfigWithDefaults(config = {}) {
  return deepMerge(DEFAULT_CONFIG, config || {});
}

export function updateAtPath(target, path, value) {
  const clone = deepClone(target || DEFAULT_CONFIG);
  const keys = path.split('.');
  let cursor = clone;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

export function parseNumberInput(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const MAPAS = {
  modoExecucao: { paper: 'simulado', live: 'real' },
  canalPromocao: { paper_active: 'simulado ativo', live_candidate: 'candidato ao modo real' },
  acaoDecisao: { BUY: 'COMPRA', SELL: 'VENDA', HOLD: 'MANTER', BLOCK: 'BLOQUEAR' },
  classificacaoSocial: { FORTE: 'FORTE', PROMISSORA: 'PROMISSORA', NEUTRA: 'NEUTRA', ALTO_RISCO: 'ALTO RISCO' },
  status: {
    ok: 'ok', warning: 'atenção', error: 'erro', failed: 'falhou', success: 'sucesso', sent: 'enviado', delivered: 'entregue',
    prepared: 'preparado', acknowledged: 'reconhecido', resolved: 'resolvido', pending: 'pendente', approved: 'aprovado',
    rejected: 'rejeitado', pass: 'aprovado', warn: 'atenção', ready: 'pronto', healthy: 'saudável', stale: 'desatualizado',
    backoff: 'em espera', configured: 'configurado', partial: 'parcial', enabled: 'habilitado', disabled: 'desligado',
    live_ready: 'pronto para real', live_incomplete: 'real incompleto', paper_active: 'simulado ativo', dry_run: 'simulação',
    applied: 'aplicado', rollback_applied: 'rollback aplicado', analysis: 'análise', blocked: 'bloqueado', active: 'ativo',
    inactive: 'inativo', buy: 'compra', sell: 'venda', hold: 'manter',
  },
  severidade: { critical: 'crítico', high: 'alto', warning: 'atenção', medium: 'médio', low: 'baixo', info: 'informativo' },
  drift: { low: 'baixo', moderate: 'moderado', high: 'alto' },
  qualidade: { healthy: 'saudável', warning: 'atenção', weak: 'fraco', poor: 'fraco' },
  regime: { mixed: 'misto', trend_bull: 'tendência de alta', trend_bear: 'tendência de baixa', range: 'lateral', volatile: 'volátil' },
  checkExecucao: { ok: 'ok', skip: 'ignorado', fail: 'falha' },
  especialista: { trend: 'tendência', momentum: 'momento', volatility: 'volatilidade', liquidity: 'liquidez', regime: 'regime', pattern: 'padrões', risk: 'risco' },
  objetivo: { balanced: 'equilibrado', return: 'retorno', risk_adjusted: 'ajustado ao risco', defensive: 'defensivo', quality_assistance: 'assistência de qualidade' },
  job: {
    execution_healthcheck: 'verificação de saúde da execução',
    execution_reconciliation: 'reconciliação da execução',
    readiness_assessment: 'avaliação de prontidão',
    alert_scan: 'varredura de alertas',
    observability_snapshot: 'instantâneo de observabilidade',
  },
  acaoExecucao: {
    preview_order: 'prévia de ordem', live_submit: 'envio supervisionado', submit_order: 'envio de ordem', healthcheck: 'verificação de saúde', reconciliation: 'reconciliação', risk_sync: 'sincronização de risco',
  },
  canalNotificacao: { webhook: 'webhook', telegram: 'telegram', email_ready: 'e-mail preparado' },
  runbook: {
    worker_stale: 'worker desatualizado', execution_health_failed: 'falha na saúde da execução', reconciliation_mismatch: 'divergência na reconciliação', social_provider_degraded: 'provedor social degradado', emergency_stop_triggered: 'parada de emergência acionada', market_data_stale: 'dados de mercado desatualizados',
  },
  gate: {
    promotion_request: 'solicitação de promoção', promotion_apply: 'aplicação de promoção', live_candidate_review: 'revisão de candidato ao modo real',
  },
  fonte: { manual: 'manual', optimizer: 'otimizador', rollback: 'rollback', dashboard: 'painel' },
};

function traduzir(mapa, value, transform = (v) => String(v || '')) {
  const chave = transform(value);
  return mapa[chave] || value || '—';
}

export const traduzirModoExecucao = (v) => traduzir(MAPAS.modoExecucao, v, (x) => String(x || '').toLowerCase());
export const traduzirCanalPromocao = (v) => traduzir(MAPAS.canalPromocao, v, (x) => String(x || '').toLowerCase());
export const traduzirAcaoDecisao = (v) => traduzir(MAPAS.acaoDecisao, v, (x) => String(x || '').toUpperCase());
export const traduzirClassificacaoSocial = (v) => traduzir(MAPAS.classificacaoSocial, v, (x) => String(x || '').toUpperCase());
export const traduzirStatusGenerico = (v) => traduzir(MAPAS.status, v, (x) => String(x || '').toLowerCase());
export const traduzirSeveridade = (v) => traduzir(MAPAS.severidade, v, (x) => String(x || '').toLowerCase());
export const traduzirNivelDrift = (v) => traduzir(MAPAS.drift, v, (x) => String(x || '').toLowerCase());
export const traduzirQualidade = (v) => traduzir(MAPAS.qualidade, v, (x) => String(x || '').toLowerCase());
export const traduzirRegime = (v) => traduzir(MAPAS.regime, v, (x) => String(x || '').toLowerCase());
export const traduzirCheckExecucao = (v) => traduzir(MAPAS.checkExecucao, v, (x) => String(x || '').toLowerCase());
export const traduzirSimNao = (v) => (v ? 'sim' : 'não');
export const traduzirEspecialista = (v) => traduzir(MAPAS.especialista, v, (x) => String(x || '').toLowerCase());
export const traduzirObjetivo = (v) => traduzir(MAPAS.objetivo, v, (x) => String(x || '').toLowerCase());
export const traduzirChaveJob = (v) => traduzir(MAPAS.job, v, (x) => String(x || '').toLowerCase());
export const traduzirTipoAcaoExecucao = (v) => traduzir(MAPAS.acaoExecucao, v, (x) => String(x || '').toLowerCase());
export const traduzirCanalNotificacao = (v) => traduzir(MAPAS.canalNotificacao, v, (x) => String(x || '').toLowerCase());
export const traduzirRunbook = (v) => traduzir(MAPAS.runbook, v, (x) => String(x || '').toLowerCase());
export const traduzirGate = (v) => traduzir(MAPAS.gate, v, (x) => String(x || '').toLowerCase());
export const traduzirFonte = (v) => traduzir(MAPAS.fonte, v, (x) => String(x || '').toLowerCase());
