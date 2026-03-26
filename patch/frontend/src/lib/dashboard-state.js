import { formatDateTime, formatMoney, formatNumber } from './format.js';
import { DEFAULT_STATUS } from './dashboard.js';

export function createInitialAuxData() {
  return {
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
    trainingSummary: null,
    trainingRuns: [],
    trainingLogs: [],
    trainingQualityReports: [],
    trainingDriftReports: [],
    trainingExpertReports: [],
  };
}

export function createInitialExecutionForm() {
  return {
    symbol: 'BTCUSDT',
    side: 'BUY',
    requestedNotional: 100,
    requestedQuantity: 0,
    confirmationPhrase: '',
  };
}

export function createInitialBacktestForm() {
  return {
    symbol: 'BTCUSDT',
    interval: '5m',
    confirmationInterval: '15m',
    limit: 400,
  };
}

export function createInitialTrainingForm() {
  return {
    label: 'manual-training-assistance',
    objective: 'quality_assistance',
    windowDays: 14,
    symbolScope: '',
    applySuggestedWeights: false,
  };
}

export function resolveDashboardData(status = DEFAULT_STATUS, auxData = createInitialAuxData()) {
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
  const runbooks = status.runbooks?.length ? status.runbooks : auxData.runbooks;
  const recentIncidentDrills = status.recentIncidentDrills?.length ? status.recentIncidentDrills : auxData.incidentDrills;
  const recentRecoveryActions = status.recentRecoveryActions?.length ? status.recentRecoveryActions : auxData.recoveryActions;
  const trainingSummary = status.training?.summary || auxData.trainingSummary?.summary || auxData.trainingSummary;
  const recentTrainingRuns = status.training?.recentRuns?.length ? status.training.recentRuns : auxData.trainingRuns;
  const recentTrainingQualityReports = status.training?.recentQualityReports?.length
    ? status.training.recentQualityReports
    : auxData.trainingQualityReports;
  const recentTrainingDriftReports = status.training?.recentDriftReports?.length
    ? status.training.recentDriftReports
    : auxData.trainingDriftReports;
  const recentTrainingExpertReports = status.training?.recentExpertEvaluations?.length
    ? status.training.recentExpertEvaluations
    : auxData.trainingExpertReports;

  return {
    currentPortfolio,
    currentOrders,
    currentDecisions,
    socialScores,
    socialAlerts,
    socialSummary,
    controlState,
    configHistory,
    configAudit,
    recentPromotions,
    recentApprovalRequests,
    recentBacktests,
    recentOptimizations,
    activeAlerts: status.activeAlerts || [],
    latestReadiness: status.latestReadiness || null,
    recentJobRuns: status.recentJobRuns || [],
    execution: status.execution || DEFAULT_STATUS.execution,
    notifications: status.notifications || DEFAULT_STATUS.notifications,
    policyReports: status.policy?.recentReports || [],
    observability: status.observability || DEFAULT_STATUS.observability,
    runbooks,
    recentIncidentDrills,
    recentRecoveryActions,
    trainingSummary,
    recentTrainingRuns,
    recentTrainingQualityReports,
    recentTrainingDriftReports,
    recentTrainingExpertReports,
    providerStatuses: socialSummary?.providers || [],
    baseCurrency: currentPortfolio?.baseCurrency || 'USDT',
  };
}

export function buildSummaryCards({ health, currentPortfolio, controlState, socialSummary }) {
  const portfolio = currentPortfolio || { baseCurrency: 'USDT' };
  const cardCurrency = portfolio.baseCurrency || 'USDT';
  const guardrails = controlState?.guardrails || {};

  return [
    {
      label: 'Backend',
      value: health?.ok ? 'Online' : 'Indisponível',
      hint: health?.timestamp ? `Última checagem: ${formatDateTime(health.timestamp)}` : 'Sem resposta',
      tone: health?.ok ? 'positive' : 'danger',
    },
    {
      label: 'Patrimônio simulado',
      value: formatMoney(portfolio.equity || 0, cardCurrency),
      hint: `Caixa: ${formatMoney(portfolio.cashBalance || 0, cardCurrency)}`,
    },
    {
      label: 'PnL realizado',
      value: formatMoney(portfolio.realizedPnl || 0, cardCurrency),
      hint: `Taxas: ${formatMoney(portfolio.feesPaid || 0, cardCurrency)}`,
      tone: Number(portfolio.realizedPnl || 0) >= 0 ? 'positive' : 'danger',
    },
    {
      label: 'Controle do bot',
      value: controlState?.emergencyStop
        ? 'EMERGÊNCIA'
        : controlState?.maintenanceMode
          ? 'MANUTENÇÃO'
          : controlState?.isPaused
            ? 'PAUSADO'
            : 'ATIVO',
      hint: controlState?.maintenanceMode
        ? (controlState?.maintenanceReason || 'Modo de manutenção ativo')
        : (controlState?.pauseReason || 'Sem bloqueios globais'),
      tone: controlState?.emergencyStop
        ? 'danger'
        : controlState?.maintenanceMode || controlState?.isPaused
          ? 'warning'
          : 'positive',
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
}
