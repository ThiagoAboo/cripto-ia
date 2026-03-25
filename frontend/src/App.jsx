import { useEffect, useMemo, useState } from 'react';
import {
  clearCooldown,
  compareBacktests,
  fetchBacktests,
  fetchConfig,
  fetchConfigHistory,
  fetchControl,
  fetchDecisions,
  fetchHealth,
  fetchOrders,
  fetchPortfolio,
  fetchSocialAlerts,
  fetchSocialScores,
  fetchSocialSummary,
  fetchStatus,
  getApiBaseUrl,
  runBacktest,
  pauseControl,
  resumeControl,
  triggerEmergencyStop,
  updateConfig,
} from './lib/api';
import { formatDateTime, formatList, formatMoney, formatNumber, formatPercent } from './lib/format';
import Section from './components/Section';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';

const DEFAULT_STATUS = {
  workers: [],
  recentEvents: [],
  recentDecisions: [],
  recentOrders: [],
  portfolio: { baseCurrency: 'USDT', positions: [] },
  execution: { mode: 'paper', dryRun: true, capabilities: {}, recentLiveAttempts: [] },
  social: { topScores: [], recentAlerts: [], providers: [], attribution: {} },
  control: { isPaused: false, emergencyStop: false, activeCooldowns: [], guardrails: {} },
  configHistory: [],
  recentBacktests: [],
  timestamp: null,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateAtPath(target, path, value) {
  const clone = deepClone(target);
  const keys = path.split('.');
  let cursor = clone;
  for (let index = 0; index < keys.length - 1; index += 1) {
    cursor = cursor[keys[index]];
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
    backtests: [],
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

  const loadEverything = async () => {
    setError('');
    try {
      const [
        healthData,
        configData,
        configHistoryData,
        statusData,
        portfolioData,
        ordersData,
        decisionsData,
        socialScoresData,
        socialAlertsData,
        socialSummaryData,
        controlData,
        backtestsData,
      ] = await Promise.all([
        fetchHealth(),
        fetchConfig(),
        fetchConfigHistory(10),
        fetchStatus(),
        fetchPortfolio(),
        fetchOrders(20),
        fetchDecisions(20),
        fetchSocialScores(12),
        fetchSocialAlerts(12),
        fetchSocialSummary(),
        fetchControl(),
        fetchBacktests(10),
      ]);

      setHealth(healthData);
      setConfigRow(configData);
      setDraftConfig(deepClone(configData.config));
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
        backtests: backtestsData.items || [],
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
  const recentBacktests = status.recentBacktests?.length ? status.recentBacktests : auxData.backtests;
  const execution = status.execution || DEFAULT_STATUS.execution;

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
        value: controlState?.emergencyStop ? 'EMERGÊNCIA' : controlState?.isPaused ? 'PAUSADO' : 'ATIVO',
        hint: controlState?.pauseReason || 'Sem bloqueios globais',
        tone: controlState?.emergencyStop ? 'danger' : controlState?.isPaused ? 'warning' : 'positive',
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
      setDraftConfig(deepClone(updated.config));
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
  const providerStatuses = socialSummary?.providers || [];

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cripto IA</p>
          <h1>Dashboard operacional</h1>
          <p className="hero__subtitle">
            Painel desacoplado dos workers. Nesta etapa, além do REST + SSE, o sistema ganhou pausa global,
            emergency stop, cooldown por moeda e histórico de versões da configuração.
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
                  <Pill tone={controlState?.emergencyStop ? 'high' : controlState?.isPaused ? 'warning' : 'buy'}>
                    {controlState?.emergencyStop ? 'emergência' : controlState?.isPaused ? 'pausado' : 'ativo'}
                  </Pill>
                  {controlState?.pauseReason ? <span className="muted">Motivo: {controlState.pauseReason}</span> : null}
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

          <Section title="Histórico de configuração" subtitle="Versões anteriores para auditoria e rollback manual.">
            <div className="list-stack compact-scroll">
              {configHistory?.length ? configHistory.map((item) => (
                <div key={item.id} className="list-item list-item--column">
                  <strong>Versão {item.version}</strong>
                  <div className="muted">{formatDateTime(item.createdAt)}</div>
                </div>
              )) : <div className="muted">Sem histórico adicional ainda.</div>}
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
