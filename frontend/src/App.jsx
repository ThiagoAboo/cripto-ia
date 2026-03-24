import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchConfig,
  fetchDecisions,
  fetchHealth,
  fetchOrders,
  fetchPortfolio,
  fetchSocialAlerts,
  fetchSocialScores,
  fetchSocialSummary,
  fetchStatus,
  getApiBaseUrl,
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
  portfolio: {
    baseCurrency: 'USDT',
    positions: [],
  },
  market: {},
  social: {
    topScores: [],
    recentAlerts: [],
  },
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

export default function App() {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [configRow, setConfigRow] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [auxData, setAuxData] = useState({ orders: [], decisions: [], socialScores: [], socialAlerts: [], portfolio: null, socialSummary: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef(null);

  const loadEverything = async () => {
    setError('');
    try {
      const [healthData, configData, statusData, portfolioData, ordersData, decisionsData, socialScoresData, socialAlertsData, socialSummaryData] = await Promise.all([
        fetchHealth(),
        fetchConfig(),
        fetchStatus(),
        fetchPortfolio(),
        fetchOrders(20),
        fetchDecisions(20),
        fetchSocialScores(12),
        fetchSocialAlerts(12),
        fetchSocialSummary(),
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
    const apiBase = getApiBaseUrl();
    const source = new EventSource(`${apiBase}/api/status/stream`);
    eventSourceRef.current = source;

    source.addEventListener('open', () => {
      setSseConnected(true);
    });

    source.addEventListener('status', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setStatus(payload);
      } catch (_error) {
        // ignore malformed event
      }
    });

    source.addEventListener('error', () => {
      setSseConnected(false);
    });

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus()
        .then((payload) => setStatus(payload))
        .catch(() => null);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!saveMessage) return undefined;
    const timer = setTimeout(() => setSaveMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  const currentPortfolio = status.portfolio?.accountKey ? status.portfolio : auxData.portfolio;
  const currentOrders = status.recentOrders?.length ? status.recentOrders : auxData.orders;
  const currentDecisions = status.recentDecisions?.length ? status.recentDecisions : auxData.decisions;
  const socialScores = status.social?.topScores?.length ? status.social.topScores : auxData.socialScores;
  const socialAlerts = status.social?.recentAlerts?.length ? status.social.recentAlerts : auxData.socialAlerts;
  const socialSummary = status.social?.assetsCount !== undefined ? status.social : auxData.socialSummary;

  const summaryCards = useMemo(() => {
    const portfolio = currentPortfolio || { baseCurrency: 'USDT' };
    const baseCurrency = portfolio.baseCurrency || 'USDT';

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
        label: 'Exposição',
        value: formatPercent(portfolio.exposurePct || 0),
        hint: `${portfolio.openPositionsCount || 0} posições abertas`,
      },
      {
        label: 'Mercado',
        value: `${formatNumber(status.market?.symbolsCount || 0, 0)} símbolos`,
        hint: `Ticks: ${formatNumber(status.market?.tickersCount || 0, 0)} | Candles: ${formatNumber(status.market?.candlesCount || 0, 0)}`,
      },
      {
        label: 'Social',
        value: `${formatNumber(socialSummary?.strongCount || 0, 0)} fortes`,
        hint: `${formatNumber(socialSummary?.highRiskCount || 0, 0)} alto risco`,
        tone: Number(socialSummary?.highRiskCount || 0) > 0 ? 'warning' : 'default',
      },
    ];
  }, [currentPortfolio, health, socialSummary, status.market]);

  const handleTextChange = (path, value) => {
    setDraftConfig((current) => updateAtPath(current, path, value));
  };

  const handleNumberChange = (path, value) => {
    setDraftConfig((current) => updateAtPath(current, path, parseNumberInput(value)));
  };

  const handleCheckboxChange = (path, checked) => {
    setDraftConfig((current) => updateAtPath(current, path, checked));
  };

  const handleSymbolsChange = (value) => {
    const parsed = value
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    setDraftConfig((current) => updateAtPath(current, 'trading.symbols', parsed));
  };

  const handleTimeframesChange = (value) => {
    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

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
    } catch (requestError) {
      setError(requestError.message || 'Falha ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="app-loading">Carregando painel...</div>;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cripto IA</p>
          <h1>Dashboard operacional</h1>
          <p className="hero__subtitle">
            Painel desacoplado do motor da AI. O frontend só consome REST + SSE, enquanto a execução continua no backend e nos workers.
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
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="layout-grid">
        <div className="layout-grid__main">
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
                  </select>
                </ConfigField>
                <ConfigField label="Moeda base">
                  <select value={draftConfig.trading.baseCurrency} onChange={(event) => handleTextChange('trading.baseCurrency', event.target.value)}>
                    <option value="USDT">USDT</option>
                    <option value="BRL">BRL</option>
                  </select>
                </ConfigField>
                <ConfigField label="Símbolos" hint="Separados por vírgula">
                  <textarea rows="3" value={formatList(draftConfig.trading.symbols)} onChange={(event) => handleSymbolsChange(event.target.value)} />
                </ConfigField>
                <ConfigField label="Timeframe principal">
                  <input value={draftConfig.trading.primaryTimeframe} onChange={(event) => handleTextChange('trading.primaryTimeframe', event.target.value)} />
                </ConfigField>
                <ConfigField label="Timeframes de confirmação" hint="Separados por vírgula">
                  <input value={formatList(draftConfig.trading.confirmationTimeframes)} onChange={(event) => handleTimeframesChange(event.target.value)} />
                </ConfigField>
                <ConfigField label="Lookback de candles">
                  <input type="number" value={draftConfig.trading.lookbackCandles} onChange={(event) => handleNumberChange('trading.lookbackCandles', event.target.value)} />
                </ConfigField>
                <ConfigField label="Máximo de posições abertas">
                  <input type="number" value={draftConfig.trading.maxOpenPositions} onChange={(event) => handleNumberChange('trading.maxOpenPositions', event.target.value)} />
                </ConfigField>
                <ConfigField label="Risco por trade (%)">
                  <input type="number" step="0.1" value={draftConfig.risk.maxRiskPerTradePct} onChange={(event) => handleNumberChange('risk.maxRiskPerTradePct', event.target.value)} />
                </ConfigField>
                <ConfigField label="Exposição máxima da carteira (%)">
                  <input type="number" step="0.1" value={draftConfig.risk.maxPortfolioExposurePct} onChange={(event) => handleNumberChange('risk.maxPortfolioExposurePct', event.target.value)} />
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
                <ConfigField label="Trailing stop habilitado">
                  <input type="checkbox" checked={Boolean(draftConfig.risk.enableTrailingStop)} onChange={(event) => handleCheckboxChange('risk.enableTrailingStop', event.target.checked)} />
                </ConfigField>
                <ConfigField label="Loop da AI (segundos)">
                  <input type="number" value={draftConfig.ai.loopIntervalSec} onChange={(event) => handleNumberChange('ai.loopIntervalSec', event.target.value)} />
                </ConfigField>
                <ConfigField label="Confiança mínima para BUY">
                  <input type="number" step="0.01" value={draftConfig.ai.minConfidenceToBuy} onChange={(event) => handleNumberChange('ai.minConfidenceToBuy', event.target.value)} />
                </ConfigField>
                <ConfigField label="Confiança mínima para SELL">
                  <input type="number" step="0.01" value={draftConfig.ai.minConfidenceToSell} onChange={(event) => handleNumberChange('ai.minConfidenceToSell', event.target.value)} />
                </ConfigField>
                <ConfigField label="Margem de decisão">
                  <input type="number" step="0.01" value={draftConfig.ai.decisionMargin} onChange={(event) => handleNumberChange('ai.decisionMargin', event.target.value)} />
                </ConfigField>
                <ConfigField label="Social habilitado">
                  <input type="checkbox" checked={Boolean(draftConfig.social.enabled)} onChange={(event) => handleCheckboxChange('social.enabled', event.target.checked)} />
                </ConfigField>
                <ConfigField label="Bloqueio apenas por risco extremo">
                  <input type="checkbox" checked={Boolean(draftConfig.social.blockOnlyOnExtremeRisk)} onChange={(event) => handleCheckboxChange('social.blockOnlyOnExtremeRisk', event.target.checked)} />
                </ConfigField>
                <ConfigField label="Threshold de risco social extremo">
                  <input type="number" value={draftConfig.social.extremeRiskThreshold} onChange={(event) => handleNumberChange('social.extremeRiskThreshold', event.target.value)} />
                </ConfigField>
              </div>
            ) : (
              <div>Sem configuração carregada.</div>
            )}
          </Section>

          <Section title="Portfólio paper" subtitle="Resumo operacional consolidado pelo backend">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Símbolo</th>
                    <th>Qtd.</th>
                    <th>Preço médio</th>
                    <th>Último preço</th>
                    <th>Valor</th>
                    <th>PnL não realizado</th>
                    <th>Stop / TP / Trail</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPortfolio?.positions?.length ? currentPortfolio.positions.map((position) => (
                    <tr key={position.symbol}>
                      <td>{position.symbol}</td>
                      <td>{formatNumber(position.quantity, 6)}</td>
                      <td>{formatMoney(position.avgEntryPrice, currentPortfolio.baseCurrency)}</td>
                      <td>{formatMoney(position.lastPrice, currentPortfolio.baseCurrency)}</td>
                      <td>{formatMoney(position.marketValue, currentPortfolio.baseCurrency)}</td>
                      <td className={Number(position.unrealizedPnl) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(position.unrealizedPnl, currentPortfolio.baseCurrency)}</td>
                      <td>
                        SL {formatMoney(position.stopLossPrice, currentPortfolio.baseCurrency)}<br />
                        TP {formatMoney(position.takeProfitPrice, currentPortfolio.baseCurrency)}<br />
                        TR {formatMoney(position.trailingStopPrice, currentPortfolio.baseCurrency)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7">Nenhuma posição aberta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Ordens recentes" subtitle="Execução paper disparada exclusivamente pela AI">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Símbolo</th>
                    <th>Lado</th>
                    <th>Status</th>
                    <th>Preço</th>
                    <th>Notional</th>
                    <th>Motivo</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {currentOrders?.length ? currentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.symbol}</td>
                      <td>{order.side}</td>
                      <td>{order.status}</td>
                      <td>{formatMoney(order.price, currentPortfolio?.baseCurrency || 'USDT')}</td>
                      <td>{formatMoney(order.executedNotional, currentPortfolio?.baseCurrency || 'USDT')}</td>
                      <td>{order.reason || '—'}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="8">Sem ordens registradas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <aside className="layout-grid__side">
          <Section title="Workers" subtitle="Saúde dos serviços desacoplados">
            <div className="list-stack">
              {status.workers?.length ? status.workers.map((worker) => (
                <div className="list-item" key={worker.worker_name}>
                  <div>
                    <strong>{worker.worker_name}</strong>
                    <div className="muted">{formatDateTime(worker.last_seen_at)}</div>
                  </div>
                  <StatusBadge connected={worker.status === 'running'} label={worker.status} />
                </div>
              )) : <div className="muted">Nenhum worker reportado ainda.</div>}
            </div>
          </Section>

          <Section title="Decisões recentes" subtitle="Saída do meta-decisor e dos bloqueios">
            <div className="list-stack compact-scroll">
              {currentDecisions?.length ? currentDecisions.map((decision) => (
                <div className="decision-card" key={decision.id}>
                  <div className="decision-card__row">
                    <strong>{decision.symbol}</strong>
                    <span className={`pill pill--${String(decision.action || 'hold').toLowerCase()}`}>{decision.action}</span>
                  </div>
                  <div className="muted">Confiança: {formatPercent(Number(decision.confidence || 0) * 100)}</div>
                  <div>{decision.reason || 'Sem razão textual registrada.'}</div>
                  <div className="muted">{formatDateTime(decision.created_at || decision.createdAt)}</div>
                </div>
              )) : <div className="muted">Sem decisões recentes.</div>}
            </div>
          </Section>

          <Section title="Social ranking" subtitle="Sugestões e radar de risco sem comandar entrada/saída">
            <div className="table-wrap compact-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Moeda</th>
                    <th>Classificação</th>
                    <th>Score</th>
                    <th>Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {socialScores?.length ? socialScores.map((item) => (
                    <tr key={item.symbol}>
                      <td>{item.symbol}</td>
                      <td>{item.classification}</td>
                      <td>{formatNumber(item.socialScore)}</td>
                      <td className={Number(item.socialRisk) >= 85 ? 'text-danger' : ''}>{formatNumber(item.socialRisk)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4">Sem scores sociais ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Alertas sociais" subtitle="Só interferem em caso de risco extremo">
            <div className="list-stack compact-scroll">
              {socialAlerts?.length ? socialAlerts.map((alert) => (
                <div className="alert-card" key={alert.id}>
                  <div className="decision-card__row">
                    <strong>{alert.symbol}</strong>
                    <span className={`pill pill--${String(alert.severity || 'info').toLowerCase()}`}>{alert.severity}</span>
                  </div>
                  <div>{alert.message}</div>
                  <div className="muted">{formatDateTime(alert.createdAt)}</div>
                </div>
              )) : <div className="muted">Sem alertas sociais.</div>}
            </div>
          </Section>

          <Section title="Últimos eventos" subtitle="Fluxo SSE e eventos operacionais">
            <div className="list-stack compact-scroll">
              {status.recentEvents?.length ? status.recentEvents.map((event) => (
                <div className="list-item list-item--column" key={event.id}>
                  <strong>{event.event_type || event.eventType}</strong>
                  <span className="muted">{event.source}</span>
                  <span className="muted">{formatDateTime(event.created_at || event.createdAt)}</span>
                </div>
              )) : <div className="muted">Sem eventos recentes.</div>}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
