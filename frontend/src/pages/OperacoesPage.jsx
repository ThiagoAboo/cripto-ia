import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '../lib/format';
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
  } = ctx;

  return (
    <div className="page-stack">
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
              <div className="muted">Baseline retorno: {formatPercent(comparisonResult?.baseline?.metrics?.returnPct || 0)} • Challenger retorno: {formatPercent(comparisonResult?.challenger?.metrics?.returnPct || 0)}</div>
              <div className="muted">Diferença de performance: {formatNumber(comparisonResult?.comparison?.outperformancePct || 0, 2)}%</div>
            </div>
          ) : null}
        </Section>

        <Section title="Calibração automática" subtitle="Ranking de candidatos por símbolo e regime.">
          <div className="list-item list-item--column">
            <div className="muted">Objetivo atual: {traduzirObjetivo(draftConfig?.optimizer?.defaultObjective)}</div>
            <div className="muted">Máx. candidatos: {formatNumber(draftConfig?.optimizer?.maxCandidatesPerRun || 0, 0)}</div>
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
        <Section title="Portfólio simulado" subtitle={`Base ${baseCurrency} • ${currentPortfolio?.openPositionsCount || 0} posições abertas`}>
          <div className="table-wrap compact-scroll">
            <table>
              <thead>
                <tr><th>Símbolo</th><th>Qtd</th><th>Entrada</th><th>Preço atual</th><th>PnL</th><th>Saídas</th></tr>
              </thead>
              <tbody>
                {currentPortfolio?.positions?.length ? currentPortfolio.positions.map((position) => (
                  <tr key={position.symbol}>
                    <td>{position.symbol}</td>
                    <td>{formatNumber(position.quantity, 6)}</td>
                    <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                    <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                    <td className={Number(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>{formatMoney(position.unrealizedPnl || 0, baseCurrency)}</td>
                    <td className="muted">SL {formatMoney(position.stopLossPrice, baseCurrency)}<br/>TP {formatMoney(position.takeProfitPrice, baseCurrency)}<br/>TR {formatMoney(position.trailingStopPrice, baseCurrency)}</td>
                  </tr>
                )) : <tr><td colSpan="6" className="muted">Nenhuma posição aberta.</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Ordens e sinais" subtitle="Decisões da IA, ordens recentes e bloqueios temporários.">
          <div className="list-stack compact-scroll">
            <strong>Cooldowns ativos</strong>
            {controlState?.activeCooldowns?.length ? controlState.activeCooldowns.map((item) => (
              <div key={`${item.symbol}-${item.expiresAt}`} className="list-item">
                <span>{item.symbol}</span>
                <span className="muted">até {formatDateTime(item.expiresAt)}</span>
              </div>
            )) : <div className="muted">Sem cooldowns ativos.</div>}

            <strong className="top-gap">Ordens recentes</strong>
            {currentOrders?.length ? currentOrders.slice(0, 8).map((order) => (
              <div key={order.id} className="decision-card">
                <div className="decision-card__row">
                  <strong>{order.symbol}</strong>
                  <Pill tone={order.side === 'BUY' ? 'buy' : 'sell'}>{traduzirAcaoDecisao(order.side)}</Pill>
                </div>
                <div className="muted">{formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}</div>
                <div className="muted">Preço {formatMoney(order.price, baseCurrency)} • PnL {formatMoney(order.realizedPnl || 0, baseCurrency)}</div>
              </div>
            )) : <div className="muted">Nenhuma ordem recente.</div>}

            <strong className="top-gap">Decisões da IA</strong>
            {currentDecisions?.length ? currentDecisions.slice(0, 8).map((decision) => (
              <div key={decision.id} className="decision-card">
                <div className="decision-card__row">
                  <strong>{decision.symbol}</strong>
                  <Pill tone={decision.action === 'BUY' ? 'buy' : decision.action === 'SELL' ? 'sell' : decision.action === 'BLOCK' ? 'high' : 'info'}>{traduzirAcaoDecisao(decision.action)}</Pill>
                </div>
                <div className="muted">{formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}</div>
                <div className="muted">{decision.reason || decision.summary || 'Sem resumo.'}</div>
              </div>
            )) : <div className="muted">Sem decisões recentes.</div>}
          </div>
        </Section>
      </div>

      <div className="grid two-columns">
        <Section title="Backtests recentes" subtitle="Execuções mais recentes armazenadas no backend.">
          <div className="list-stack compact-scroll">
            {recentBacktests?.length ? recentBacktests.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {item.symbol}</strong><Pill tone="info">{item.interval}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • retorno {formatPercent(item.metrics?.returnPct || 0)}</div>
                <div className="muted">Regime {traduzirRegime(item.regimeLabel)} • win rate {formatPercent(item.metrics?.winRate || 0)}</div>
              </div>
            )) : <div className="muted">Nenhum backtest carregado.</div>}
          </div>
        </Section>

        <Section title="Calibrações recentes" subtitle="Resultados do otimizador por run.">
          <div className="list-stack compact-scroll">
            {recentOptimizations?.length ? recentOptimizations.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {item.label}</strong><Pill tone="warning">{traduzirObjetivo(item.objective)}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • símbolos {item.symbols?.join(', ')}</div>
                <div className="muted">Melhor score {formatNumber(item.bestScore || 0, 3)}</div>
              </div>
            )) : <div className="muted">Nenhuma calibração encontrada.</div>}
          </div>
        </Section>
      </div>
    </div>
  );
}
