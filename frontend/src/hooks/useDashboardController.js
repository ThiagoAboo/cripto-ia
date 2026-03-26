import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '../lib/api';
import {
  DEFAULT_STATUS,
  deepClone,
  mergeConfigWithDefaults,
  parseNumberInput,
  updateAtPath,
} from '../lib/dashboard';
import {
  buildSummaryCards,
  createInitialAuxData,
  createInitialBacktestForm,
  createInitialExecutionForm,
  createInitialTrainingForm,
  resolveDashboardData,
} from '../lib/dashboard-state';

export function useDashboardController() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem('criptoia.activePage') || 'dashboard');
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [configRow, setConfigRow] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [auxData, setAuxData] = useState(createInitialAuxData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [backtestForm, setBacktestForm] = useState(createInitialBacktestForm);
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
  const [executionForm, setExecutionForm] = useState(createInitialExecutionForm);
  const [trainingForm, setTrainingForm] = useState(createInitialTrainingForm);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [selectedTrainingRunId, setSelectedTrainingRunId] = useState('');

  const loadEverything = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    localStorage.setItem('criptoia.activePage', activePage);
  }, [activePage]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  useEffect(() => {
    if (!draftConfig) return;

    setBacktestForm((current) => ({
      ...current,
      symbol: current.symbol || draftConfig?.trading?.symbols?.[0] || 'BTCUSDT',
      interval: current.interval || draftConfig?.backtest?.defaultInterval || draftConfig?.trading?.primaryTimeframe || '5m',
      confirmationInterval:
        current.confirmationInterval
        || draftConfig?.backtest?.defaultConfirmationInterval
        || draftConfig?.trading?.confirmationTimeframes?.[0]
        || '15m',
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
      try {
        setStatus(JSON.parse(event.data));
      } catch (_error) {
        // ignore malformed SSE payloads
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

  const resolved = useMemo(() => resolveDashboardData(status, auxData), [status, auxData]);

  const summaryCards = useMemo(() => buildSummaryCards({
    health,
    currentPortfolio: resolved.currentPortfolio,
    controlState: resolved.controlState,
    socialSummary: resolved.socialSummary,
  }), [health, resolved.controlState, resolved.currentPortfolio, resolved.socialSummary]);

  const trainingLogs = useMemo(
    () => (auxData.trainingLogs || []).filter((item) => (!selectedTrainingRunId ? true : String(item.trainingRunId) === String(selectedTrainingRunId))),
    [auxData.trainingLogs, selectedTrainingRunId],
  );

  const selectedTrainingRun = useMemo(
    () => resolved.recentTrainingRuns?.find((item) => String(item.id) === String(selectedTrainingRunId)) || null,
    [resolved.recentTrainingRuns, selectedTrainingRunId],
  );

  const handleTextChange = useCallback((path, value) => {
    setDraftConfig((current) => updateAtPath(current, path, value));
  }, []);

  const handleNumberChange = useCallback((path, value) => {
    setDraftConfig((current) => updateAtPath(current, path, parseNumberInput(value)));
  }, []);

  const handleCheckboxChange = useCallback((path, checked) => {
    setDraftConfig((current) => updateAtPath(current, path, checked));
  }, []);

  const handleSymbolsChange = useCallback((value) => {
    setDraftConfig((current) => updateAtPath(
      current,
      'trading.symbols',
      value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
    ));
  }, []);

  const handleTimeframesChange = useCallback((value) => {
    setDraftConfig((current) => updateAtPath(
      current,
      'trading.confirmationTimeframes',
      value.split(',').map((item) => item.trim()).filter(Boolean),
    ));
  }, []);

  const handleSaveConfig = useCallback(async () => {
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
  }, [draftConfig, loadEverything]);

  const handleControlAction = useCallback(async (actionName, action) => {
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
  }, [loadEverything]);

  const handleRunBacktest = useCallback(async () => {
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
  }, [backtestForm, loadEverything]);

  const handleCompareBacktest = useCallback(async () => {
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
            minConfidenceToBuy: Number(draftConfig?.ai?.minConfidenceToBuy || 0.64) + 0.03,
            minConfidenceToSell: Number(draftConfig?.ai?.minConfidenceToSell || 0.60) + 0.02,
            decisionMargin: Number(draftConfig?.ai?.decisionMargin || 0.05) + 0.01,
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
  }, [backtestForm, draftConfig, loadEverything]);

  const handleRunOptimization = useCallback(async () => {
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
  }, [backtestForm, draftConfig]);

  const handleSimulatePromotion = useCallback(async (optimizationRunId, targetChannel) => {
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
  }, []);

  const handleRequestPromotion = useCallback(async (optimizationRunId, targetChannel) => {
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
  }, [loadEverything]);

  const handleApproveRequest = useCallback(async (requestId) => {
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
  }, [loadEverything]);

  const handleRejectRequest = useCallback(async (requestId) => {
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
  }, [loadEverything]);

  const handleRollbackVersion = useCallback(async (version) => {
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
  }, [loadEverything]);

  const handleExecutionAction = useCallback(async (actionName, action, successMessage) => {
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
  }, [loadEverything]);

  const handlePreviewLiveOrder = useCallback(async () => {
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
  }, [executionForm, loadEverything]);

  const handleSubmitLiveOrder = useCallback(async () => {
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
      setExecutionPreview((current) => (current ? { ...current, lastSubmitResult: result } : { lastSubmitResult: result }));
      setSaveMessage(`Execução supervisionada concluída com status ${result.status}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao enviar ordem real supervisionada.');
    } finally {
      setExecutionActionLoading('');
    }
  }, [executionForm, executionPreview?.previewTicket?.id, loadEverything]);

  const handleOpsAction = useCallback(async (actionName, action, successMessage) => {
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
  }, [loadEverything]);

  const handleMaintenanceAction = useCallback(async (enabled) => {
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
  }, [loadEverything]);

  const handleRunObservabilitySnapshot = useCallback(async () => {
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
  }, [loadEverything]);

  const handleSendTestNotification = useCallback(async (channel = 'all') => {
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
  }, [loadEverything]);

  const handleRunIncidentDrill = useCallback(async (scenarioKey, severity = 'warning') => {
    setIncidentActionLoading(`drill-${scenarioKey}`);
    setError('');
    try {
      await runIncidentDrill({
        scenarioKey,
        severity,
        actor: 'dashboard',
        notes: `Simulação disparada pelo painel para ${scenarioKey}.`,
      });
      setSaveMessage(`Incidente simulado para ${scenarioKey}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao simular incidente.');
    } finally {
      setIncidentActionLoading('');
    }
  }, [loadEverything]);

  const handleRunRecoveryAction = useCallback(async (runbookKey, actionKey) => {
    setIncidentActionLoading(`recovery-${runbookKey}-${actionKey}`);
    setError('');
    try {
      await runRecoveryAction({
        runbookKey,
        actionKey,
        actor: 'dashboard',
        notes: `Ação ${actionKey} disparada pelo painel.`,
      });
      setSaveMessage(`Ação ${actionKey} executada para ${runbookKey}.`);
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao executar ação de recuperação.');
    } finally {
      setIncidentActionLoading('');
    }
  }, [loadEverything]);

  const handleRunTrainingAssistance = useCallback(async () => {
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
  }, [draftConfig?.training?.evaluationWindowDays, loadEverything, trainingForm]);

  const pageContext = {
    health,
    status,
    configRow,
    draftConfig,
    ...resolved,
    trainingLogs,
    selectedTrainingRun,
    selectedTrainingRunId,
    setSelectedTrainingRunId,
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

  return {
    activePage,
    setActivePage,
    loading,
    error,
    saveMessage,
    sseConnected,
    health,
    loadEverything,
    pageContext,
  };
}
