import { useEffect, useMemo } from 'react';
import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '../lib/format';
import { mapActionTone, mapStatusTone, signedClassName } from '../lib/ui';
import { traduzirAcaoDecisao, traduzirObjetivo, traduzirRegime, traduzirStatusGenerico } from '../lib/dashboard';

export default function OperacoesPage({ ctx }) {
  const {
    baseCurrency,
    backtestForm,
    setBacktestForm,
    backtestLoading,
    handleRunBacktest,
    handleCompareBacktest,
    comparisonResult,
    optimizationLoading,
    handleRunOptimization,
    optimizationResult,
    recentBacktests,
    recentOptimizations,
    currentPortfolio,
    currentOrders,
    controlState,
    currentDecisions,
    draftConfig,
    pageFilters,
    clearPageFilter,
  } = ctx;

  const symbolFilter = String(pageFilters?.operacoes?.symbol || '').toUpperCase();

  useEffect(() => {
    if (!symbolFilter || backtestForm.symbol === symbolFilter) return;
    setBacktestForm((current) => ({ ...current, symbol: symbolFilter }));
  }, [backtestForm.symbol, setBacktestForm, symbolFilter]);

  const filteredPositions = useMemo(
    () => (symbolFilter ? (currentPortfolio?.positions || []).filter((item) => item.symbol === symbolFilter) : currentPortfolio?.positions || []),
    [currentPortfolio?.positions, symbolFilter],
  );

  const filteredCooldowns = useMemo(
    () => (symbolFilter ? (controlState?.activeCooldowns || []).filter((item) => item.symbol === symbolFilter) : controlState?.activeCooldowns || []),
    [controlState?.activeCooldowns, symbolFilter],
  );

  const filteredOrders = useMemo(
    () => (symbolFilter ? (currentOrders || []).filter((item) => item.symbol === symbolFilter) : currentOrders || []),
    [currentOrders, symbolFilter],
  );

  const filteredDecisions = useMemo(
    () => (symbolFilter ? (currentDecisions || []).filter((item) => item.symbol === symbolFilter) : currentDecisions || []),
    [currentDecisions, symbolFilter],
  );

  const filteredBacktests = useMemo(
    () => (symbolFilter ? (recentBacktests || []).filter((item) => item.symbol === symbolFilter) : recentBacktests || []),
    [recentBacktests, symbolFilter],
  );

  const filteredOptimizations = useMemo(
    () => (symbolFilter
      ? (recentOptimizations || []).filter((item) => {
          if (item.symbol === symbolFilter) return true;
          if (Array.isArray(item.symbols)) {
            return item.symbols.includes(symbolFilter);
          }
          return false;
        })
      : recentOptimizations || []),
    [recentOptimizations, symbolFilter],
  );

  return (
    <div className="page-stack">
      {symbolFilter ? (
        <Section title="Filtro de mercado ativo" subtitle={`Exibindo dados de operações para ${symbolFilter}.`}>
          <div className="button-row">
            <Pill tone="info">{symbolFilter}</Pill>
            <button type="button" className="button button--ghost button--small" onClick={() => clearPageFilter('operacoes')}>
              Limpar filtro
            </button>
          </div>
        </Section>
      ) : null}

      <div className="grid two-columns">
        <Section title="Backtests" subtitle="Execução manual para o símbolo e intervalo selecionados.">
          <div className="form-grid">
            <ConfigField label="Símbolo"><input value={backtestForm.symbol} onChange={(e) => setBacktestForm((c) => ({ ...c, symbol: e.target.value.toUpperCase() }))} /></ConfigField>
            <ConfigField label="Intervalo"><input value={backtestForm.interval} onChange={(e) => setBacktestForm((c) => ({ ...c, interval: e.target.value }))} /></ConfigField>
            <ConfigField label="Intervalo de confirmação"><input value={backtestForm.confirmationInterval} onChange={(e) => setBacktestForm((c) => ({ ...c, confirmationInterval: e.target.value }))} /></ConfigField>
            <ConfigField label="Limite de candles"><input type="number" value={backtestForm.limit} onChange={(e) => setBacktestForm((c) => ({ ...c, limit: Number(e.target.value || 0) }))} /></ConfigField>
          </div>
          <div className="button-row">
            <button className="button" disabled={backtestLoading === 'run'} onClick={handleRunBacktest}>{backtestLoading === 'run' ? 'Executando...' : 'Rodar backtest'}</button>
            <button className="button button--ghost" disabled={backtestLoading === 'compare'} onClick={handleCompareBacktest}>{backtestLoading === 'compare' ? 'Comparando...' : 'Comparar configuração'}</button>
          </div>
          {comparisonResult ? (
            <div className="list-item list-item--column top-gap">
              <strong>Resultado da comparação</strong>
              <div className="muted">Baseline retorno: <span className={signedClassName(comparisonResult?.baseline?.metrics?.returnPct || 0)}>{formatPercent(comparisonResult?.baseline?.metrics?.returnPct || 0)}</span> • Challenger retorno: <span className={signedClassName(comparisonResult?.challenger?.metrics?.returnPct || 0)}>{formatPercent(comparisonResult?.challenger?.metrics?.returnPct || 0)}</span></div>
              <div className="muted">Diferença de performance: <span className={signedClassName(comparisonResult?.comparison?.outperformancePct || 0)}>{formatNumber(comparisonResult?.comparison?.outperformancePct || 0, 2)}%</span></div>
            </div>
          ) : null}
        </Section>

        <Section title="Calibração automática" subtitle="Ranking de candidatos por símbolo e regime.">
          <div className="list-item list-item--column">
            <div className="muted">Objetivo atual: {traduzirObjetivo(draftConfig?.optimizer?.defaultObjective)}</div>
            <div className="muted">Máx. candidatos: {formatNumber(draftConfig?.optimizer?.maxCandidatesPerRun || 0, 0)}</div>
            {symbolFilter ? <div className="muted">Filtro aplicado: {symbolFilter}</div> : null}
          </div>
          <div className="button-row">
            <button className="button" disabled={optimizationLoading === 'running'} onClick={handleRunOptimization}>{optimizationLoading === 'running' ? 'Calibrando...' : 'Rodar calibração'}</button>
          </div>
          {optimizationResult ? (
            <div className="list-item list-item--column top-gap">
              <strong>Último resultado</strong>
              <div className="muted">Execução #{optimizationResult.id} • objetivo {traduzirObjetivo(optimizationResult.objective)}</div>
            </div>
          ) : null}
        </Section>
      </div>

      <div className="grid two-columns">
        <Section title="Portfólio simulado" subtitle={symbolFilter ? `${symbolFilter} no portfólio` : `Base ${baseCurrency} • ${currentPortfolio?.openPositionsCount || 0} posições abertas`}>
          <div className="table-wrap compact-scroll">
            <table>
              <thead>
                <tr><th>Símbolo</th><th>Qtd</th><th>Entrada</th><th>Preço atual</th><th>PnL</th><th>Saídas</th></tr>
              </thead>
              <tbody>
                {filteredPositions.length ? filteredPositions.map((position) => (
                  <tr key={position.symbol}>
                    <td>{position.symbol}</td>
                    <td>{formatNumber(position.quantity, 6)}</td>
                    <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                    <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                    <td className={Number(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(position.unrealizedPnl || 0, baseCurrency)}</td>
                    <td className="muted">SL {formatMoney(position.stopLossPrice, baseCurrency)}<br/>TP {formatMoney(position.takeProfitPrice, baseCurrency)}<br/>TR {formatMoney(position.trailingStopPrice, baseCurrency)}</td>
                  </tr>
                )) : <tr><td colSpan="6" className="muted">{symbolFilter ? `Nenhuma posição aberta para ${symbolFilter}.` : 'Nenhuma posição aberta.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Ordens e sinais" subtitle={symbolFilter ? `Ordens, decisões e cooldowns filtrados para ${symbolFilter}.` : 'Decisões da IA, ordens recentes e bloqueios temporários.'}>
          <div className="list-stack compact-scroll">
            <strong>Cooldowns ativos</strong>
            {filteredCooldowns.length ? filteredCooldowns.map((item) => (
              <div key={`${item.symbol}-${item.expiresAt}`} className="alert-card">
                <div className="decision-card__row"><strong>{item.symbol}</strong><Pill tone={mapStatusTone('bloqueado')}>bloqueado</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt || item.startedAt || item.updatedAt || item.expiresAt)}</div>
                <div className="muted">Cooldown ativo até {formatDateTime(item.expiresAt)}</div>
              </div>
            )) : <div className="muted">{symbolFilter ? `Sem cooldowns ativos para ${symbolFilter}.` : 'Sem cooldowns ativos.'}</div>}

            <strong className="top-gap">Ordens recentes</strong>
            {filteredOrders.length ? filteredOrders.slice(0, 8).map((order) => (
              <div key={order.id} className="decision-card">
                <div className="decision-card__row">
                  <strong>{order.symbol}</strong>
                  <div className="button-row">
                    <Pill tone={mapActionTone(order.side)}>{traduzirAcaoDecisao(order.side)}</Pill>
                    <Pill tone={mapStatusTone(traduzirStatusGenerico(order.status))}>{traduzirStatusGenerico(order.status)}</Pill>
                  </div>
                </div>
                <div className="muted">{formatDateTime(order.createdAt)}</div>
                <div className="muted">Preço {formatMoney(order.price, baseCurrency)} • PnL <span className={signedClassName(order.realizedPnl || 0)}>{formatMoney(order.realizedPnl || 0, baseCurrency)}</span></div>
              </div>
            )) : <div className="muted">{symbolFilter ? `Nenhuma ordem recente para ${symbolFilter}.` : 'Nenhuma ordem recente.'}</div>}

            <strong className="top-gap">Decisões da IA</strong>
            {filteredDecisions.length ? filteredDecisions.slice(0, 8).map((decision) => (
              <div key={decision.id} className="decision-card">
                <div className="decision-card__row">
                  <strong>{decision.symbol}</strong>
                  <Pill tone={mapActionTone(decision.action)}>{traduzirAcaoDecisao(decision.action)}</Pill>
                </div>
                <div className="muted">{formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}</div>
                <div className="muted">{decision.reason || decision.summary || 'Sem resumo.'}</div>
              </div>
            )) : <div className="muted">{symbolFilter ? `Sem decisões recentes para ${symbolFilter}.` : 'Sem decisões recentes.'}</div>}
          </div>
        </Section>
      </div>

      <div className="grid two-columns">
        <Section title="Backtests recentes" subtitle={symbolFilter ? `Execuções recentes filtradas para ${symbolFilter}.` : 'Execuções mais recentes armazenadas no backend.'}>
          <div className="list-stack compact-scroll">
            {filteredBacktests.length ? filteredBacktests.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {item.symbol}</strong><Pill tone="info">{item.interval}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • retorno <span className={signedClassName(item.metrics?.returnPct || 0)}>{formatPercent(item.metrics?.returnPct || 0)}</span></div>
                <div className="muted">Regime {traduzirRegime(item.regimeLabel)} • win rate {formatPercent(item.metrics?.winRate || 0)}</div>
              </div>
            )) : <div className="muted">{symbolFilter ? `Nenhum backtest recente para ${symbolFilter}.` : 'Nenhum backtest carregado.'}</div>}
          </div>
        </Section>

        <Section title="Calibrações recentes" subtitle={symbolFilter ? `Resultados do otimizador relacionados a ${symbolFilter}.` : 'Resultados do otimizador por run.'}>
          <div className="list-stack compact-scroll">
            {filteredOptimizations.length ? filteredOptimizations.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {item.label}</strong><Pill tone="warning">{traduzirObjetivo(item.objective)}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • símbolos {item.symbols?.join(', ')}</div>
                <div className="muted">Melhor score {formatNumber(item.bestScore || 0, 3)}</div>
              </div>
            )) : <div className="muted">{symbolFilter ? `Nenhuma calibração recente relacionada a ${symbolFilter}.` : 'Nenhuma calibração encontrada.'}</div>}
          </div>
        </Section>
      </div>
    </div>
  );
}
