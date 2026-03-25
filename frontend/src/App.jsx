import { useEffect, useMemo, useState } from 'react';
import {
  acknowledgeAlert,
  approvePromotionRequest,
  buildObservabilityExportUrl,
  clearMaintenanceMode,
  clearCooldown,
  compareBacktests,
  fetchBacktests,
  fetchConfig,
  fetchConfigAudit,
  fetchConfigHistory,
  fetchControl,
  fetchDecisions,
  fetchHealth,
  fetchIncidentDrills,
  fetchOptimizations,
  fetchOrders,
  fetchPortfolio,
  fetchPromotionRequests,
  fetchPromotions,
  fetchRecoveryActions,
  fetchRunbooks,
  fetchSocialAlerts,
  fetchSocialScores,
  fetchSocialSummary,
  fetchStatus,
  fetchTrainingDriftReports,
  fetchTrainingExpertReports,
  fetchTrainingLogs,
  fetchTrainingQualityReports,
  fetchTrainingRuns,
  fetchTrainingSummary,
  getApiBaseUrl,
  pauseControl,
  previewExecutionOrder,
  rejectPromotionRequest,
  resolveAlert,
  resumeControl,
  rollbackConfigVersion,
  runBacktest,
  runExecutionHealthcheck,
  runExecutionReconciliation,
  runIncidentDrill,
  runObservabilitySnapshot,
  runOptimization,
  runReadinessCheck,
  runRecoveryAction,
  runScheduledJob,
  runTrainingAssistance,
  sendTestNotification,
  setMaintenanceMode,
  simulatePromotionWinner,
  requestPromotionApproval,
  submitLiveOrder,
  triggerEmergencyStop,
  updateConfig,
} from './lib/api';
import { formatDateTime, formatList, formatMoney, formatNumber, formatPercent } from './lib/format';
import StatusBadge from './components/StatusBadge';
import SidebarNav from './components/SidebarNav';
import StatCard from './components/StatCard';
import DashboardPage from './pages/DashboardPage';
import ConfiguracaoPage from './pages/ConfiguracaoPage';
import OperacoesPage from './pages/OperacoesPage';
import ExecucaoPage from './pages/ExecucaoPage';
import GovernancaPage from './pages/GovernancaPage';
import SocialPage from './pages/SocialPage';
import TreinamentoPage from './pages/TreinamentoPage';
import {
  DEFAULT_CONFIG,
  DEFAULT_STATUS,
  deepClone,
  mergeConfigWithDefaults,
  parseNumberInput,
  traduzirFonte,
  updateAtPath,
} from './lib/dashboard';

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', hint: 'Visão geral da operação' },
  { key: 'config', label: 'Configuração', hint: 'Parâmetros do sistema e da IA' },
  { key: 'operacoes', label: 'Operações', hint: 'Portfólio, ordens e backtests' },
  { key: 'execucao', label: 'Execução', hint: 'Controles, saúde e envio supervisionado' },
  { key: 'governanca', label: 'Governança', hint: 'Promoções, policy, observabilidade e incidentes' },
  { key: 'social', label: 'Social', hint: 'Sugestões consultivas e provedores' },
  { key: 'treinamento', label: 'Treinamento', hint: 'Qualidade do modelo, drift e logs' },
];

export default function App() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem('criptoia.activePage') || 'dashboard');
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
    trainingSummary: null,
    trainingRuns: [],
    trainingLogs: [],
    trainingQualityReports: [],
    trainingDriftReports: [],
    trainingExpertReports: [],
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
  const [trainingForm, setTrainingForm] = useState({
    label: 'manual-training-assistance',
    objective: 'quality_assistance',
    windowDays: 14,
    symbolScope: '',
    applySuggestedWeights: false,
  });
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [selectedTrainingRunId, setSelectedTrainingRunId] = useState('');

  useEffect(() => {
    localStorage.setItem('criptoia.activePage', activePage);
  }, [activePage]);

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
        trainingSummaryData,
        trainingRunsData,
        trainingLogsData,
        trainingQualityReportsData,
        trainingDriftReportsData,
        trainingExpertReportsData,
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
        fetchTrainingSummary(),
        fetchTrainingRuns(10),
        fetchTrainingLogs(100),
        fetchTrainingQualityReports(10),
        fetchTrainingDriftReports(10),
        fetchTrainingExpertReports(10),
      ]);

      setHealth(healthData);
      setConfigRow(configData);
      setDraftConfig(deepClone(mergeConfigWithDefaults(configData?.config || {})));
      setStatus(statusData || DEFAULT_STATUS);
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
        trainingSummary: trainingSummaryData,
        trainingRuns: trainingRunsData.items || [],
        trainingLogs: trainingLogsData.items || [],
        trainingQualityReports: trainingQualityReportsData.items || [],
        trainingDriftReports: trainingDriftReportsData.items || [],
        trainingExpertReports: trainingExpertReportsData.items || [],
      });
    } catch (requestError) {
      setError(requestError.message || 'Falha ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEverything(); }, []);

  useEffect(() => {
    if (!draftConfig) return;
    setBacktestForm((current) => ({
      ...current,
      symbol: current.symbol || draftConfig?.trading?.symbols?.[0] || 'BTCUSDT',
      interval: current.interval || draftConfig?.backtest?.defaultInterval || draftConfig?.trading?.primaryTimeframe || '5m',
      confirmationInterval: current.confirmationInterval || draftConfig?.backtest?.defaultConfirmationInterval || draftConfig?.trading?.confirmationTimeframes?.[0] || '15m',
      limit: current.limit || draftConfig?.backtest?.defaultLimit || draftConfig?.trading?.lookbackCandles || 400,
    }));
    setExecutionForm((current) => ({
      ...current,
      symbol: current.symbol || draftConfig?.trading?.symbols?.[0] || 'BTCUSDT',
      requestedNotional: current.requestedNotional || draftConfig?.execution?.paper?.minOrderNotional || 100,
      confirmationPhrase: current.confirmationPhrase || draftConfig?.execution?.live?.confirmationPhrase || '',
    }));
    setTrainingForm((current) => ({
      ...current,
      windowDays: current.windowDays || draftConfig?.training?.evaluationWindowDays || 14,
    }));
  }, [draftConfig]);

  useEffect(() => {
    if (selectedTrainingRunId) return;
    const candidate = status.training?.latestRun?.id || auxData.trainingRuns?.[0]?.id || '';
    if (candidate) setSelectedTrainingRunId(String(candidate));
  }, [auxData.trainingRuns, selectedTrainingRunId, status.training]);

  useEffect(() => {
    const source = new EventSource(`${getApiBaseUrl()}/api/status/stream`);
    source.addEventListener('open', () => setSseConnected(true));
    source.addEventListener('status', (event) => {
      try { setStatus(JSON.parse(event.data)); } catch (_error) { /* ignore */ }
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
  const recentJobRuns = status.recentJobRuns || [];
  const execution = status.execution || DEFAULT_STATUS.execution;
  const notifications = status.notifications || DEFAULT_STATUS.notifications;
  const policyReports = status.policy?.recentReports || [];
  const observability = status.observability || DEFAULT_STATUS.observability;
  const runbooks = status.runbooks?.length ? status.runbooks : auxData.runbooks;
  const recentIncidentDrills = status.recentIncidentDrills?.length ? status.recentIncidentDrills : auxData.incidentDrills;
  const recentRecoveryActions = status.recentRecoveryActions?.length ? status.recentRecoveryActions : auxData.recoveryActions;
  const trainingSummary = status.training?.summary || auxData.trainingSummary?.summary || auxData.trainingSummary;
  const recentTrainingRuns = status.training?.recentRuns?.length ? status.training.recentRuns : auxData.trainingRuns;
  const recentTrainingQualityReports = status.training?.recentQualityReports?.length ? status.training.recentQualityReports : auxData.trainingQualityReports;
  const recentTrainingDriftReports = status.training?.recentDriftReports?.length ? status.training.recentDriftReports : auxData.trainingDriftReports;
  const recentTrainingExpertReports = status.training?.recentExpertEvaluations?.length ? status.training.recentExpertEvaluations : auxData.trainingExpertReports;
  const trainingLogs = (auxData.trainingLogs || []).filter((item) => (!selectedTrainingRunId ? true : String(item.trainingRunId) === String(selectedTrainingRunId)));
  const selectedTrainingRun = recentTrainingRuns?.find((item) => String(item.id) === String(selectedTrainingRunId)) || null;
  const baseCurrency = currentPortfolio?.baseCurrency || 'USDT';
  const providerStatuses = socialSummary?.providers || [];

  const summaryCards = useMemo(() => {
    const portfolio = currentPortfolio || { baseCurrency: 'USDT' };
    const cardCurrency = portfolio.baseCurrency || 'USDT';
    const guardrails = controlState?.guardrails || {};
    return [
      { label: 'Backend', value: health?.ok ? 'Online' : 'Indisponível', hint: health?.timestamp ? `Última checagem: ${formatDateTime(health.timestamp)}` : 'Sem resposta', tone: health?.ok ? 'positive' : 'danger' },
      { label: 'Patrimônio simulado', value: formatMoney(portfolio.equity || 0, cardCurrency), hint: `Caixa: ${formatMoney(portfolio.cashBalance || 0, cardCurrency)}` },
      { label: 'PnL realizado', value: formatMoney(portfolio.realizedPnl || 0, cardCurrency), hint: `Taxas: ${formatMoney(portfolio.feesPaid || 0, cardCurrency)}`, tone: Number(portfolio.realizedPnl || 0) >= 0 ? 'positive' : 'danger' },
      { label: 'Controle do bot', value: controlState?.emergencyStop ? 'EMERGÊNCIA' : controlState?.maintenanceMode ? 'MANUTENÇÃO' : controlState?.isPaused ? 'PAUSADO' : 'ATIVO', hint: controlState?.maintenanceMode ? (controlState?.maintenanceReason || 'Modo de manutenção ativo') : (controlState?.pauseReason || 'Sem bloqueios globais'), tone: controlState?.emergencyStop ? 'danger' : controlState?.maintenanceMode ? 'warning' : controlState?.isPaused ? 'warning' : 'positive' },
      { label: 'Cooldowns', value: formatNumber(controlState?.activeCooldowns?.length || 0, 0), hint: `Loss streak: ${formatNumber(guardrails?.consecutiveLosses || 0, 0)}`, tone: Number(controlState?.activeCooldowns?.length || 0) > 0 ? 'warning' : 'default' },
      { label: 'Social', value: `${formatNumber(socialSummary?.strongCount || 0, 0)} fortes`, hint: `${formatNumber(socialSummary?.highRiskCount || 0, 0)} alto risco`, tone: Number(socialSummary?.highRiskCount || 0) > 0 ? 'warning' : 'default' },
    ];
  }, [controlState, currentPortfolio, health, socialSummary]);

  const handleTextChange = (path, value) => setDraftConfig((current) => updateAtPath(current, path, value));
  const handleNumberChange = (path, value) => setDraftConfig((current) => updateAtPath(current, path, parseNumberInput(value)));
  const handleCheckboxChange = (path, checked) => setDraftConfig((current) => updateAtPath(current, path, checked));
  const handleSymbolsChange = (value) => setDraftConfig((current) => updateAtPath(current, 'trading.symbols', value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)));
  const handleTimeframesChange = (value) => setDraftConfig((current) => updateAtPath(current, 'trading.confirmationTimeframes', value.split(',').map((item) => item.trim()).filter(Boolean)));

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
      setSaveMessage(`Backtest concluído para ${result.symbol}. Execução #${result.id}.`);
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
      const result = await simulatePromotionWinner(optimizationRunId, { targetChannel, rank: 1, actor: 'dashboard' });
      setPromotionSimulation(result);
      setSaveMessage(`Simulação de promoção pronta para ${targetChannel}.`);
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
      const result = await requestPromotionApproval(optimizationRunId, { targetChannel, rank: 1, requestedBy: 'dashboard_requester', reason: `request:${targetChannel}` });
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
      const result = await approvePromotionRequest(requestId, { approvedBy: 'dashboard_reviewer', approvalNote: 'approved_from_dashboard' });
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
      const result = await rejectPromotionRequest(requestId, { rejectedBy: 'dashboard_reviewer', rejectionNote: 'rejected_from_dashboard' });
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
      const result = await rollbackConfigVersion(version, { requestedBy: 'dashboard_reviewer', reason: `rollback_to_v${version}` });
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
      setError(requestError.message || 'Falha ao gerar prévia da ordem real.');
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
        payload: { source: 'dashboard' },
        previewTicketId: executionPreview?.previewTicket?.id || null,
      });
      setExecutionPreview((current) => current ? { ...current, lastSubmitResult: result } : { lastSubmitResult: result });
      setSaveMessage(`Execução supervisionada concluída com status ${result.status}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao enviar ordem real supervisionada.');
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
        setSaveMessage('Modo de manutenção ativado.');
      } else {
        await clearMaintenanceMode({ resume: false });
        setSaveMessage('Modo de manutenção desativado.');
      }
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao atualizar o modo de manutenção.');
    } finally {
      setOpsActionLoading('');
    }
  };

  const handleRunObservabilitySnapshot = async () => {
    setOpsActionLoading('observability-snapshot');
    setError('');
    try {
      await runObservabilitySnapshot({ source: 'dashboard' });
      setSaveMessage('Instantâneo de observabilidade gerado.');
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

  const handleRunTrainingAssistance = async () => {
    setTrainingLoading(true);
    setError('');
    try {
      const result = await runTrainingAssistance({
        label: trainingForm.label || 'manual-training-assistance',
        objective: trainingForm.objective || 'quality_assistance',
        windowDays: Number(trainingForm.windowDays || draftConfig?.training?.evaluationWindowDays || 14),
        symbolScope: trainingForm.symbolScope,
        applySuggestedWeights: Boolean(trainingForm.applySuggestedWeights),
        requestedBy: 'dashboard',
      });
      setSelectedTrainingRunId(String(result.id));
      setSaveMessage(`Treinamento assistido concluído. Execução #${result.id}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao executar o treinamento assistido.');
    } finally {
      setTrainingLoading(false);
    }
  };

  const sharedContext = {
    StatCard,
    health,
    status,
    configRow,
    draftConfig,
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
    activeAlerts,
    latestReadiness,
    recentJobRuns,
    execution,
    notifications,
    policyReports,
    observability,
    runbooks,
    recentIncidentDrills,
    recentRecoveryActions,
    trainingSummary,
    recentTrainingRuns,
    recentTrainingQualityReports,
    recentTrainingDriftReports,
    recentTrainingExpertReports,
    trainingLogs,
    selectedTrainingRun,
    selectedTrainingRunId,
    setSelectedTrainingRunId,
    providerStatuses,
    saving,
    actionLoading,
    backtestLoading,
    comparisonResult,
    optimizationLoading,
    optimizationResult,
    promotionLoading,
    promotionSimulation,
    executionActionLoading,
    opsActionLoading,
    executionPreview,
    notificationLoading,
    incidentActionLoading,
    executionForm,
    setExecutionForm,
    trainingForm,
    setTrainingForm,
    trainingLoading,
    backtestForm,
    setBacktestForm,
    baseCurrency,
    summaryCards,
    handleTextChange,
    handleNumberChange,
    handleCheckboxChange,
    handleSymbolsChange,
    handleTimeframesChange,
    handleSaveConfig,
    handleControlAction,
    handleRunBacktest,
    handleCompareBacktest,
    handleRunOptimization,
    handleSimulatePromotion,
    handleRequestPromotion,
    handleApproveRequest,
    handleRejectRequest,
    handleRollbackVersion,
    handleExecutionAction,
    handlePreviewLiveOrder,
    handleSubmitLiveOrder,
    handleOpsAction,
    handleMaintenanceAction,
    handleRunObservabilitySnapshot,
    handleSendTestNotification,
    handleRunIncidentDrill,
    handleRunRecoveryAction,
    handleRunTrainingAssistance,
    acknowledgeAlert,
    resolveAlert,
    clearCooldown,
    pauseControl,
    resumeControl,
    triggerEmergencyStop,
    runExecutionHealthcheck,
    runExecutionReconciliation,
    runScheduledJob,
    runReadinessCheck,
    buildObservabilityExportUrl,
  };

  const pageContent = {
    dashboard: <DashboardPage ctx={sharedContext} />,
    config: <ConfiguracaoPage ctx={sharedContext} />,
    operacoes: <OperacoesPage ctx={sharedContext} />,
    execucao: <ExecucaoPage ctx={sharedContext} />,
    governanca: <GovernancaPage ctx={sharedContext} />,
    social: <SocialPage ctx={sharedContext} />,
    treinamento: <TreinamentoPage ctx={sharedContext} />,
  };

  if (loading) {
    return <div className="app-loading">Carregando painel modular...</div>;
  }

  return (
    <div className="workspace">
      <SidebarNav items={PAGES} activeKey={activePage} onSelect={setActivePage} />

      <main className="workspace__content">
        <header className="workspace__header panel">
          <div>
            <p className="eyebrow">Cripto IA</p>
            <h2>{PAGES.find((item) => item.key === activePage)?.label || 'Dashboard'}</h2>
            <p className="workspace__subtitle">
              Painel organizado por domínio para reduzir ruído visual e facilitar manutenção. O backend, a IA e o social worker continuam desacoplados do frontend.
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

        {pageContent[activePage] || pageContent.dashboard}
      </main>
    </div>
  );
}
