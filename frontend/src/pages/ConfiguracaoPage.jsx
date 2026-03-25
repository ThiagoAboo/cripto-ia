import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
import { formatDateTime, formatList, formatNumber } from '../lib/format';
import { traduzirFonte, traduzirModoExecucao, traduzirObjetivo, traduzirSimNao } from '../lib/dashboard';

export default function ConfiguracaoPage({ ctx }) {
  const {
    draftConfig,
    saving,
    handleSaveConfig,
    handleTextChange,
    handleNumberChange,
    handleCheckboxChange,
    handleSymbolsChange,
    handleTimeframesChange,
    configHistory,
    configAudit,
  } = ctx;

  if (!draftConfig) {
    return <div className="app-loading">Carregando configuração...</div>;
  }

  return (
    <div className="page-stack">
      <Section
        title="Configuração operacional"
        subtitle="Agora separada por blocos para facilitar entendimento e manutenção do dashboard."
        actions={<button className="button" disabled={saving} onClick={handleSaveConfig}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>}
      >
        <div className="grid three-columns">
          <div className="page-stack">
            <h3 className="section-subtitle">Trading</h3>
            <div className="form-grid">
              <ConfigField label="Trading habilitado"><input type="checkbox" checked={Boolean(draftConfig.trading.enabled)} onChange={(e) => handleCheckboxChange('trading.enabled', e.target.checked)} /></ConfigField>
              <ConfigField label="Modo"><select value={draftConfig.trading.mode} onChange={(e) => handleTextChange('trading.mode', e.target.value)}><option value="paper">Simulado</option><option value="live">Real</option></select></ConfigField>
              <ConfigField label="Moeda base"><input value={draftConfig.trading.baseCurrency} onChange={(e) => handleTextChange('trading.baseCurrency', e.target.value.toUpperCase())} /></ConfigField>
              <ConfigField label="Timeframe principal"><input value={draftConfig.trading.primaryTimeframe} onChange={(e) => handleTextChange('trading.primaryTimeframe', e.target.value)} /></ConfigField>
              <ConfigField label="Lookback candles"><input type="number" value={draftConfig.trading.lookbackCandles} onChange={(e) => handleNumberChange('trading.lookbackCandles', e.target.value)} /></ConfigField>
              <ConfigField label="Máx. posições abertas"><input type="number" value={draftConfig.trading.maxOpenPositions} onChange={(e) => handleNumberChange('trading.maxOpenPositions', e.target.value)} /></ConfigField>
            </div>
            <ConfigField label="Símbolos" hint="Separe por vírgula."><textarea rows="3" value={formatList(draftConfig.trading.symbols)} onChange={(e) => handleSymbolsChange(e.target.value)} /></ConfigField>
            <ConfigField label="Timeframes de confirmação" hint="Separe por vírgula."><input value={formatList(draftConfig.trading.confirmationTimeframes)} onChange={(e) => handleTimeframesChange(e.target.value)} /></ConfigField>
          </div>

          <div className="page-stack">
            <h3 className="section-subtitle">Risco e execução</h3>
            <div className="form-grid">
              <ConfigField label="Risco por trade (%)"><input type="number" step="0.1" value={draftConfig.risk.maxRiskPerTradePct} onChange={(e) => handleNumberChange('risk.maxRiskPerTradePct', e.target.value)} /></ConfigField>
              <ConfigField label="Exposição máxima da carteira (%)"><input type="number" step="0.1" value={draftConfig.risk.maxPortfolioExposurePct} onChange={(e) => handleNumberChange('risk.maxPortfolioExposurePct', e.target.value)} /></ConfigField>
              <ConfigField label="Stop ATR"><input type="number" step="0.1" value={draftConfig.risk.stopLossAtr} onChange={(e) => handleNumberChange('risk.stopLossAtr', e.target.value)} /></ConfigField>
              <ConfigField label="Take profit ATR"><input type="number" step="0.1" value={draftConfig.risk.takeProfitAtr} onChange={(e) => handleNumberChange('risk.takeProfitAtr', e.target.value)} /></ConfigField>
              <ConfigField label="Trailing stop ATR"><input type="number" step="0.1" value={draftConfig.risk.trailingStopAtr} onChange={(e) => handleNumberChange('risk.trailingStopAtr', e.target.value)} /></ConfigField>
              <ConfigField label="Cooldown após loss (min)"><input type="number" value={draftConfig.risk.cooldownMinutesAfterLoss} onChange={(e) => handleNumberChange('risk.cooldownMinutesAfterLoss', e.target.value)} /></ConfigField>
              <ConfigField label="Capital inicial simulado"><input type="number" value={draftConfig.execution.paper.initialCapital} onChange={(e) => handleNumberChange('execution.paper.initialCapital', e.target.value)} /></ConfigField>
              <ConfigField label="Tamanho da ordem (%)"><input type="number" step="0.1" value={draftConfig.execution.paper.orderSizePct} onChange={(e) => handleNumberChange('execution.paper.orderSizePct', e.target.value)} /></ConfigField>
              <ConfigField label="Ordem mínima"><input type="number" step="0.01" value={draftConfig.execution.paper.minOrderNotional} onChange={(e) => handleNumberChange('execution.paper.minOrderNotional', e.target.value)} /></ConfigField>
              <ConfigField label="Taxa (%)"><input type="number" step="0.01" value={draftConfig.execution.paper.feePct} onChange={(e) => handleNumberChange('execution.paper.feePct', e.target.value)} /></ConfigField>
              <ConfigField label="Slippage (%)"><input type="number" step="0.01" value={draftConfig.execution.paper.slippagePct} onChange={(e) => handleNumberChange('execution.paper.slippagePct', e.target.value)} /></ConfigField>
              <ConfigField label="Modo live habilitado"><input type="checkbox" checked={Boolean(draftConfig.execution.live.enabled)} onChange={(e) => handleCheckboxChange('execution.live.enabled', e.target.checked)} /></ConfigField>
            </div>
          </div>

          <div className="page-stack">
            <h3 className="section-subtitle">IA, social e treinamento</h3>
            <div className="form-grid">
              <ConfigField label="Loop da IA (s)"><input type="number" value={draftConfig.ai.loopIntervalSec} onChange={(e) => handleNumberChange('ai.loopIntervalSec', e.target.value)} /></ConfigField>
              <ConfigField label="Confiança mínima para compra"><input type="number" step="0.01" value={draftConfig.ai.minConfidenceToBuy} onChange={(e) => handleNumberChange('ai.minConfidenceToBuy', e.target.value)} /></ConfigField>
              <ConfigField label="Confiança mínima para venda"><input type="number" step="0.01" value={draftConfig.ai.minConfidenceToSell} onChange={(e) => handleNumberChange('ai.minConfidenceToSell', e.target.value)} /></ConfigField>
              <ConfigField label="Margem de decisão"><input type="number" step="0.01" value={draftConfig.ai.decisionMargin} onChange={(e) => handleNumberChange('ai.decisionMargin', e.target.value)} /></ConfigField>
              <ConfigField label="Score forte social"><input type="number" value={draftConfig.social.strongScoreThreshold} onChange={(e) => handleNumberChange('social.strongScoreThreshold', e.target.value)} /></ConfigField>
              <ConfigField label="Score promissora"><input type="number" value={draftConfig.social.promisingScoreThreshold} onChange={(e) => handleNumberChange('social.promisingScoreThreshold', e.target.value)} /></ConfigField>
              <ConfigField label="Janela padrão de treinamento (dias)"><input type="number" value={draftConfig.training.evaluationWindowDays} onChange={(e) => handleNumberChange('training.evaluationWindowDays', e.target.value)} /></ConfigField>
              <ConfigField label="Mínimo de qualidade para aplicar"><input type="number" step="0.01" value={draftConfig.training.minQualityScoreForApply} onChange={(e) => handleNumberChange('training.minQualityScoreForApply', e.target.value)} /></ConfigField>
              <ConfigField label="Objetivo padrão do otimizador"><select value={draftConfig.optimizer.defaultObjective} onChange={(e) => handleTextChange('optimizer.defaultObjective', e.target.value)}>{(draftConfig.optimizer.objectives || []).map((value) => <option key={value} value={value}>{traduzirObjetivo(value)}</option>)}</select></ConfigField>
            </div>
            <div className="list-item list-item--column">
              <strong>Resumo atual</strong>
              <div className="muted">Modo {traduzirModoExecucao(draftConfig.trading.mode)} • social {traduzirSimNao(draftConfig.social.enabled)} • treinamento {traduzirSimNao(draftConfig.training.enabled)}</div>
              <div className="button-row">
                <Pill tone={draftConfig.trading.enabled ? 'buy' : 'warning'}>{draftConfig.trading.enabled ? 'trading ativo' : 'trading desligado'}</Pill>
                <Pill tone={draftConfig.execution.live.enabled ? 'warning' : 'info'}>{draftConfig.execution.live.enabled ? 'live habilitado' : 'live desligado'}</Pill>
                <Pill tone={draftConfig.training.allowSuggestedWeightsApply ? 'warning' : 'info'}>{draftConfig.training.allowSuggestedWeightsApply ? 'treinamento pode aplicar pesos' : 'treinamento só analisa'}</Pill>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <div className="grid two-columns">
        <Section title="Histórico de configuração" subtitle="Versões anteriores para auditoria e rollback assistido.">
          <div className="list-stack compact-scroll">
            {configHistory?.length ? configHistory.map((item) => (
              <div key={item.id || item.version} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>Versão {item.version}</strong>
                  <Pill tone="info">{traduzirFonte(item.source)}</Pill>
                </div>
                <div className="muted">{formatDateTime(item.createdAt)} • símbolos {formatList(item.config?.trading?.symbols || [])}</div>
              </div>
            )) : <div className="muted">Nenhuma versão registrada.</div>}
          </div>
        </Section>

        <Section title="Auditoria de configuração" subtitle="Registro das alterações mais recentes.">
          <div className="list-stack compact-scroll">
            {configAudit?.length ? configAudit.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>{item.action || 'alteração'}</strong>
                  <Pill tone="info">v{formatNumber(item.version || 0, 0)}</Pill>
                </div>
                <div className="muted">{formatDateTime(item.createdAt)} • {item.actor || 'sistema'} • {item.note || 'sem observação'}</div>
              </div>
            )) : <div className="muted">Sem trilha de auditoria carregada.</div>}
          </div>
        </Section>
      </div>
    </div>
  );
}
