import { useEffect, useMemo, useState } from 'react';
import {
  clearCooldown,
  compareBacktests,
  fetchBacktests,
  fetchConfig,
  fetchConfigAudit,
  fetchConfigHistory,
  fetchControl,
  fetchDecisions,
  fetchHealth,
  runExecutionHealthcheck,
  runExecutionReconciliation,
  runReadinessCheck,
  runScheduledJob,
  acknowledgeAlert,
  resolveAlert,
  previewExecutionOrder,
  submitLiveOrder,
  setMaintenanceMode,
  clearMaintenanceMode,
  sendTestNotification,
  runObservabilitySnapshot,
  buildObservabilityExportUrl,
  fetchOrders,
  fetchPortfolio,
  fetchSocialAlerts,
  fetchSocialScores,
  fetchSocialSummary,
  fetchStatus,
  fetchOptimizations,
  fetchPromotions,
  fetchPromotionRequests,
  getApiBaseUrl,
  runBacktest,
  runOptimization,
  simulatePromotionWinner,
  requestPromotionApproval,
  approvePromotionRequest,
  rejectPromotionRequest,
  rollbackConfigVersion,
  pauseControl,
  resumeControl,
  triggerEmergencyStop,
  updateConfig,
  fetchRunbooks,
  fetchIncidentDrills,
  runIncidentDrill,
  fetchRecoveryActions,
  runRecoveryAction,
} from './lib/api';
import { formatDateTime, formatList, formatMoney, formatNumber, formatPercent } from './lib/format';
import Section from './components/Section';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';


const DEFAULT_CONFIG = {
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
};

const DEFAULT_STATUS = {
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
  timestamp: null,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
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

function mergeConfigWithDefaults(config = {}) {
  return deepMerge(DEFAULT_CONFIG, config || {});
}

function updateAtPath(target, path, value) {
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

function parseNumberInput(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ConfigField({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

function Pill({ children, tone = 'info' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [configRow, setConfigRow] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [auxData, setAuxData] = useState({
    orders: [],
    decisions: [],
    socialScores: [],
    socialAlerts: [],
    portfolio: null,
    socialSummary: null,
    control: null,
    configHistory: [],
    configAudit: [],
    promotions: [],
    approvalRequests: [],
    backtests: [],
    optimizations: [],
    runbooks: [],
    incidentDrills: [],
    recoveryActions: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [backtestForm, setBacktestForm] = useState({ symbol: 'BTCUSDT', interval: '5m', confirmationInterval: '15m', limit: 400 });
  const [backtestLoading, setBacktestLoading] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [optimizationLoading, setOptimizationLoading] = useState('');
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [promotionLoading, setPromotionLoading] = useState('');
  const [promotionSimulation, setPromotionSimulation] = useState(null);
  const [executionActionLoading, setExecutionActionLoading] = useState('');
  const [opsActionLoading, setOpsActionLoading] = useState('');
  const [executionPreview, setExecutionPreview] = useState(null);
  const [notificationLoading, setNotificationLoading] = useState('');
  const [incidentActionLoading, setIncidentActionLoading] = useState('');
  const [executionForm, setExecutionForm] = useState({
    symbol: 'BTCUSDT',
    side: 'BUY',
    requestedNotional: 100,
    requestedQuantity: 0,
    confirmationPhrase: '',
  });

  const loadEverything = async () => {
    setError('');
    try {
      const [
        healthData,
        configData,
        configHistoryData,
        configAuditData,
        promotionsData,
        approvalRequestsData,
        statusData,
        portfolioData,
        ordersData,
        decisionsData,
        socialScoresData,
        socialAlertsData,
        socialSummaryData,
        controlData,
        backtestsData,
        optimizationsData,
        runbooksData,
        incidentDrillsData,
        recoveryActionsData,
      ] = await Promise.all([
        fetchHealth(),
        fetchConfig(),
        fetchConfigHistory(10),
        fetchConfigAudit(15),
        fetchPromotions(10),
        fetchPromotionRequests(10),
        fetchStatus(),
        fetchPortfolio(),
        fetchOrders(20),
        fetchDecisions(20),
        fetchSocialScores(12),
        fetchSocialAlerts(12),
        fetchSocialSummary(),
        fetchControl(),
        fetchBacktests(10),
        fetchOptimizations(10),
        fetchRunbooks(12),
        fetchIncidentDrills(10),
        fetchRecoveryActions(10),
      ]);

      setHealth(healthData);
      setConfigRow(configData);
      setDraftConfig(deepClone(mergeConfigWithDefaults(configData?.config || {})));
      setStatus(statusData);
      setAuxData({
        portfolio: portfolioData,
        orders: ordersData.items || [],
        decisions: decisionsData.items || [],
        socialScores: socialScoresData.items || [],
        socialAlerts: socialAlertsData.items || [],
        socialSummary: socialSummaryData,
        control: controlData,
        configHistory: configHistoryData.items || [],
        configAudit: configAuditData.items || [],
        promotions: promotionsData.items || [],
        approvalRequests: approvalRequestsData.items || [],
        backtests: backtestsData.items || [],
        optimizations: optimizationsData.items || [],
        runbooks: runbooksData.items || [],
        incidentDrills: incidentDrillsData.items || [],
        recoveryActions: recoveryActionsData.items || [],
      });
    } catch (requestError) {
      setError(requestError.message || 'Falha ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEverything();
  }, []);

  useEffect(() => {
    if (!draftConfig) return;
    setBacktestForm((current) => ({
      ...current,
      symbol: current.symbol || draftConfig?.trading?.symbols?.[0] || 'BTCUSDT',
      interval: current.interval || draftConfig?.backtest?.defaultInterval || draftConfig?.trading?.primaryTimeframe || '5m',
      confirmationInterval: current.confirmationInterval || draftConfig?.backtest?.defaultConfirmationInterval || draftConfig?.trading?.confirmationTimeframes?.[0] || '15m',
      limit: current.limit || draftConfig?.backtest?.defaultLimit || draftConfig?.trading?.lookbackCandles || 400,
    }));
  }, [draftConfig]);


  useEffect(() => {
    if (!draftConfig) return;
    setExecutionForm((current) => ({
      ...current,
      symbol: current.symbol || draftConfig?.trading?.symbols?.[0] || 'BTCUSDT',
      requestedNotional: current.requestedNotional || draftConfig?.execution?.paper?.minOrderNotional || 100,
      confirmationPhrase: current.confirmationPhrase || draftConfig?.execution?.live?.confirmationPhrase || '',
    }));
  }, [draftConfig]);

  useEffect(() => {
    const source = new EventSource(`${getApiBaseUrl()}/api/status/stream`);

    source.addEventListener('open', () => setSseConnected(true));
    source.addEventListener('status', (event) => {
      try {
        setStatus(JSON.parse(event.data));
      } catch (_error) {
        // ignore malformed event
      }
    });
    source.addEventListener('error', () => setSseConnected(false));

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, []);

  useEffect(() => {
    if (!saveMessage) return undefined;
    const timer = setTimeout(() => setSaveMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  const currentPortfolio = status.portfolio?.accountKey ? status.portfolio : auxData.portfolio;
  const currentOrders = status.recentOrders?.length ? status.recentOrders : auxData.orders;
  const currentDecisions = status.recentDecisions?.length ? status.recentDecisions : auxData.decisions;
  const socialScores = status.social?.topScores?.length ? status.social.topScores : auxData.socialScores;
  const socialAlerts = status.social?.recentAlerts?.length ? status.social.recentAlerts : auxData.socialAlerts;
  const socialSummary = status.social?.assetsCount !== undefined ? status.social : auxData.socialSummary;
  const controlState = status.control?.updatedAt ? status.control : auxData.control;
  const configHistory = status.configHistory?.length ? status.configHistory : auxData.configHistory;
  const configAudit = status.configAudit?.length ? status.configAudit : auxData.configAudit;
  const recentPromotions = status.recentPromotions?.length ? status.recentPromotions : auxData.promotions;
  const recentApprovalRequests = status.recentApprovalRequests?.length ? status.recentApprovalRequests : auxData.approvalRequests;
  const recentBacktests = status.recentBacktests?.length ? status.recentBacktests : auxData.backtests;
  const recentOptimizations = status.recentOptimizations?.length ? status.recentOptimizations : auxData.optimizations;
  const activeAlerts = status.activeAlerts || [];
  const latestReadiness = status.latestReadiness || null;
  const recentReadinessReports = status.recentReadinessReports || [];
  const recentJobRuns = status.recentJobRuns || [];
  const execution = status.execution || DEFAULT_STATUS.execution;
  const notifications = status.notifications || DEFAULT_STATUS.notifications;
  const policyReports = status.policy?.recentReports || [];
  const observability = status.observability || DEFAULT_STATUS.observability;
  const runbooks = status.runbooks?.length ? status.runbooks : auxData.runbooks;
  const recentIncidentDrills = status.recentIncidentDrills?.length ? status.recentIncidentDrills : auxData.incidentDrills;
  const recentRecoveryActions = status.recentRecoveryActions?.length ? status.recentRecoveryActions : auxData.recoveryActions;

  const summaryCards = useMemo(() => {
    const portfolio = currentPortfolio || { baseCurrency: 'USDT' };
    const baseCurrency = portfolio.baseCurrency || 'USDT';
    const guardrails = controlState?.guardrails || {};

    return [
      {
        label: 'Backend',
        value: health?.ok ? 'Online' : 'Indisponível',
        hint: health?.timestamp ? `Última checagem: ${formatDateTime(health.timestamp)}` : 'Sem resposta',
        tone: health?.ok ? 'positive' : 'danger',
      },
      {
        label: 'Equity Paper',
        value: formatMoney(portfolio.equity || 0, baseCurrency),
        hint: `Caixa: ${formatMoney(portfolio.cashBalance || 0, baseCurrency)}`,
      },
      {
        label: 'PnL Realizado',
        value: formatMoney(portfolio.realizedPnl || 0, baseCurrency),
        hint: `Taxas: ${formatMoney(portfolio.feesPaid || 0, baseCurrency)}`,
        tone: Number(portfolio.realizedPnl || 0) >= 0 ? 'positive' : 'danger',
      },
      {
        label: 'Controle do Bot',
        value: controlState?.emergencyStop ? 'EMERGÊNCIA' : controlState?.maintenanceMode ? 'MAINTENANCE' : controlState?.isPaused ? 'PAUSADO' : 'ATIVO',
        hint: controlState?.maintenanceMode ? (controlState?.maintenanceReason || 'Maintenance mode ativo') : (controlState?.pauseReason || 'Sem bloqueios globais'),
        tone: controlState?.emergencyStop ? 'danger' : controlState?.maintenanceMode ? 'warning' : controlState?.isPaused ? 'warning' : 'positive',
      },
      {
        label: 'Cooldowns',
        value: formatNumber(controlState?.activeCooldowns?.length || 0, 0),
        hint: `Loss streak: ${formatNumber(guardrails?.consecutiveLosses || 0, 0)}`,
        tone: Number(controlState?.activeCooldowns?.length || 0) > 0 ? 'warning' : 'default',
      },
      {
        label: 'Social',
        value: `${formatNumber(socialSummary?.strongCount || 0, 0)} fortes`,
        hint: `${formatNumber(socialSummary?.highRiskCount || 0, 0)} alto risco`,
        tone: Number(socialSummary?.highRiskCount || 0) > 0 ? 'warning' : 'default',
      },
    ];
  }, [controlState, currentPortfolio, health, socialSummary]);

  const handleTextChange = (path, value) => setDraftConfig((current) => updateAtPath(current, path, value));
  const handleNumberChange = (path, value) => setDraftConfig((current) => updateAtPath(current, path, parseNumberInput(value)));
  const handleCheckboxChange = (path, checked) => setDraftConfig((current) => updateAtPath(current, path, checked));

  const handleSymbolsChange = (value) => {
    const parsed = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    setDraftConfig((current) => updateAtPath(current, 'trading.symbols', parsed));
  };

  const handleTimeframesChange = (value) => {
    const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
    setDraftConfig((current) => updateAtPath(current, 'trading.confirmationTimeframes', parsed));
  };

  const handleSaveConfig = async () => {
    if (!draftConfig) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateConfig(draftConfig);
      setConfigRow(updated);
      setDraftConfig(deepClone(mergeConfigWithDefaults(updated.config || {})));
      setSaveMessage(`Configuração salva. Versão ${updated.version}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  const handleControlAction = async (actionName, action) => {
    setActionLoading(actionName);
    setError('');
    try {
      await action();
      await loadEverything();
      setSaveMessage('Controle operacional atualizado.');
    } catch (requestError) {
      setError(requestError.message || 'Falha ao atualizar o controle operacional.');
    } finally {
      setActionLoading('');
    }
  };

  const handleRunBacktest = async () => {
    setBacktestLoading('run');
    setError('');
    setComparisonResult(null);
    try {
      const result = await runBacktest({
        label: `manual:${backtestForm.symbol}:${backtestForm.interval}`,
        symbol: backtestForm.symbol,
        interval: backtestForm.interval,
        confirmationInterval: backtestForm.confirmationInterval,
        limit: Number(backtestForm.limit || 400),
      });
      setSaveMessage(`Backtest concluído para ${result.symbol}. Run #${result.id}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao executar backtest.');
    } finally {
      setBacktestLoading('');
    }
  };

  const handleCompareBacktest = async () => {
    setBacktestLoading('compare');
    setError('');
    try {
      const result = await compareBacktests({
        symbol: backtestForm.symbol,
        interval: backtestForm.interval,
        confirmationInterval: backtestForm.confirmationInterval,
        limit: Number(backtestForm.limit || 400),
        challengerConfig: {
          ai: {
            minConfidenceToBuy: Number((draftConfig?.ai?.minConfidenceToBuy || 0.64)) + 0.03,
            minConfidenceToSell: Number((draftConfig?.ai?.minConfidenceToSell || 0.60)) + 0.02,
            decisionMargin: Number((draftConfig?.ai?.decisionMargin || 0.05)) + 0.01,
          },
          risk: {
            stopLossAtr: Number(draftConfig?.risk?.stopLossAtr || 1.8) + 0.2,
            takeProfitAtr: Number(draftConfig?.risk?.takeProfitAtr || 2.6) + 0.2,
          },
        },
      });
      setComparisonResult(result);
      setSaveMessage('Comparação de configuração concluída.');
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao comparar backtests.');
    } finally {
      setBacktestLoading('');
    }
  };

  if (loading) {
    return <div className="app-loading">Carregando painel...</div>;
  }

  const portfolio = currentPortfolio || { baseCurrency: 'USDT', positions: [] };
  const baseCurrency = portfolio.baseCurrency || 'USDT';
  const guardrails = controlState?.guardrails || {};

const handleRunOptimization = async () => {
  setOptimizationLoading('running');
  setError('');
  try {
    const result = await runOptimization({
      label: `Calibração ${new Date().toLocaleString('pt-BR')}`,
      symbols: draftConfig?.trading?.symbols || [backtestForm.symbol],
      interval: backtestForm.interval,
      confirmationInterval: backtestForm.confirmationInterval,
      limit: backtestForm.limit,
      objective: draftConfig?.optimizer?.defaultObjective || 'balanced',
      maxCandidates: draftConfig?.optimizer?.maxCandidatesPerRun || 8,
    });
    setOptimizationResult(result);
    setSaveMessage('Calibração concluída e ranking atualizado.');
    const optimizationsData = await fetchOptimizations(10);
    setAuxData((current) => ({ ...current, optimizations: optimizationsData.items || current.optimizations }));
  } catch (requestError) {
    setError(requestError.message || 'Falha ao rodar calibração.');
  } finally {
    setOptimizationLoading('');
  }
};

const handleSimulatePromotion = async (optimizationRunId, targetChannel) => {
  setPromotionLoading(`simulate-${targetChannel}-${optimizationRunId}`);
  setError('');
  try {
    const result = await simulatePromotionWinner(optimizationRunId, {
      targetChannel,
      rank: 1,
    });
    setPromotionSimulation(result);
    setSaveMessage('Simulação de promoção carregada.');
  } catch (requestError) {
    setError(requestError.message || 'Falha ao simular promoção.');
  } finally {
    setPromotionLoading('');
  }
};

const handleRequestPromotion = async (optimizationRunId, targetChannel) => {
  setPromotionLoading(`request-${targetChannel}-${optimizationRunId}`);
  setError('');
  try {
    const result = await requestPromotionApproval(optimizationRunId, {
      targetChannel,
      rank: 1,
      requestedBy: 'dashboard_requester',
      reason: `request:${targetChannel}`,
    });
    setPromotionSimulation(result.simulation ? { ...result.simulation, summary: result.request?.summary } : null);
    setSaveMessage(`Solicitação #${result.request?.id} criada para ${targetChannel}.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao solicitar aprovação.');
  } finally {
    setPromotionLoading('');
  }
};

const handleApproveRequest = async (requestId) => {
  setPromotionLoading(`approve-${requestId}`);
  setError('');
  try {
    const result = await approvePromotionRequest(requestId, {
      approvedBy: 'dashboard_reviewer',
      approvalNote: 'approved_from_dashboard',
    });
    setSaveMessage(`Solicitação #${result.request?.id} aprovada.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao aprovar solicitação.');
  } finally {
    setPromotionLoading('');
  }
};

const handleRejectRequest = async (requestId) => {
  setPromotionLoading(`reject-${requestId}`);
  setError('');
  try {
    const result = await rejectPromotionRequest(requestId, {
      rejectedBy: 'dashboard_reviewer',
      rejectionNote: 'rejected_from_dashboard',
    });
    setSaveMessage(`Solicitação #${result.request?.id || requestId} rejeitada.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao rejeitar solicitação.');
  } finally {
    setPromotionLoading('');
  }
};

const handleRollbackVersion = async (version) => {
  setPromotionLoading(`rollback-${version}`);
  setError('');
  try {
    const result = await rollbackConfigVersion(version, {
      requestedBy: 'dashboard_reviewer',
      reason: `rollback_to_v${version}`,
    });
    setSaveMessage(`Rollback aplicado da versão ${version} para a nova versão ${result.updatedConfig?.version}.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao aplicar rollback.');
  } finally {
    setPromotionLoading('');
  }
};


const handleExecutionAction = async (actionName, action, successMessage) => {
  setExecutionActionLoading(actionName);
  setError('');
  try {
    await action();
    await loadEverything();
    setSaveMessage(successMessage);
  } catch (requestError) {
    setError(requestError.message || 'Falha ao executar ação de execution.');
  } finally {
    setExecutionActionLoading('');
  }
};


const handlePreviewLiveOrder = async () => {
  setExecutionActionLoading('preview');
  setError('');
  try {
    const preview = await previewExecutionOrder({
      symbol: executionForm.symbol,
      side: executionForm.side,
      requestedNotional: executionForm.side === 'BUY' ? Number(executionForm.requestedNotional || 0) : null,
      requestedQuantity: executionForm.side === 'SELL' ? Number(executionForm.requestedQuantity || 0) : null,
      actor: 'dashboard',
    });
    setExecutionPreview(preview);
    setSaveMessage('Prévia da ordem carregada.');
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao gerar prévia da ordem live.');
  } finally {
    setExecutionActionLoading('');
  }
};

const handleSubmitLiveOrder = async () => {
  setExecutionActionLoading('submit-live');
  setError('');
  try {
    const result = await submitLiveOrder({
      symbol: executionForm.symbol,
      side: executionForm.side,
      requestedNotional: executionForm.side === 'BUY' ? Number(executionForm.requestedNotional || 0) : null,
      requestedQuantity: executionForm.side === 'SELL' ? Number(executionForm.requestedQuantity || 0) : null,
      requestedBy: 'dashboard',
      confirmationPhrase: executionForm.confirmationPhrase,
      reason: 'manual_supervised_live_submit_from_dashboard',
      payload: {
        source: 'dashboard',
      },
      previewTicketId: executionPreview?.previewTicket?.id || null,
    });
    setExecutionPreview((current) => current ? { ...current, lastSubmitResult: result } : { lastSubmitResult: result });
    setSaveMessage(`Execução supervisionada concluída com status ${result.status}.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao enviar ordem live supervisionada.');
  } finally {
    setExecutionActionLoading('');
  }
};


const handleOpsAction = async (actionName, action, successMessage) => {
  setOpsActionLoading(actionName);
  setError('');
  try {
    await action();
    await loadEverything();
    setSaveMessage(successMessage);
  } catch (requestError) {
    setError(requestError.message || 'Falha ao executar ação operacional.');
  } finally {
    setOpsActionLoading('');
  }
};

  const handleMaintenanceAction = async (enabled) => {
  setOpsActionLoading(enabled ? 'maintenance-on' : 'maintenance-off');
  setError('');
  try {
    if (enabled) {
      await setMaintenanceMode({ reason: 'dashboard_maintenance_mode', scope: 'system' });
      setSaveMessage('Maintenance mode ativado.');
    } else {
      await clearMaintenanceMode({ resume: false });
      setSaveMessage('Maintenance mode desativado.');
    }
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao atualizar maintenance mode.');
  } finally {
    setOpsActionLoading('');
  }
};

const handleRunObservabilitySnapshot = async () => {
  setOpsActionLoading('observability-snapshot');
  setError('');
  try {
    await runObservabilitySnapshot({ source: 'dashboard' });
    setSaveMessage('Snapshot de observabilidade gerado.');
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao gerar snapshot de observabilidade.');
  } finally {
    setOpsActionLoading('');
  }
};

const handleSendTestNotification = async (channel = 'all') => {
  setNotificationLoading(channel);
  setError('');
  try {
    await sendTestNotification({ channel, actor: 'dashboard', message: 'Teste manual enviado pelo painel.' });
    setSaveMessage('Teste de notificação disparado.');
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao enviar notificação de teste.');
  } finally {
    setNotificationLoading('');
  }
};

const handleRunIncidentDrill = async (scenarioKey, severity = 'warning') => {
  setIncidentActionLoading(`drill-${scenarioKey}`);
  setError('');
  try {
    await runIncidentDrill({ scenarioKey, severity, actor: 'dashboard', notes: `Simulação disparada pelo painel para ${scenarioKey}.` });
    setSaveMessage(`Incidente simulado para ${scenarioKey}.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao simular incidente.');
  } finally {
    setIncidentActionLoading('');
  }
};

const handleRunRecoveryAction = async (runbookKey, actionKey) => {
  setIncidentActionLoading(`recovery-${runbookKey}-${actionKey}`);
  setError('');
  try {
    await runRecoveryAction({ runbookKey, actionKey, actor: 'dashboard', notes: `Ação ${actionKey} disparada pelo painel.` });
    setSaveMessage(`Ação ${actionKey} executada para ${runbookKey}.`);
    await loadEverything();
  } catch (requestError) {
    setError(requestError.message || 'Falha ao executar ação de recuperação.');
  } finally {
    setIncidentActionLoading('');
  }
};

  const providerStatuses = socialSummary?.providers || [];

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cripto IA</p>
          <h1>Dashboard operacional</h1>
          <p className="hero__subtitle">
            Painel desacoplado dos workers. Nesta etapa, além do REST + SSE, o sistema ganhou promoção
            controlada, aprovação em duas etapas, rollback assistido, healthchecks de execução, reconciliação supervisionada, prévia de ordem, dry-run supervisionado, confirmação explícita e agora jobs agendados, alertas ativos, readiness checklist, policy gates mais fortes, maintenance mode, alertas externos, runbooks operacionais, simulação de incidentes e recuperação guiada.
          </p>
        </div>
        <div className="hero__status-group">
          <StatusBadge connected={sseConnected} label={sseConnected ? 'SSE conectado' : 'SSE reconectando'} />
          <StatusBadge connected={Boolean(health?.ok)} label={health?.ok ? 'Backend saudável' : 'Backend indisponível'} />
          <button className="button button--ghost" onClick={loadEverything}>Atualizar agora</button>
        </div>
      </header>

      {error ? <div className="alert alert--danger">{error}</div> : null}
      {saveMessage ? <div className="alert alert--success">{saveMessage}</div> : null}

      <div className="stats-grid">
        {summaryCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="layout-grid">
        <div className="layout-grid__main">
          <Section
            title="Controle operacional"
            subtitle="Esses controles valem para o backend e para a AI, independentemente do frontend."
            actions={(
              <div className="button-row">
                <button
                  className="button"
                  disabled={actionLoading === 'pause'}
                  onClick={() => handleControlAction('pause', () => pauseControl('manual_pause_from_dashboard'))}
                >
                  {actionLoading === 'pause' ? 'Pausando...' : 'Pausar'}
                </button>
                <button
                  className="button"
                  disabled={actionLoading === 'resume'}
                  onClick={() => handleControlAction('resume', () => resumeControl(true))}
                >
                  {actionLoading === 'resume' ? 'Retomando...' : 'Retomar'}
                </button>
                <button
                  className="button button--danger"
                  disabled={actionLoading === 'emergency'}
                  onClick={() => handleControlAction('emergency', () => triggerEmergencyStop('manual_emergency_stop_from_dashboard'))}
                >
                  {actionLoading === 'emergency' ? 'Acionando...' : 'Emergency Stop'}
                </button>
                <button
                  className="button button--ghost"
                  disabled={opsActionLoading === 'maintenance-on'}
                  onClick={() => handleMaintenanceAction(true)}
                >
                  {opsActionLoading === 'maintenance-on' ? 'Ativando...' : 'Maintenance ON'}
                </button>
                <button
                  className="button button--ghost"
                  disabled={opsActionLoading === 'maintenance-off'}
                  onClick={() => handleMaintenanceAction(false)}
                >
                  {opsActionLoading === 'maintenance-off' ? 'Desativando...' : 'Maintenance OFF'}
                </button>
              </div>
            )}
          >
            <div className="list-stack">
              <div className="list-item list-item--column">
                <div>
                  <strong>Estado atual</strong>
                  <div className="muted">Atualizado em {formatDateTime(controlState?.updatedAt)}</div>
                </div>
                <div className="button-row">
                  <Pill tone={controlState?.emergencyStop ? 'high' : controlState?.maintenanceMode ? 'warning' : controlState?.isPaused ? 'warning' : 'buy'}>
                    {controlState?.emergencyStop ? 'emergência' : controlState?.maintenanceMode ? 'maintenance' : controlState?.isPaused ? 'pausado' : 'ativo'}
                  </Pill>
                  {controlState?.pauseReason ? <span className="muted">Motivo: {controlState.pauseReason}</span> : null}
                  {controlState?.maintenanceMode ? <span className="muted">Escopo: {controlState.maintenanceScope || 'system'}{controlState?.maintenanceUntil ? ` • até ${formatDateTime(controlState.maintenanceUntil)}` : ''}</span> : null}
                </div>
              </div>
              <div className="list-item list-item--column">
                <div>
                  <strong>Guardrails</strong>
                  <div className="muted">
                    PnL do dia: {formatMoney(guardrails.dailyRealizedPnl || 0, baseCurrency)} •
                    Limite diário: {formatMoney(guardrails.dailyLossLimitAmount || 0, baseCurrency)} •
                    Loss streak: {formatNumber(guardrails.consecutiveLosses || 0, 0)} / {formatNumber(guardrails.maxConsecutiveLosses || 0, 0)}
                  </div>
                </div>
                <div className="button-row">
                  {guardrails.dailyLossLimitReached ? <Pill tone="high">limite diário atingido</Pill> : null}
                  {guardrails.lossStreakLimitReached ? <Pill tone="high">loss streak crítico</Pill> : null}
                  {!guardrails.dailyLossLimitReached && !guardrails.lossStreakLimitReached ? <Pill tone="buy">guardrails ok</Pill> : null}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Execução supervisionada"
            subtitle="Healthchecks e reconciliação ajudam a preparar testnet/live sem ligar o modo live por acidente."
            actions={(
              <div className="button-row">
                <button
                  className="button"
                  disabled={executionActionLoading === 'healthcheck'}
                  onClick={() => handleExecutionAction('healthcheck', () => runExecutionHealthcheck({ requestedBy: 'dashboard' }), 'Healthcheck de execução concluído.')}
                >
                  {executionActionLoading === 'healthcheck' ? 'Checando...' : 'Rodar healthcheck'}
                </button>
                <button
                  className="button"
                  disabled={executionActionLoading === 'reconcile'}
                  onClick={() => handleExecutionAction('reconcile', () => runExecutionReconciliation({ requestedBy: 'dashboard', symbols: draftConfig?.trading?.symbols || [] }), 'Reconciliação concluída.')}
                >
                  {executionActionLoading === 'reconcile' ? 'Conciliando...' : 'Rodar reconciliação'}
                </button>
              </div>
            )}
          >
            <div className="list-stack">
              <div className="list-item list-item--column">
                <div>
                  <strong>Status atual do adapter</strong>
                  <div className="muted">
                    Modo: {execution.mode} • Provider: {execution.provider} • Testnet: {execution.useTestnet ? 'sim' : 'não'} • Dry run: {execution.dryRun ? 'sim' : 'não'}
                  </div>
                </div>
                <div className="button-row">
                  <Pill tone={execution.liveReady ? 'buy' : execution.mode === 'live' ? 'warning' : 'info'}>
                    {execution.liveReady ? 'live ready' : execution.mode === 'live' ? 'live incompleto' : 'paper ativo'}
                  </Pill>
                  {execution.supervised ? <Pill tone="warning">supervisionado</Pill> : null}
                  {execution.requireExplicitConfirmation ? <Pill tone="high">confirmação explícita</Pill> : null}
                </div>
              </div>

              <div className="list-item list-item--column">
                <div>
                  <strong>Último healthcheck</strong>
                  <div className="muted">
                    {execution.latestHealthCheck?.createdAt ? formatDateTime(execution.latestHealthCheck.createdAt) : 'Ainda não executado'}
                  </div>
                </div>
                <div className="button-row">
                  {execution.latestHealthCheck ? <Pill tone={execution.latestHealthCheck.status === 'ok' ? 'buy' : execution.latestHealthCheck.status === 'warning' ? 'warning' : 'high'}>{execution.latestHealthCheck.status}</Pill> : <Pill tone="info">sem healthcheck</Pill>}
                  {execution.latestHealthCheck?.summary?.checks?.map((item) => (
                    <span key={item.check} className="muted">{item.check}:{item.ok ? 'ok' : item.skipped ? 'skip' : 'falha'}</span>
                  ))}
                </div>
              </div>

              <div className="list-item list-item--column">
                <div>
                  <strong>Prévia e envio supervisionado</strong>
                  <div className="muted">
                    Use esta área para montar uma ordem testnet/live com revisão de filtros, notional e frase de confirmação.
                  </div>
                </div>
                <div className="form-grid">
                  <ConfigField label="Símbolo">
                    <input value={executionForm.symbol} onChange={(event) => setExecutionForm((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
                  </ConfigField>
                  <ConfigField label="Lado">
                    <select value={executionForm.side} onChange={(event) => setExecutionForm((current) => ({ ...current, side: event.target.value }))}>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </ConfigField>
                  <ConfigField label="Notional (BUY)">
                    <input type="number" step="0.01" value={executionForm.requestedNotional} onChange={(event) => setExecutionForm((current) => ({ ...current, requestedNotional: parseNumberInput(event.target.value, 0) }))} />
                  </ConfigField>
                  <ConfigField label="Quantidade (SELL)">
                    <input type="number" step="0.000001" value={executionForm.requestedQuantity} onChange={(event) => setExecutionForm((current) => ({ ...current, requestedQuantity: parseNumberInput(event.target.value, 0) }))} />
                  </ConfigField>
                  <ConfigField label="Frase de confirmação" hint={`Obrigatória: ${draftConfig?.execution?.live?.confirmationPhrase || 'EXECUTAR_LIVE_TESTNET'}`}>
                    <input value={executionForm.confirmationPhrase} onChange={(event) => setExecutionForm((current) => ({ ...current, confirmationPhrase: event.target.value }))} />
                  </ConfigField>
                </div>
                <div className="button-row">
                  <button className="button" disabled={executionActionLoading === 'preview'} onClick={handlePreviewLiveOrder}>
                    {executionActionLoading === 'preview' ? 'Gerando...' : 'Gerar prévia'}
                  </button>
                  <button className="button button--danger" disabled={executionActionLoading === 'submit-live'} onClick={handleSubmitLiveOrder}>
                    {executionActionLoading === 'submit-live' ? 'Enviando...' : 'Enviar supervisionado'}
                  </button>
                </div>
                {executionPreview ? (
                  <div className="metric-grid">
                    <div className="list-item list-item--column">
                      <strong>Preview</strong>
                      <div className="muted">Preço: {formatMoney(executionPreview.price || 0, draftConfig?.trading?.baseCurrency || 'USDT')}</div>
                      <div className="muted">Notional: {formatMoney(executionPreview.estimatedNotional || executionPreview.normalizedNotional || 0, draftConfig?.trading?.baseCurrency || 'USDT')}</div>
                      <div className="muted">Quantidade: {formatNumber(executionPreview.normalizedQuantity || 0, 6)}</div>
                      <div className="muted">Ticket: {executionPreview.previewTicket?.id || 'n/a'} • expira em {formatDateTime(executionPreview.previewTicket?.expiresAt)}</div>
                    </div>
                    <div className="list-item list-item--column">
                      <strong>Warnings</strong>
                      {(executionPreview.warnings || []).length ? (executionPreview.warnings || []).map((item) => <span key={item} className="muted">{item}</span>) : <span className="muted">sem warnings críticos</span>}
                    </div>
                    <div className="list-item list-item--column">
                      <strong>Confirmações</strong>
                      {(executionPreview.confirmationsRequired || []).length ? (executionPreview.confirmationsRequired || []).map((item) => <span key={item} className="muted">{item}</span>) : <span className="muted">nenhuma</span>}
                    </div>
                  </div>
                ) : null}
              </div>

              {(execution.recentReconciliations || []).slice(0, 4).map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div>
                    <strong>Reconciliação #{item.id}</strong>
                    <div className="muted">
                      {formatDateTime(item.createdAt)} • Open orders remotas: {formatNumber(item.summary?.remoteOpenOrdersCount || 0, 0)} • Saldos não zerados: {formatNumber(item.summary?.remoteNonZeroBalancesCount || 0, 0)}
                    </div>
                  </div>
                  <div className="button-row">
                    <Pill tone={item.status === 'ok' ? 'buy' : item.status === 'warning' ? 'warning' : 'high'}>{item.status}</Pill>
                    <span className="muted">mismatches: {formatNumber(item.summary?.mismatchCounts?.unmatchedBalances || 0, 0)}/{formatNumber(item.summary?.mismatchCounts?.localOnlyPositions || 0, 0)}/{formatNumber(item.summary?.mismatchCounts?.remoteOnlySymbols || 0, 0)}</span>
                  </div>
                </div>
              ))}

              {(execution.recentActionLogs || []).slice(0, 5).map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">
                      {formatDateTime(item.createdAt)} • {item.actor} • {item.symbol || 'sem símbolo'} {item.side ? `• ${item.side}` : ''}
                    </div>
                  </div>
                  <div className="button-row">
                    <Pill tone={item.status === 'ok' || item.status === 'dry_run' ? 'buy' : item.status === 'warning' ? 'warning' : 'high'}>{item.status}</Pill>
                    {item.confirmationRequired ? <Pill tone="high">confirmação</Pill> : null}
                  </div>
                </div>
              ))}
            </div>
          </Section>



          <Section
            title="Observabilidade e exportação"
            subtitle="Métricas consolidadas, snapshots agendados e export de logs para auditoria externa."
            actions={(
              <div className="button-row">
                <button
                  className="button"
                  disabled={opsActionLoading === 'observability-snapshot'}
                  onClick={handleRunObservabilitySnapshot}
                >
                  {opsActionLoading === 'observability-snapshot' ? 'Gerando...' : 'Gerar snapshot'}
                </button>
                <a className="button button--ghost" href={buildObservabilityExportUrl('metrics_snapshots', 'json', 200)} target="_blank" rel="noreferrer">Export métricas JSON</a>
                <a className="button button--ghost" href={buildObservabilityExportUrl('execution_action_logs', 'csv', 1000)} target="_blank" rel="noreferrer">Export action logs CSV</a>
                <a className="button button--ghost" href={buildObservabilityExportUrl('ai_decisions', 'csv', 1000)} target="_blank" rel="noreferrer">Export decisões CSV</a>
              </div>
            )}
          >
            <div className="metric-grid">
              <StatCard
                label="Eventos 24h"
                value={formatNumber(observability?.current?.summary?.traffic24h?.systemEvents || 0, 0)}
                tone="neutral"
              />
              <StatCard
                label="Decisões 24h"
                value={formatNumber(observability?.current?.summary?.traffic24h?.aiDecisions || 0, 0)}
                tone="neutral"
              />
              <StatCard
                label="Ordens paper 24h"
                value={formatNumber(observability?.current?.summary?.traffic24h?.paperOrders || 0, 0)}
                tone="neutral"
              />
              <StatCard
                label="Workers stale"
                value={formatNumber(observability?.current?.summary?.workers?.stale || 0, 0)}
                tone={(observability?.current?.summary?.workers?.stale || 0) > 0 ? 'danger' : 'positive'}
              />
            </div>
            <div className="list-stack">
              <div className="list-item list-item--column">
                <div>
                  <strong>Snapshot atual</strong>
                  <div className="muted">
                    {formatDateTime(observability?.current?.createdAt)} • fonte: {observability?.current?.source || 'n/a'}
                  </div>
                </div>
                <div className="button-row">
                  <Pill tone={(observability?.current?.summary?.alerts?.critical || 0) > 0 ? 'high' : 'buy'}>
                    alertas críticos: {formatNumber(observability?.current?.summary?.alerts?.critical || 0, 0)}
                  </Pill>
                  <Pill tone={observability?.current?.summary?.runtime?.maintenanceMode ? 'warning' : 'info'}>
                    maintenance: {observability?.current?.summary?.runtime?.maintenanceMode ? 'on' : 'off'}
                  </Pill>
                </div>
              </div>

              {(observability?.current?.summary?.workers?.items || []).slice(0, 4).map((item) => (
                <div key={item.workerName} className="list-item list-item--column">
                  <div>
                    <strong>{item.workerName}</strong>
                    <div className="muted">Último heartbeat: {formatDateTime(item.lastSeenAt)} • idade: {formatNumber(item.ageSec || 0, 0)}s</div>
                  </div>
                  <div className="button-row">
                    <Pill tone={item.stale ? 'high' : 'buy'}>{item.stale ? 'stale' : 'ok'}</Pill>
                    <span className="muted">status: {item.status}</span>
                  </div>
                </div>
              ))}

              {(observability?.recentSnapshots || []).slice(0, 5).map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div>
                    <strong>Snapshot #{item.id}</strong>
                    <div className="muted">
                      {formatDateTime(item.createdAt)} • eventos: {formatNumber(item.summary?.traffic24h?.systemEvents || 0, 0)} • decisões: {formatNumber(item.summary?.traffic24h?.aiDecisions || 0, 0)}
                    </div>
                  </div>
                  <div className="button-row">
                    <Pill tone={(item.summary?.alerts?.critical || 0) > 0 ? 'high' : 'info'}>críticos: {formatNumber(item.summary?.alerts?.critical || 0, 0)}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </Section>


<Section
  title="Readiness e jobs agendados"
  subtitle="Checklist de prontidão para testnet supervisionada, jobs automáticos e alertas ativos do backend."
  actions={(
    <div className="button-row">
      <button
        className="button"
        disabled={opsActionLoading === 'readiness'}
        onClick={() => handleOpsAction('readiness', () => runReadinessCheck({ requestedBy: 'dashboard' }), 'Checklist de readiness executado.')}
      >
        {opsActionLoading === 'readiness' ? 'Executando...' : 'Rodar readiness'}
      </button>
      <button
        className="button button--ghost"
        disabled={opsActionLoading === 'alert-scan'}
        onClick={() => handleOpsAction('alert-scan', () => runScheduledJob('alert_scan', { requestedBy: 'dashboard' }), 'Alert scan executado.')}
      >
        {opsActionLoading === 'alert-scan' ? 'Escaneando...' : 'Rodar alert scan'}
      </button>
    </div>
  )}
>
  <div className="list-stack">
    <div className="list-item list-item--column">
      <div>
        <strong>Checklist atual</strong>
        <div className="muted">
          {latestReadiness?.createdAt ? `${formatDateTime(latestReadiness.createdAt)} • ${formatNumber(latestReadiness.summary?.counts?.pass || 0, 0)} pass / ${formatNumber(latestReadiness.summary?.counts?.warn || 0, 0)} warn / ${formatNumber(latestReadiness.summary?.counts?.fail || 0, 0)} fail` : 'Ainda não executado'}
        </div>
      </div>
      <div className="button-row">
        <Pill tone={latestReadiness?.status === 'ready' ? 'buy' : latestReadiness?.status === 'warning' ? 'warning' : 'high'}>
          {latestReadiness?.status || 'sem relatório'}
        </Pill>
      </div>
    </div>

    {(latestReadiness?.summary?.checklist || []).slice(0, 6).map((item) => (
      <div key={item.key} className="list-item list-item--column">
        <div>
          <strong>{item.label}</strong>
          <div className="muted">{item.message}</div>
        </div>
        <div className="button-row">
          <Pill tone={item.status === 'pass' ? 'buy' : item.status === 'warn' ? 'warning' : 'high'}>{item.status}</Pill>
          {item.critical ? <Pill tone="info">crítico</Pill> : null}
        </div>
      </div>
    ))}

    {(recentJobRuns || []).slice(0, 5).map((item) => (
      <div key={item.id} className="list-item list-item--column">
        <div>
          <strong>{item.jobKey}</strong>
          <div className="muted">{formatDateTime(item.startedAt)} • origem: {item.triggerSource} • solicitado por: {item.requestedBy}</div>
        </div>
        <div className="button-row">
          <Pill tone={item.status === 'ok' ? 'buy' : item.status === 'error' ? 'high' : 'warning'}>{item.status}</Pill>
        </div>
      </div>
    ))}

    {(activeAlerts || []).slice(0, 5).map((item) => (
      <div key={item.alertKey} className="list-item list-item--column">
        <div>
          <strong>{item.title}</strong>
          <div className="muted">{item.message}</div>
          <div className="muted">{item.source} • última atualização {formatDateTime(item.updatedAt)}</div>
        </div>
        <div className="button-row">
          <Pill tone={item.severity === 'critical' || item.severity === 'high' ? 'high' : 'warning'}>{item.severity}</Pill>
          <Pill tone={item.status === 'acknowledged' ? 'info' : item.status === 'resolved' ? 'buy' : 'warning'}>{item.status}</Pill>
          <button className="button button--ghost" disabled={opsActionLoading === `ack-${item.alertKey}`} onClick={() => handleOpsAction(`ack-${item.alertKey}`, () => acknowledgeAlert(item.alertKey, { actor: 'dashboard' }), 'Alerta reconhecido.')}>Reconhecer</button>
          <button className="button button--ghost" disabled={opsActionLoading === `resolve-${item.alertKey}`} onClick={() => handleOpsAction(`resolve-${item.alertKey}`, () => resolveAlert(item.alertKey, { actor: 'dashboard' }), 'Alerta resolvido.')}>Resolver</button>
        </div>
      </div>
    ))}
  </div>
</Section>

<Section
  title="Configuração ativa"
            subtitle={`Versão ${configRow?.version || 0} • Última atualização ${formatDateTime(configRow?.updated_at)}`}
            actions={<button className="button" onClick={handleSaveConfig} disabled={saving || !draftConfig}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>}
          >
            {draftConfig ? (
              <div className="form-grid">
                <ConfigField label="Trading habilitado">
                  <input type="checkbox" checked={Boolean(draftConfig.trading.enabled)} onChange={(event) => handleCheckboxChange('trading.enabled', event.target.checked)} />
                </ConfigField>
                <ConfigField label="Modo de execução">
                  <select value={draftConfig.trading.mode} onChange={(event) => handleTextChange('trading.mode', event.target.value)}>
                    <option value="paper">paper</option>
                    <option value="live">live</option>
                  </select>
                </ConfigField>
                <ConfigField label="Moeda base">
                  <select value={draftConfig.trading.baseCurrency} onChange={(event) => handleTextChange('trading.baseCurrency', event.target.value)}>
                    <option value="USDT">USDT</option>
                    <option value="BRL">BRL</option>
                    <option value="BTC">BTC</option>
                  </select>
                </ConfigField>
                <ConfigField label="Símbolos" hint="Separados por vírgula.">
                  <textarea rows="2" value={formatList(draftConfig.trading.symbols)} onChange={(event) => handleSymbolsChange(event.target.value)} />
                </ConfigField>
                <ConfigField label="Timeframe principal">
                  <input value={draftConfig.trading.primaryTimeframe} onChange={(event) => handleTextChange('trading.primaryTimeframe', event.target.value)} />
                </ConfigField>
                <ConfigField label="Timeframes de confirmação" hint="Separados por vírgula.">
                  <input value={formatList(draftConfig.trading.confirmationTimeframes)} onChange={(event) => handleTimeframesChange(event.target.value)} />
                </ConfigField>
                <ConfigField label="Lookback candles">
                  <input type="number" value={draftConfig.trading.lookbackCandles} onChange={(event) => handleNumberChange('trading.lookbackCandles', event.target.value)} />
                </ConfigField>
                <ConfigField label="Máx. posições abertas">
                  <input type="number" value={draftConfig.trading.maxOpenPositions} onChange={(event) => handleNumberChange('trading.maxOpenPositions', event.target.value)} />
                </ConfigField>
                <ConfigField label="Capital paper inicial">
                  <input type="number" value={draftConfig.execution.paper.initialCapital} onChange={(event) => handleNumberChange('execution.paper.initialCapital', event.target.value)} />
                </ConfigField>
                <ConfigField label="Tamanho da ordem (%)">
                  <input type="number" step="0.1" value={draftConfig.execution.paper.orderSizePct} onChange={(event) => handleNumberChange('execution.paper.orderSizePct', event.target.value)} />
                </ConfigField>
                <ConfigField label="Fee (%)">
                  <input type="number" step="0.01" value={draftConfig.execution.paper.feePct} onChange={(event) => handleNumberChange('execution.paper.feePct', event.target.value)} />
                </ConfigField>
                <ConfigField label="Slippage (%)">
                  <input type="number" step="0.01" value={draftConfig.execution.paper.slippagePct} onChange={(event) => handleNumberChange('execution.paper.slippagePct', event.target.value)} />
                </ConfigField>
                <ConfigField label="Stop loss ATR">
                  <input type="number" step="0.1" value={draftConfig.risk.stopLossAtr} onChange={(event) => handleNumberChange('risk.stopLossAtr', event.target.value)} />
                </ConfigField>
                <ConfigField label="Take profit ATR">
                  <input type="number" step="0.1" value={draftConfig.risk.takeProfitAtr} onChange={(event) => handleNumberChange('risk.takeProfitAtr', event.target.value)} />
                </ConfigField>
                <ConfigField label="Trailing stop ATR">
                  <input type="number" step="0.1" value={draftConfig.risk.trailingStopAtr} onChange={(event) => handleNumberChange('risk.trailingStopAtr', event.target.value)} />
                </ConfigField>
                <ConfigField label="Cooldown após perda (min)">
                  <input type="number" value={draftConfig.risk.cooldownMinutesAfterLoss} onChange={(event) => handleNumberChange('risk.cooldownMinutesAfterLoss', event.target.value)} />
                </ConfigField>
                <ConfigField label="Cooldown após stop (min)">
                  <input type="number" value={draftConfig.risk.cooldownMinutesAfterStopLoss} onChange={(event) => handleNumberChange('risk.cooldownMinutesAfterStopLoss', event.target.value)} />
                </ConfigField>
                <ConfigField label="Máx. perdas consecutivas">
                  <input type="number" value={draftConfig.risk.maxConsecutiveLosses} onChange={(event) => handleNumberChange('risk.maxConsecutiveLosses', event.target.value)} />
                </ConfigField>
                <ConfigField label="Perda diária máxima (%)">
                  <input type="number" step="0.1" value={draftConfig.risk.dailyMaxLossPct} onChange={(event) => handleNumberChange('risk.dailyMaxLossPct', event.target.value)} />
                </ConfigField>
                <ConfigField label="Confiança mínima BUY">
                  <input type="number" step="0.01" value={draftConfig.ai.minConfidenceToBuy} onChange={(event) => handleNumberChange('ai.minConfidenceToBuy', event.target.value)} />
                </ConfigField>
                <ConfigField label="Confiança mínima SELL">
                  <input type="number" step="0.01" value={draftConfig.ai.minConfidenceToSell} onChange={(event) => handleNumberChange('ai.minConfidenceToSell', event.target.value)} />
                </ConfigField>
                <ConfigField label="Margem de decisão">
                  <input type="number" step="0.01" value={draftConfig.ai.decisionMargin} onChange={(event) => handleNumberChange('ai.decisionMargin', event.target.value)} />
                </ConfigField>
                <ConfigField label="Social habilitado">
                  <input type="checkbox" checked={Boolean(draftConfig.social.enabled)} onChange={(event) => handleCheckboxChange('social.enabled', event.target.checked)} />
                </ConfigField>
              </div>
            ) : null}
          </Section>

          <Section
            title="Backtest e replay"
            subtitle="Executa replay com os mesmos experts da estratégia e compara uma configuração challenger contra a ativa."
            actions={(
              <div className="button-row">
                <button className="button" onClick={handleRunBacktest} disabled={backtestLoading === 'run'}>{backtestLoading === 'run' ? 'Executando...' : 'Rodar backtest'}</button>
                <button className="button button--ghost" onClick={handleCompareBacktest} disabled={backtestLoading === 'compare'}>{backtestLoading === 'compare' ? 'Comparando...' : 'Comparar config'}</button>
              </div>
            )}
          >
            <div className="form-grid">
              <ConfigField label="Símbolo">
                <input value={backtestForm.symbol} onChange={(event) => setBacktestForm((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
              </ConfigField>
              <ConfigField label="Intervalo principal">
                <input value={backtestForm.interval} onChange={(event) => setBacktestForm((current) => ({ ...current, interval: event.target.value }))} />
              </ConfigField>
              <ConfigField label="Intervalo de confirmação">
                <input value={backtestForm.confirmationInterval} onChange={(event) => setBacktestForm((current) => ({ ...current, confirmationInterval: event.target.value }))} />
              </ConfigField>
              <ConfigField label="Quantidade de candles">
                <input type="number" min="150" max="1000" value={backtestForm.limit} onChange={(event) => setBacktestForm((current) => ({ ...current, limit: parseNumberInput(event.target.value, 400) }))} />
              </ConfigField>
            </div>

            {comparisonResult ? (
              <div className="metric-grid">
                <div className="list-item list-item--column">
                  <strong>Baseline #{comparisonResult.baseline.id}</strong>
                  <div className="muted">Retorno {formatPercent(comparisonResult.baseline.metrics.totalReturnPct || 0)}</div>
                  <div className="muted">Drawdown {formatPercent(comparisonResult.baseline.metrics.maxDrawdownPct || 0)}</div>
                </div>
                <div className="list-item list-item--column">
                  <strong>Challenger #{comparisonResult.challenger.id}</strong>
                  <div className="muted">Retorno {formatPercent(comparisonResult.challenger.metrics.totalReturnPct || 0)}</div>
                  <div className="muted">Drawdown {formatPercent(comparisonResult.challenger.metrics.maxDrawdownPct || 0)}</div>
                </div>
                <div className="list-item list-item--column">
                  <strong>Delta</strong>
                  <div className={Number(comparisonResult.delta.totalReturnPct || 0) >= 0 ? 'text-positive' : 'text-danger'}>Retorno {formatPercent(comparisonResult.delta.totalReturnPct || 0)}</div>
                  <div className={Number(comparisonResult.delta.outperformancePct || 0) >= 0 ? 'text-positive' : 'text-danger'}>Outperformance {formatPercent(comparisonResult.delta.outperformancePct || 0)}</div>
                </div>
              </div>
            ) : null}

            <div className="table-wrap compact-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Symbol</th>
                    <th>Intervalo</th>
                    <th>Retorno</th>
                    <th>Drawdown</th>
                    <th>Win rate</th>
                    <th>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBacktests?.length ? recentBacktests.map((run) => (
                    <tr key={run.id}>
                      <td>#{run.id}<br /><span className="muted">{run.label}</span></td>
                      <td>{run.symbol}</td>
                      <td>{run.interval} / {run.confirmationInterval}</td>
                      <td className={Number(run.metrics?.totalReturnPct || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatPercent(run.metrics?.totalReturnPct || 0)}</td>
                      <td className={Number(run.metrics?.maxDrawdownPct || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatPercent(run.metrics?.maxDrawdownPct || 0)}</td>
                      <td>{formatPercent(run.metrics?.winRatePct || 0)}</td>
                      <td>{formatNumber(run.metrics?.tradesCount || 0, 0)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7" className="muted">Nenhum backtest executado ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Portfólio paper" subtitle={`Base ${baseCurrency} • ${portfolio.openPositionsCount || 0} posições abertas`}>
            <div className="table-wrap compact-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Qtd</th>
                    <th>Entrada</th>
                    <th>Preço atual</th>
                    <th>Unrealized</th>
                    <th>Stops</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions?.length ? portfolio.positions.map((position) => (
                    <tr key={position.symbol}>
                      <td>{position.symbol}</td>
                      <td>{formatNumber(position.quantity, 6)}</td>
                      <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                      <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                      <td className={Number(position.unrealizedPnl) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(position.unrealizedPnl, baseCurrency)}</td>
                      <td className="muted">
                        SL {formatMoney(position.stopLossPrice, baseCurrency)}<br />
                        TP {formatMoney(position.takeProfitPrice, baseCurrency)}<br />
                        TR {formatMoney(position.trailingStopPrice, baseCurrency)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" className="muted">Nenhuma posição aberta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Ordens recentes" subtitle="Inclui PnL realizado por venda e rejeições operacionais.">
            <div className="table-wrap compact-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Symbol</th>
                    <th>Lado</th>
                    <th>Status</th>
                    <th>Preço</th>
                    <th>PnL</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {currentOrders?.length ? currentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>{order.symbol}</td>
                      <td>{order.side}</td>
                      <td>{order.status}</td>
                      <td>{formatMoney(order.price, baseCurrency)}</td>
                      <td className={Number(order.realizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(order.realizedPnl || 0, baseCurrency)}</td>
                      <td className="muted">{order.rejectionReason || order.reason || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" className="muted">Nenhuma ordem encontrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <aside className="layout-grid__side">
          <Section title="Cooldowns por moeda" subtitle="Entradas BUY ficam bloqueadas enquanto o cooldown estiver ativo.">
            <div className="list-stack compact-scroll">
              {controlState?.activeCooldowns?.length ? controlState.activeCooldowns.map((item) => (
                <div key={item.symbol} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.symbol}</strong>
                    <Pill tone="warning">{item.cooldownType}</Pill>
                  </div>
                  <div className="muted">{item.reason}</div>
                  <div className="muted">Até {formatDateTime(item.activeUntil)}</div>
                  <button className="button button--ghost" onClick={() => handleControlAction(`clear-${item.symbol}`, () => clearCooldown(item.symbol))}>Limpar cooldown</button>
                </div>
              )) : <div className="muted">Nenhum cooldown ativo.</div>}
            </div>
          </Section>

          <Section title="Decisões da AI" subtitle="Últimos sinais emitidos pelo meta-decisor.">
            <div className="list-stack compact-scroll">
              {currentDecisions?.length ? currentDecisions.map((decision) => (
                <div key={decision.id} className="decision-card">
                  <div className="decision-card__row">
                    <strong>{decision.symbol}</strong>
                    <Pill tone={decision.action === 'BUY' ? 'buy' : decision.action === 'SELL' ? 'sell' : decision.action === 'BLOCK' ? 'info' : 'warning'}>{decision.action}</Pill>
                  </div>
                  <div className="muted">Confiança {formatPercent((decision.confidence || 0) * 100)}</div>
                  <div className="muted">{decision.reason || 'sem razão'}</div>
                  <div className="muted">{formatDateTime(decision.created_at || decision.createdAt)}</div>
                </div>
              )) : <div className="muted">Nenhuma decisão recente.</div>}
            </div>
          </Section>

          <Section title="Ranking social" subtitle="Sugestões e alertas continuam consultivos, com veto só em risco extremo.">
            <div className="list-stack compact-scroll">
              {socialScores?.length ? socialScores.map((item) => (
                <div key={item.symbol} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.symbol}</strong>
                    <Pill tone={item.classification === 'FORTE' ? 'buy' : item.classification === 'ALTO_RISCO' ? 'high' : 'info'}>{item.classification}</Pill>
                  </div>
                  <div className="muted">Score {formatNumber(item.socialScore, 1)} • Risco {formatNumber(item.socialRisk, 1)}</div>
                  <div className="muted">Fontes: {formatList(item.sources)}</div>
                </div>
              )) : <div className="muted">Sem scores sociais.</div>}
            </div>
          </Section>

          <Section title="Providers sociais" subtitle="CoinGecko Demo continua opcional e com fallback de cache local.">
            <div className="list-stack compact-scroll">
              {providerStatuses.length ? providerStatuses.map((provider) => (
                <div key={provider.providerKey} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{provider.providerName}</strong>
                    <Pill tone={provider.status === 'ok' ? 'buy' : provider.status === 'backoff' ? 'warning' : 'high'}>{provider.status}</Pill>
                  </div>
                  <div className="muted">Modo {provider.mode} • Retry {formatDateTime(provider.retryAfterAt)}</div>
                </div>
              )) : <div className="muted">Sem providers registrados.</div>}
              <div className="muted">{socialSummary?.attribution?.coingecko || 'Data provided by CoinGecko Demo API when available.'}</div>
            </div>
          </Section>


<Section title="Calibrações recentes" subtitle="Runs automáticos com ranking por símbolo e regime.">
  <div className="list-stack compact-scroll">
    {recentOptimizations?.length ? recentOptimizations.map((item) => (
      <div key={item.id} className="list-item list-item--column">
        <div className="decision-card__row">
          <strong>{item.label}</strong>
          <Pill tone="info">{item.objective}</Pill>
        </div>
        <div className="muted">{formatDateTime(item.createdAt)}</div>
        <div className="muted">Melhor score médio: {formatNumber(item.summary?.averageScore || 0, 2)}</div>
        <div className="muted">Top: {item.summary?.bestOverall?.symbol || '—'} / {item.summary?.bestOverall?.candidateName || '—'}</div>
        <div className="button-row">
          <button
            className="button button--ghost"
            disabled={promotionLoading === `simulate-paper_active-${item.id}`}
            onClick={() => handleSimulatePromotion(item.id, 'paper_active')}
          >
            {promotionLoading === `simulate-paper_active-${item.id}` ? 'Simulando...' : 'Simular paper'}
          </button>
          <button
            className="button"
            disabled={promotionLoading === `request-paper_active-${item.id}`}
            onClick={() => handleRequestPromotion(item.id, 'paper_active')}
          >
            {promotionLoading === `request-paper_active-${item.id}` ? 'Solicitando...' : 'Solicitar aprovação paper'}
          </button>
          <button
            className="button button--ghost"
            disabled={promotionLoading === `request-live_candidate-${item.id}`}
            onClick={() => handleRequestPromotion(item.id, 'live_candidate')}
          >
            {promotionLoading === `request-live_candidate-${item.id}` ? 'Solicitando...' : 'Solicitar live review'}
          </button>
        </div>
      </div>
    )) : <div className="muted">Sem calibrações recentes.</div>}
  </div>
</Section>

          <Section title="Simulação de promoção" subtitle="Prévia assistida antes de virar solicitação ou aplicação.">
            <div className="list-stack compact-scroll">
              {promotionSimulation ? (
                <div className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{promotionSimulation.summary?.candidateName || promotionSimulation.winner?.candidateName || 'simulação'}</strong>
                    <Pill tone="info">{promotionSimulation.targetChannel || promotionSimulation.simulation?.targetChannel || 'paper_active'}</Pill>
                  </div>
                  <div className="muted">Símbolo {promotionSimulation.summary?.symbol || promotionSimulation.winner?.symbol || '—'} • score {formatNumber(promotionSimulation.summary?.score || promotionSimulation.winner?.score || 0, 2)}</div>
                  <div className="muted">Versão atual {promotionSimulation.currentVersion || promotionSimulation.simulation?.currentVersion || 0}</div>
                  <div className="muted">Mudanças: {(promotionSimulation.simulation?.changedPaths || []).slice(0, 5).map((item) => item.path).join(', ') || 'sem mudanças mapeadas'}</div>
                  <div className="button-row">
                    {promotionSimulation.simulation?.warnings?.length ? promotionSimulation.simulation.warnings.map((warning) => (
                      <Pill key={warning} tone="warning">{warning}</Pill>
                    )) : <Pill tone="buy">sem alertas críticos</Pill>}
                  </div>
                </div>
              ) : <div className="muted">Use “Simular paper” em uma calibração para ver a prévia.</div>}
            </div>
          </Section>

          <Section title="Solicitações de aprovação" subtitle="Fluxo em duas etapas: requester cria, reviewer aprova ou rejeita.">
            <div className="list-stack compact-scroll">
              {recentApprovalRequests?.length ? recentApprovalRequests.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>Request #{item.id}</strong>
                    <Pill tone={item.status === 'pending' ? 'warning' : item.status?.includes('approved') ? 'buy' : item.status === 'rejected' ? 'high' : 'info'}>{item.status}</Pill>
                  </div>
                  <div className="muted">{item.summary?.candidateName || 'candidate'} • {item.summary?.symbol || '—'} • {item.targetChannel}</div>
                  <div className="muted">Requester {item.requestedBy || '—'} • {formatDateTime(item.createdAt)}</div>
                  <div className="button-row">
                    {item.status === 'pending' ? (
                      <>
                        <button className="button" disabled={promotionLoading === `approve-${item.id}`} onClick={() => handleApproveRequest(item.id)}>
                          {promotionLoading === `approve-${item.id}` ? 'Aprovando...' : 'Aprovar'}
                        </button>
                        <button className="button button--ghost" disabled={promotionLoading === `reject-${item.id}`} onClick={() => handleRejectRequest(item.id)}>
                          {promotionLoading === `reject-${item.id}` ? 'Rejeitando...' : 'Rejeitar'}
                        </button>
                      </>
                    ) : (
                      <span className="muted">Conclusão: {item.approvedBy || item.rejectedBy || '—'}</span>
                    )}
                  </div>
                </div>
              )) : <div className="muted">Sem solicitações recentes.</div>}
            </div>
          </Section>

          <Section title="Promoções recentes" subtitle="Aplicações em paper e candidatas para revisão live, sempre com segurança.">
            <div className="list-stack compact-scroll">
              {recentPromotions?.length ? recentPromotions.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.summary?.candidateName || 'winner'}</strong>
                    <Pill tone={item.status === 'applied' || item.status === 'rollback_applied' ? 'buy' : 'warning'}>{item.targetChannel}</Pill>
                  </div>
                  <div className="muted">{item.summary?.symbol || '—'} • {item.summary?.regimeLabel || 'mixed'}</div>
                  <div className="muted">Status {item.status} • versão {item.appliedVersion || 'não aplicada'}</div>
                  <div className="muted">{formatDateTime(item.createdAt)}</div>
                </div>
              )) : <div className="muted">Sem promoções recentes.</div>}
            </div>
          </Section>

          <Section title="Auditoria de configuração" subtitle="Toda mudança relevante de configuração fica registrada com origem e versão.">
            <div className="list-stack compact-scroll">
              {configAudit?.length ? configAudit.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.actionType}</strong>
                    <Pill tone="info">{item.actor}</Pill>
                  </div>
                  <div className="muted">Versão {item.fromVersion || '—'} → {item.toVersion || '—'}</div>
                  <div className="muted">Origem {item.sourceType || 'manual'} #{item.sourceId || '—'}</div>
                  <div className="muted">{formatDateTime(item.createdAt)}</div>
                </div>
              )) : <div className="muted">Sem auditoria registrada.</div>}
            </div>
          </Section>

          <Section title="Histórico de configuração" subtitle="Versões anteriores para auditoria e rollback assistido.">
            <div className="list-stack compact-scroll">
              {configHistory?.length ? configHistory.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <strong>Versão {item.version}</strong>
                  <div className="muted">{formatDateTime(item.createdAt)}</div>
                  <div className="button-row">
                    <button className="button button--ghost" disabled={promotionLoading === `rollback-${item.version}` || Number(item.version) === Number(configRow?.version || 0)} onClick={() => handleRollbackVersion(item.version)}>
                      {promotionLoading === `rollback-${item.version}` ? 'Aplicando...' : Number(item.version) === Number(configRow?.version || 0) ? 'Versão atual' : 'Rollback para esta versão'}
                    </button>
                  </div>
                </div>
              )) : <div className="muted">Sem histórico adicional ainda.</div>}
            </div>
          </Section>



          <Section title="Policy gates e maintenance" subtitle="Promoções e readiness agora respeitam gates mais fortes antes de paper/live review.">
            <div className="list-stack compact-scroll">
              <div className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>Maintenance mode</strong>
                  <Pill tone={controlState?.maintenanceMode ? 'warning' : 'buy'}>{controlState?.maintenanceMode ? 'ativo' : 'desligado'}</Pill>
                </div>
                <div className="muted">{controlState?.maintenanceReason || 'Sem maintenance mode ativo.'}</div>
              </div>
              {policyReports?.length ? policyReports.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.gateType}</strong>
                    <Pill tone={item.status === 'pass' ? 'buy' : item.status === 'warning' ? 'warning' : 'high'}>{item.status}</Pill>
                  </div>
                  <div className="muted">Canal: {item.targetChannel || '—'} • {formatDateTime(item.createdAt)}</div>
                  <div className="muted">Checks: {formatNumber(item.summary?.checks?.length || 0, 0)} • Readiness: {item.summary?.readinessStatus || '—'}</div>
                </div>
              )) : <div className="muted">Sem policy gates recentes.</div>}
            </div>
          </Section>

          <Section title="Alertas externos" subtitle="Webhook, Telegram e email-ready ficam prontos para integração e teste manual.">
            <div className="list-stack compact-scroll">
              {(notifications.channels || []).length ? notifications.channels.map((channel) => (
                <div key={channel.key} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{channel.key}</strong>
                    <Pill tone={channel.ready ? 'buy' : channel.configured ? 'warning' : 'info'}>{channel.ready ? 'ready' : channel.configured ? 'parcial' : 'desligado'}</Pill>
                  </div>
                  <div className="muted">Destino: {channel.destination || 'não configurado'}</div>
                  <div className="button-row">
                    <button className="button button--ghost" disabled={notificationLoading === channel.key || (!channel.ready && channel.key !== 'email_ready')} onClick={() => handleSendTestNotification(channel.key)}>{notificationLoading === channel.key ? 'Enviando...' : 'Testar canal'}</button>
                  </div>
                </div>
              )) : <div className="muted">Sem canais de alerta configurados.</div>}
              {(notifications.recentDeliveries || []).length ? notifications.recentDeliveries.slice(0, 5).map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.channel}</strong>
                    <Pill tone={item.status === 'sent' ? 'buy' : item.status === 'prepared' ? 'warning' : 'high'}>{item.status}</Pill>
                  </div>
                  <div className="muted">{item.eventType} • {formatDateTime(item.createdAt)}</div>
                </div>
              )) : null}
            </div>
          </Section>

          <Section title="Runbooks e incidentes" subtitle="Playbooks operacionais para simular incidentes e executar recuperação guiada sem mexer direto nos workers.">
            <div className="list-stack compact-scroll">
              {runbooks?.length ? runbooks.map((item) => (
                <div key={item.runbookKey} className="list-item list-item--column">
                  <div className="decision-card__row">
                    <strong>{item.title}</strong>
                    <Pill tone={item.severity === 'critical' ? 'high' : item.severity === 'high' ? 'warning' : 'info'}>{item.severity}</Pill>
                  </div>
                  <div className="muted">{item.description}</div>
                  <div className="muted">Sinais: {formatList(item.detectionSignals || []).slice(0, 180) || '—'}</div>
                  <div className="muted">Passos: {formatNumber(item.steps?.length || 0, 0)} • Ações: {formatNumber(item.recoveryActions?.length || 0, 0)}</div>
                  <div className="button-row">
                    <button className="button button--ghost" disabled={incidentActionLoading === `drill-${item.runbookKey}`} onClick={() => handleRunIncidentDrill(item.runbookKey, item.severity)}>
                      {incidentActionLoading === `drill-${item.runbookKey}` ? 'Simulando...' : 'Simular incidente'}
                    </button>
                    {(item.recoveryActions || []).slice(0, 3).map((action) => (
                      <button
                        key={`${item.runbookKey}-${action.actionKey}`}
                        className="button button--ghost"
                        disabled={incidentActionLoading === `recovery-${item.runbookKey}-${action.actionKey}`}
                        onClick={() => handleRunRecoveryAction(item.runbookKey, action.actionKey)}
                      >
                        {incidentActionLoading === `recovery-${item.runbookKey}-${action.actionKey}` ? 'Executando...' : action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )) : <div className="muted">Sem runbooks operacionais cadastrados.</div>}

              <div className="list-item list-item--column">
                <strong>Incidentes simulados recentes</strong>
                {recentIncidentDrills?.length ? recentIncidentDrills.slice(0, 5).map((item) => (
                  <div key={item.id} className="muted">#{item.id} • {item.title} • {item.status} • {formatDateTime(item.createdAt)}</div>
                )) : <div className="muted">Nenhuma simulação recente.</div>}
              </div>

              <div className="list-item list-item--column">
                <strong>Ações de recuperação recentes</strong>
                {recentRecoveryActions?.length ? recentRecoveryActions.slice(0, 6).map((item) => (
                  <div key={item.id} className="muted">#{item.id} • {item.runbookKey} • {item.actionLabel} • {item.status} • {formatDateTime(item.createdAt)}</div>
                )) : <div className="muted">Nenhuma ação de recuperação executada ainda.</div>}
              </div>
            </div>
          </Section>

          <Section title="Alertas sociais" subtitle="Somente sinais de observação e proteção, não de execução direta.">
            <div className="list-stack compact-scroll">
              {socialAlerts?.length ? socialAlerts.map((alert) => (
                <div key={alert.id} className="alert-card">
                  <div className="decision-card__row">
                    <strong>{alert.symbol}</strong>
                    <Pill tone={String(alert.severity).toLowerCase() === 'high' ? 'high' : 'warning'}>{alert.severity}</Pill>
                  </div>
                  <div className="muted">{alert.message}</div>
                </div>
              )) : <div className="muted">Sem alertas sociais recentes.</div>}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
