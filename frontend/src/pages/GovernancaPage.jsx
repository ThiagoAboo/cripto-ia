import Section from '../components/Section';
import Pill from '../components/Pill';
import { formatDateTime, formatNumber } from '../lib/format';
import {
  traduzirCanalNotificacao,
  traduzirCanalPromocao,
  traduzirChaveJob,
  traduzirGate,
  traduzirRunbook,
  traduzirStatusGenerico,
  traduzirSeveridade,
} from '../lib/dashboard';

export default function GovernancaPage({ ctx }) {
  const {
    policyReports,
    recentOptimizations,
    recentPromotions,
    recentApprovalRequests,
    promotionLoading,
    promotionSimulation,
    handleSimulatePromotion,
    handleRequestPromotion,
    handleApproveRequest,
    handleRejectRequest,
    handleRollbackVersion,
    configHistory,
    notifications,
    notificationLoading,
    handleSendTestNotification,
    observability,
    handleRunObservabilitySnapshot,
    opsActionLoading,
    buildObservabilityExportUrl,
    runbooks,
    recentIncidentDrills,
    recentRecoveryActions,
    handleRunIncidentDrill,
    incidentActionLoading,
    handleRunRecoveryAction,
    recentJobRuns,
    runScheduledJob,
    handleOpsAction,
    runReadinessCheck,
  } = ctx;

  return (
    <div className="page-stack">

      <Section title="Promoção de vencedores" subtitle="Ações para promover ou solicitar aprovação dos vencedores do otimizador.">
        <div className="list-stack compact-scroll">
          {recentOptimizations?.length ? recentOptimizations.slice(0, 4).map((item) => (
            <div key={item.id} className="list-item list-item--column">
              <div className="decision-card__row"><strong>Run #{item.id} • {item.label}</strong><Pill tone="warning">{item.objective || 'otimização'}</Pill></div>
              <div className="button-row">
                <button className="button" disabled={promotionLoading === `simulate-paper_active-${item.id}`} onClick={() => handleSimulatePromotion(item.id, 'paper_active')}>Simular para paper</button>
                <button className="button button--ghost" disabled={promotionLoading === `request-paper_active-${item.id}`} onClick={() => handleRequestPromotion(item.id, 'paper_active')}>Solicitar paper</button>
                <button className="button button--ghost" disabled={promotionLoading === `request-live_candidate-${item.id}`} onClick={() => handleRequestPromotion(item.id, 'live_candidate')}>Solicitar candidato live</button>
              </div>
            </div>
          )) : <div className="muted">Nenhuma otimização recente disponível.</div>}
          {promotionSimulation ? (
            <div className="list-item list-item--column">
              <strong>Última simulação</strong>
              <div className="muted">Canal: {promotionSimulation.targetChannel || '—'} • score {formatNumber(promotionSimulation.winner?.performanceScore || 0, 3)}</div>
              <div className="muted">Resumo: {promotionSimulation.summary || 'Sem resumo adicional.'}</div>
            </div>
          ) : null}
        </div>
      </Section>

      <div className="grid two-columns">
        <Section title="Solicitações de aprovação" subtitle="Fluxo em duas etapas para promoções sensíveis.">
          <div className="list-stack compact-scroll">
            {recentApprovalRequests?.length ? recentApprovalRequests.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {traduzirCanalPromocao(item.targetChannel)}</strong><Pill tone={item.status === 'approved' ? 'buy' : item.status === 'rejected' ? 'high' : 'warning'}>{traduzirStatusGenerico(item.status)}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • requester {item.requestedBy || '—'}</div>
                <div className="button-row">
                  <button className="button" disabled={promotionLoading === `approve-${item.id}` || item.status !== 'pending'} onClick={() => handleApproveRequest(item.id)}>Aprovar</button>
                  <button className="button button--ghost" disabled={promotionLoading === `reject-${item.id}` || item.status !== 'pending'} onClick={() => handleRejectRequest(item.id)}>Rejeitar</button>
                </div>
              </div>
            )) : <div className="muted">Nenhuma solicitação recente.</div>}
          </div>
        </Section>

        <Section title="Promoções e rollback" subtitle="Histórico de promoções e reversão assistida da configuração.">
          <div className="list-stack compact-scroll">
            {recentPromotions?.length ? recentPromotions.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>#{item.id} • {traduzirCanalPromocao(item.targetChannel)}</strong><Pill tone="info">v{item.appliedVersion || '—'}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • status {traduzirStatusGenerico(item.status)}</div>
              </div>
            )) : <div className="muted">Nenhuma promoção recente.</div>}

            <strong className="top-gap">Rollback rápido</strong>
            {(configHistory || []).slice(0, 5).map((item) => (
              <div key={`rollback-${item.version}`} className="list-item">
                <span>Versão {item.version}</span>
                <button className="button button--ghost" disabled={promotionLoading === `rollback-${item.version}`} onClick={() => handleRollbackVersion(item.version)}>Voltar para esta versão</button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid two-columns">
        <Section title="Policy gates e jobs" subtitle="Leituras de policy e jobs agendados do backend.">
          <div className="button-row">
            <button className="button" disabled={opsActionLoading === 'readiness'} onClick={() => handleOpsAction('readiness', () => runReadinessCheck({ requestedBy: 'dashboard' }), 'Prontidão recalculada com sucesso.')}>Rodar prontidão</button>
            <button className="button button--ghost" disabled={opsActionLoading === 'observability-snapshot'} onClick={handleRunObservabilitySnapshot}>Gerar instantâneo</button>
            <button className="button button--ghost" disabled={opsActionLoading === 'job-alert_scan'} onClick={() => handleOpsAction('job-alert_scan', () => runScheduledJob('alert_scan'), 'Varredura de alertas executada.')}>Rodar varredura de alertas</button>
          </div>
          <div className="list-stack compact-scroll top-gap">
            {policyReports?.length ? policyReports.slice(0, 6).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{traduzirGate(item.gateKey)}</strong><Pill tone={item.status === 'pass' ? 'buy' : item.status === 'warn' ? 'warning' : 'high'}>{traduzirStatusGenerico(item.status)}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • warnings {formatNumber(item.warningsCount || 0, 0)}</div>
              </div>
            )) : <div className="muted">Nenhum relatório de policy recente.</div>}

            <strong className="top-gap">Jobs recentes</strong>
            {recentJobRuns?.length ? recentJobRuns.slice(0, 6).map((item) => (
              <div key={item.id} className="muted">{traduzirChaveJob(item.jobKey)} • {traduzirStatusGenerico(item.status)} • {formatDateTime(item.createdAt)}</div>
            )) : <div className="muted">Nenhum job recente.</div>}
          </div>
        </Section>

        <Section title="Alertas externos e observabilidade" subtitle="Teste de canais e exportação de dados operacionais.">
          <div className="button-row">
            <button className="button" disabled={notificationLoading === 'all'} onClick={() => handleSendTestNotification('all')}>Testar todos os canais</button>
            {(notifications.channels || []).map((channel) => (
              <button key={channel.channel} className="button button--ghost" disabled={notificationLoading === channel.channel} onClick={() => handleSendTestNotification(channel.channel)}>
                Testar {traduzirCanalNotificacao(channel.channel)}
              </button>
            ))}
          </div>
          <div className="list-stack top-gap compact-scroll">
            <div className="list-item list-item--column">
              <strong>Canais configurados</strong>
              {(notifications.channels || []).length ? notifications.channels.map((channel) => (
                <div key={channel.channel} className="muted">{traduzirCanalNotificacao(channel.channel)} • {traduzirStatusGenerico(channel.status)}</div>
              )) : <div className="muted">Nenhum canal de notificação configurado.</div>}
            </div>
            <div className="list-item list-item--column">
              <strong>Exportações rápidas</strong>
              <div className="button-row export-row">
                {(observability.exportKinds || []).slice(0, 6).map((kind) => (
                  <a key={kind} className="button button--ghost" href={buildObservabilityExportUrl(kind, 'json', 500)} target="_blank" rel="noreferrer">Exportar {kind}</a>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Runbooks e incidentes" subtitle="Simulação de incidentes e recuperação guiada agora ficam em um módulo próprio.">
        <div className="grid two-columns">
          <div className="list-stack compact-scroll">
            <strong>Runbooks</strong>
            {runbooks?.length ? runbooks.map((item) => (
              <div key={item.runbookKey} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{traduzirRunbook(item.runbookKey)}</strong><Pill tone="info">{item.category || 'geral'}</Pill></div>
                <div className="muted">{item.summary || item.description || 'Sem resumo.'}</div>
                <div className="button-row">
                  <button className="button" disabled={incidentActionLoading === `drill-${item.runbookKey}`} onClick={() => handleRunIncidentDrill(item.runbookKey, 'warning')}>Simular incidente</button>
                  {(item.recommendedActions || []).slice(0, 2).map((actionKey) => (
                    <button key={actionKey} className="button button--ghost" disabled={incidentActionLoading === `recovery-${item.runbookKey}-${actionKey}`} onClick={() => handleRunRecoveryAction(item.runbookKey, actionKey)}>{actionKey}</button>
                  ))}
                </div>
              </div>
            )) : <div className="muted">Nenhum runbook carregado.</div>}
          </div>

          <div className="list-stack compact-scroll">
            <strong>Incidentes simulados recentes</strong>
            {recentIncidentDrills?.length ? recentIncidentDrills.map((item) => (
              <div key={item.id} className="alert-card">
                <div className="decision-card__row"><strong>{traduzirRunbook(item.scenarioKey)}</strong><Pill tone={item.severity === 'critical' ? 'high' : item.severity === 'warning' ? 'warning' : 'info'}>{traduzirSeveridade(item.severity)}</Pill></div>
                <div className="muted">{formatDateTime(item.createdAt)} • {item.notes || 'Sem observações.'}</div>
              </div>
            )) : <div className="muted">Nenhum incidente simulado recente.</div>}

            <strong className="top-gap">Ações de recuperação recentes</strong>
            {recentRecoveryActions?.length ? recentRecoveryActions.map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{traduzirRunbook(item.runbookKey)}</strong><Pill tone={item.status === 'success' ? 'buy' : item.status === 'warning' ? 'warning' : 'high'}>{traduzirStatusGenerico(item.status)}</Pill></div>
                <div className="muted">{item.actionKey} • {formatDateTime(item.createdAt)}</div>
              </div>
            )) : <div className="muted">Nenhuma ação de recuperação recente.</div>}
          </div>
        </div>
      </Section>
    </div>
  );
}
