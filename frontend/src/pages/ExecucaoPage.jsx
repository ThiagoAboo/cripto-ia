import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { mapStatusTone, signedClassName } from '../lib/ui';
import { traduzirCanalPromocao, traduzirModoExecucao, traduzirSimNao, traduzirStatusGenerico, traduzirTipoAcaoExecucao } from '../lib/dashboard';

export default function ExecucaoPage({ ctx }) {
  const {
    execution,
    controlState,
    baseCurrency,
    actionLoading,
    opsActionLoading,
    executionActionLoading,
    executionForm,
    setExecutionForm,
    executionPreview,
    handleControlAction,
    pauseControl,
    resumeControl,
    triggerEmergencyStop,
    handleMaintenanceAction,
    handleExecutionAction,
    runExecutionHealthcheck,
    runExecutionReconciliation,
    handlePreviewLiveOrder,
    handleSubmitLiveOrder,
    draftConfig,
  } = ctx;

  return (
    <div className="page-stack">
      <div className="grid two-columns">
        <Section title="Controle operacional" subtitle="Esses controles continuam válidos para backend e IA, mesmo sem o frontend aberto.">
          <div className="button-row">
            <button className="button" disabled={actionLoading === 'pause'} onClick={() => handleControlAction('pause', () => pauseControl('manual_pause_from_dashboard'))}>{actionLoading === 'pause' ? 'Pausando...' : 'Pausar'}</button>
            <button className="button" disabled={actionLoading === 'resume'} onClick={() => handleControlAction('resume', () => resumeControl(true))}>{actionLoading === 'resume' ? 'Retomando...' : 'Retomar'}</button>
            <button className="button button--danger" disabled={actionLoading === 'emergency'} onClick={() => handleControlAction('emergency', () => triggerEmergencyStop('manual_emergency_stop_from_dashboard'))}>{actionLoading === 'emergency' ? 'Acionando...' : 'Parada de emergência'}</button>
            <button className="button button--ghost" disabled={opsActionLoading === 'maintenance-on'} onClick={() => handleMaintenanceAction(true)}>{opsActionLoading === 'maintenance-on' ? 'Ativando...' : 'Ativar manutenção'}</button>
            <button className="button button--ghost" disabled={opsActionLoading === 'maintenance-off'} onClick={() => handleMaintenanceAction(false)}>{opsActionLoading === 'maintenance-off' ? 'Desativando...' : 'Desativar manutenção'}</button>
          </div>
          <div className="list-stack top-gap">
            <div className="list-item list-item--column">
              <strong>Estado atual</strong>
              <div className="button-row">
                <Pill tone={mapStatusTone(controlState?.emergencyStop ? 'emergência' : controlState?.maintenanceMode ? 'manutenção' : controlState?.isPaused ? 'pausado' : 'ativo')}>
                  {controlState?.emergencyStop ? 'emergência' : controlState?.maintenanceMode ? 'manutenção' : controlState?.isPaused ? 'pausado' : 'ativo'}
                </Pill>
                {controlState?.pauseReason ? <span className="muted">Motivo: {controlState.pauseReason}</span> : null}
              </div>
            </div>
            <div className="list-item list-item--column">
              <strong>Guardrails</strong>
              <div className="muted">PnL diário: <span className={signedClassName(controlState?.guardrails?.dailyRealizedPnl || 0)}>{formatMoney(controlState?.guardrails?.dailyRealizedPnl || 0, baseCurrency)}</span> • loss streak: {formatNumber(controlState?.guardrails?.consecutiveLosses || 0, 0)}</div>
            </div>
          </div>
        </Section>

        <Section
          title="Execução supervisionada"
          subtitle="Prévia, confirmação explícita e reconciliação para testnet/modo real.">
          <div className="list-item list-item--column">
            <strong>Status do adaptador</strong>
            <div className="muted">Modo: {traduzirModoExecucao(execution.mode)} • provedor: {execution.provider} • testnet: {traduzirSimNao(execution.useTestnet)} • simulação: {traduzirSimNao(execution.dryRun)}</div>
            <div className="button-row">
              <Pill tone={mapStatusTone(execution.liveReady ? 'pronto para real' : execution.mode === 'live' ? 'real incompleto' : 'simulado ativo')}>{execution.liveReady ? 'pronto para real' : execution.mode === 'live' ? 'real incompleto' : 'simulado ativo'}</Pill>
              {execution.supervised ? <Pill tone="warning">supervisionado</Pill> : null}
              {execution.requireExplicitConfirmation ? <Pill tone="high">confirmação explícita</Pill> : null}
            </div>
          </div>
          <div className="button-row top-gap">
            <button className="button" disabled={executionActionLoading === 'healthcheck'} onClick={() => handleExecutionAction('healthcheck', () => runExecutionHealthcheck({ requestedBy: 'dashboard' }), 'Verificação de saúde da execução concluída.')}>{executionActionLoading === 'healthcheck' ? 'Checando...' : 'Rodar verificação de saúde'}</button>
            <button className="button" disabled={executionActionLoading === 'reconcile'} onClick={() => handleExecutionAction('reconcile', () => runExecutionReconciliation({ requestedBy: 'dashboard', symbols: draftConfig?.trading?.symbols || [] }), 'Reconciliação concluída.')}>{executionActionLoading === 'reconcile' ? 'Conciliando...' : 'Rodar reconciliação'}</button>
          </div>
          <div className="list-stack top-gap compact-scroll">
            <div className="list-item list-item--column">
              <strong>Última verificação de saúde</strong>
              <div className="muted">{execution.latestHealthCheck?.createdAt ? formatDateTime(execution.latestHealthCheck.createdAt) : 'Ainda não executado'}</div>
            </div>
            <div className="list-item list-item--column">
              <strong>Última reconciliação</strong>
              <div className="muted">{execution.recentReconciliations?.[0]?.createdAt ? formatDateTime(execution.recentReconciliations[0].createdAt) : 'Ainda não executado'}</div>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Prévia e envio supervisionado" subtitle="Fluxo separado do restante do dashboard para ficar mais claro e seguro.">
        <div className="grid three-columns">
          <ConfigField label="Símbolo"><input value={executionForm.symbol} onChange={(e) => setExecutionForm((c) => ({ ...c, symbol: e.target.value.toUpperCase() }))} /></ConfigField>
          <ConfigField label="Direção"><select value={executionForm.side} onChange={(e) => setExecutionForm((c) => ({ ...c, side: e.target.value }))}><option value="BUY">COMPRA</option><option value="SELL">VENDA</option></select></ConfigField>
          <ConfigField label="Notional solicitado"><input type="number" value={executionForm.requestedNotional} onChange={(e) => setExecutionForm((c) => ({ ...c, requestedNotional: Number(e.target.value || 0) }))} disabled={executionForm.side !== 'BUY'} /></ConfigField>
          <ConfigField label="Quantidade solicitada"><input type="number" value={executionForm.requestedQuantity} onChange={(e) => setExecutionForm((c) => ({ ...c, requestedQuantity: Number(e.target.value || 0) }))} disabled={executionForm.side !== 'SELL'} /></ConfigField>
          <ConfigField label="Frase de confirmação"><input value={executionForm.confirmationPhrase} onChange={(e) => setExecutionForm((c) => ({ ...c, confirmationPhrase: e.target.value }))} /></ConfigField>
        </div>
        <div className="button-row top-gap">
          <button className="button" disabled={executionActionLoading === 'preview'} onClick={handlePreviewLiveOrder}>{executionActionLoading === 'preview' ? 'Gerando...' : 'Gerar prévia'}</button>
          <button className="button button--danger" disabled={executionActionLoading === 'submit-live'} onClick={handleSubmitLiveOrder}>{executionActionLoading === 'submit-live' ? 'Enviando...' : 'Enviar supervisionado'}</button>
        </div>

        {executionPreview ? (
          <div className="grid two-columns top-gap">
            <div className="list-item list-item--column">
              <strong>Prévia atual</strong>
              <div className="muted">Ticket: {executionPreview?.previewTicket?.id || '—'}</div>
              <div className="muted">Preço: {formatMoney(executionPreview?.normalized?.price || 0, baseCurrency)} • quantidade: {formatNumber(executionPreview?.normalized?.quantity || 0, 6)}</div>
              <div className="muted">Notional: {formatMoney(executionPreview?.normalized?.notional || 0, baseCurrency)}</div>
            </div>
            <div className="list-item list-item--column">
              <strong>Warnings</strong>
              {executionPreview?.warnings?.length ? executionPreview.warnings.map((item, index) => <div key={`${item}-${index}`} className="muted">• {item}</div>) : <div className="muted">Sem warnings.</div>}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Logs operacionais da execução" subtitle="Últimas ações supervisionadas registradas pelo backend.">
        <div className="list-stack compact-scroll">
          {execution.recentActionLogs?.length ? execution.recentActionLogs.map((item) => (
            <div key={item.id} className="list-item list-item--column">
              <div className="decision-card__row"><strong>{traduzirTipoAcaoExecucao(item.actionType)}</strong><Pill tone={item.status === 'ok' ? 'buy' : item.status === 'warning' ? 'warning' : 'high'}>{traduzirStatusGenerico(item.status)}</Pill></div>
              <div className="muted">{formatDateTime(item.createdAt)} • {item.symbol || 'sem símbolo'} • {item.actor || 'sistema'}</div>
              <div className="muted">{item.message || item.summary || 'Sem detalhes adicionais.'}</div>
            </div>
          )) : <div className="muted">Nenhum log de execução recente.</div>}
        </div>
      </Section>
    </div>
  );
}
