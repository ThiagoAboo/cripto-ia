import Section from '../components/Section';
import StatCard from '../components/StatCard';
import Pill from '../components/Pill';
import {
  formatDateTime,
  formatList,
  formatMoney,
  formatNumber,
  formatPercent,
} from '../lib/format';
import {
  traduzirAcaoDecisao,
  traduzirClassificacaoSocial,
  traduzirChaveJob,
  traduzirNivelDrift,
  traduzirQualidade,
  traduzirSeveridade,
  traduzirStatusGenerico,
} from '../lib/dashboard';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readFeeBreakdown(portfolio = {}) {
  const baseFee =
    Number(
      portfolio?.feesPaidQuote
        ?? portfolio?.feesQuote
        ?? portfolio?.feesPaid
        ?? portfolio?.quoteFee
        ?? 0,
    ) || 0;

  const bnbFee =
    Number(
      portfolio?.feesPaidBnb
        ?? portfolio?.feesBnb
        ?? portfolio?.bnbFeesPaid
        ?? portfolio?.bnbFee
        ?? 0,
    ) || 0;

  return { baseFee, bnbFee };
}

function DashboardShortcut({ label, hint, onClick }) {
  return (
    <button type="button" className="dashboard-shortcut" onClick={onClick}>
      <strong>{label}</strong>
      <span>{hint}</span>
    </button>
  );
}

export default function DashboardPage({ ctx }) {
  const {
    health,
    baseCurrency,
    currentPortfolio = {},
    currentDecisions = [],
    currentOrders = [],
    activeAlerts = [],
    latestReadiness,
    recentJobRuns = [],
    socialSummary,
    providerStatuses = [],
    trainingSummary,
    controlState,
    goToPage,
  } = ctx;

  const positions = safeArray(currentPortfolio?.positions);
  const readinessChecks = safeArray(latestReadiness?.checks).slice(0, 4);
  const topClassifications = safeArray(socialSummary?.topClassifications).slice(0, 4);
  const cooldowns = safeArray(controlState?.activeCooldowns).slice(0, 6);
  const strongSocialCount = safeArray(topClassifications)
    .filter((item) => String(item.classification || '').toUpperCase() === 'FORTE')
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const { baseFee, bnbFee } = readFeeBreakdown(currentPortfolio);
  const realizedPnl = Number(currentPortfolio?.realizedPnl || 0);
  const equity = Number(currentPortfolio?.equity || 0);
  const cashBalance = Number(currentPortfolio?.cashBalance || 0);

  const topCards = [
    {
      key: 'backend',
      label: 'Backend',
      value: health?.ok ? 'Online' : 'Indisponível',
      tone: health?.ok ? 'positive' : 'danger',
      hint: `Última checagem: ${formatDateTime(health?.timestamp || health?.checkedAt)}`,
    },
    {
      key: 'equity',
      label: 'Patrimônio simulado',
      value: formatMoney(equity, baseCurrency),
      hint: `Caixa: ${formatMoney(cashBalance, baseCurrency)}`,
    },
    {
      key: 'pnl',
      label: 'PnL realizado',
      value: formatMoney(realizedPnl, baseCurrency),
      tone: realizedPnl >= 0 ? 'positive' : 'danger',
      hint: (
        <>
          <span>Taxas {baseCurrency}: {formatMoney(baseFee, baseCurrency)}</span>
          <br />
          <span>Taxas BNB: {formatNumber(bnbFee, 6)} BNB</span>
        </>
      ),
    },
    {
      key: 'control',
      label: 'Controle do bot',
      value: controlState?.isPaused ? 'Pausado' : 'Ativo',
      tone: controlState?.isPaused || controlState?.emergencyStop ? 'warning' : 'positive',
      hint: controlState?.emergencyStop
        ? 'Parada de emergência ativa'
        : controlState?.maintenanceMode
          ? 'Modo de manutenção ligado'
          : 'Sem bloqueios globais',
    },
  ];

  return (
    <div className="page-stack dashboard-v3">
      <Section
        title="Dashboard"
        subtitle="Visão executiva da operação, do capital simulado, dos riscos e da atividade mais recente do sistema."
        actions={(
          <div className="button-row">
            <button type="button" className="button button--ghost" onClick={() => goToPage('mercado')}>Ver mercado</button>
            <button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>Ir para operações</button>
            <button type="button" className="button button--ghost" onClick={() => goToPage('execucao')}>Ir para execução</button>
          </div>
        )}
      >
        <div className="stats-grid dashboard-v3__top-grid">
          {topCards.map((card) => (
            <StatCard key={card.key} {...card} />
          ))}
        </div>

        <div className="dashboard-shortcuts-row">
          <DashboardShortcut label="Mercado" hint="Abrir mini gráficos e acompanhar moedas por base" onClick={() => goToPage('mercado')} />
          <DashboardShortcut label="Operações" hint="Ver portfólio, ordens, backtests e validações" onClick={() => goToPage('operacoes')} />
          <DashboardShortcut label="Execução" hint="Controlar runtime, prévias e ações supervisionadas" onClick={() => goToPage('execucao')} />
          <DashboardShortcut label="Governança" hint="Checar readiness, alertas e segurança operacional" onClick={() => goToPage('governanca')} />
          <DashboardShortcut label="Social" hint="Ler narrativas e risco social dos ativos" onClick={() => goToPage('social')} />
          <DashboardShortcut label="Treinamento" hint="Acompanhar runtime, drift e experts" onClick={() => goToPage('treinamento')} />
        </div>
      </Section>

      <div className="dashboard-v3__row dashboard-v3__row--half">
        <Section
          title="Cooldowns"
          subtitle={`${cooldowns.length} ativo(s) no momento.`}
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('execucao')}>Abrir execução</button>}
        >
          {cooldowns.length ? (
            <div className="list-stack compact-scroll">
              {cooldowns.map((item, index) => (
                <div className="list-item" key={item.symbol || index}>
                  <strong>{item.symbol}</strong>
                  <span className="muted">Até {formatDateTime(item.activeUntil || item.expiresAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mini-summary-grid">
              <div className="mini-summary-card">
                <span className="mini-summary-card__label">Inativos</span>
                <strong>{cooldowns.length}</strong>
                <span className="muted">Sem travas abertas agora.</span>
              </div>
              <div className="mini-summary-card">
                <span className="mini-summary-card__label">Loss streak</span>
                <strong>{Number(controlState?.guardrails?.lossStreak || 0)}</strong>
                <span className="muted">Monitorado pela camada de risco.</span>
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Sinais sociais"
          subtitle="Resumo consultivo do que está forte agora e do risco social recente."
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('social')}>Abrir social</button>}
        >
          <div className="mini-summary-grid">
            <div className="mini-summary-card">
              <span className="mini-summary-card__label">Fortes</span>
              <strong>{strongSocialCount}</strong>
              <span className="muted">Classificações fortes no radar atual.</span>
            </div>
            <div className="mini-summary-card">
              <span className="mini-summary-card__label">Providers</span>
              <strong>{providerStatuses.length}</strong>
              <span className="muted">Fontes sociais monitoradas.</span>
            </div>
          </div>
          <div className="pill-row">
            {topClassifications.length ? topClassifications.map((item, index) => (
              <Pill key={`${item.classification}-${index}`}>
                {traduzirClassificacaoSocial(item.classification)} {item.count}
              </Pill>
            )) : <div className="empty-state">Sem classificações sociais recentes.</div>}
          </div>
        </Section>
      </div>

      <div className="dashboard-v3__row dashboard-v3__row--main">
        <Section
          title="Prontidão e alertas"
          subtitle={`Status geral: ${traduzirStatusGenerico(latestReadiness?.status) || 'sem status'}`}
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('governanca')}>Abrir governança</button>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Detalhe</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {readinessChecks.length ? readinessChecks.map((item, index) => (
                  <tr key={item.key || item.label || index}>
                    <td>{item.label || item.key}</td>
                    <td>{item.message || 'Sem detalhe adicional.'}</td>
                    <td>{traduzirStatusGenerico(item.status)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="3">Nenhuma validação de prontidão foi registrada ainda.</td>
                  </tr>
                )}
                {activeAlerts.slice(0, 3).map((alert, index) => (
                  <tr key={alert.id || alert.alertKey || `alert-${index}`}>
                    <td>{alert.title || alert.alertKey}</td>
                    <td>{alert.message || 'Sem mensagem adicional.'}</td>
                    <td>{traduzirSeveridade(alert.severity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Posições"
          subtitle={`${positions.length} posição(ões) abertas na carteira simulada.`}
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>Abrir operações</button>}
        >
          {positions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Símbolo</th>
                    <th>Qtd</th>
                    <th>Entrada</th>
                    <th>Preço atual</th>
                    <th>Não realizado</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.slice(0, 8).map((position, index) => (
                    <tr key={position.symbol || index}>
                      <td>{position.symbol}</td>
                      <td>{formatNumber(position.quantity, 6)}</td>
                      <td>{formatMoney(position.avgEntryPrice, baseCurrency)}</td>
                      <td>{formatMoney(position.lastPrice, baseCurrency)}</td>
                      <td className={(position.unrealizedPnl || 0) >= 0 ? 'text-positive' : 'text-danger'}>
                        {formatMoney(position.unrealizedPnl || 0, baseCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">A carteira está zerada neste momento.</div>
          )}
        </Section>
      </div>

      <div className="dashboard-v3__row dashboard-v3__row--half">
        <Section
          title="Decisões recentes"
          subtitle="Leitura rápida do que a IA publicou por último."
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>Ver operações</button>}
        >
          <div className="list-stack compact-scroll">
            {currentDecisions.length ? currentDecisions.slice(0, 6).map((decision, index) => (
              <div className="list-item list-item--column" key={decision.id || `${decision.symbol}-${decision.createdAt || index}`}>
                <strong>{decision.symbol} • {traduzirAcaoDecisao(decision.action)}</strong>
                <div className="muted">{formatDateTime(decision.createdAt)} • confiança {formatPercent(decision.confidence || 0)}</div>
                <div className="muted">{decision.reason || decision.summary || 'Sem justificativa detalhada.'}</div>
              </div>
            )) : <div className="empty-state">A IA ainda não publicou sinais nesta base.</div>}
          </div>
        </Section>

        <Section
          title="Ordens e treinamento"
          subtitle="Resumo operacional do que foi executado e do runtime mais recente da IA."
          actions={<button type="button" className="button button--ghost" onClick={() => goToPage('treinamento')}>Abrir treinamento</button>}
        >
          <div className="list-stack compact-scroll">
            {currentOrders.length ? currentOrders.slice(0, 4).map((order, index) => (
              <div className="list-item list-item--column" key={order.id || `${order.symbol}-${order.createdAt || index}`}>
                <strong>{order.symbol} • {traduzirAcaoDecisao(order.side)}</strong>
                <div className="muted">{formatDateTime(order.createdAt)} • {traduzirStatusGenerico(order.status)}</div>
                <div className="muted">Preço: {formatMoney(order.price, baseCurrency)} • PnL: {formatMoney(order.realizedPnl || 0, baseCurrency)}</div>
              </div>
            )) : <div className="empty-state">Ainda não há ordens registradas nesta base.</div>}

            <div className="mini-summary-grid">
              <div className="mini-summary-card">
                <span className="mini-summary-card__label">Qualidade</span>
                <strong>{traduzirQualidade(trainingSummary?.qualityStatus || '—')}</strong>
                <span className="muted">Status atual do treinamento.</span>
              </div>
              <div className="mini-summary-card">
                <span className="mini-summary-card__label">Drift</span>
                <strong>{traduzirNivelDrift(trainingSummary?.driftStatus || '—')}</strong>
                <span className="muted">Coerência recente do runtime.</span>
              </div>
              <div className="mini-summary-card">
                <span className="mini-summary-card__label">Experts</span>
                <strong>{formatList(trainingSummary?.runtime?.experts || trainingSummary?.experts || []).slice(0, 42) || '—'}</strong>
                <span className="muted">Resumo dos experts ativos.</span>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section
        title="Jobs recentes"
        subtitle="Últimas rotinas automáticas disparadas pelo backend e pelos workers."
        actions={<button type="button" className="button button--ghost" onClick={() => goToPage('governanca')}>Abrir governança</button>}
      >
        <div className="list-stack compact-scroll">
          {recentJobRuns.length ? recentJobRuns.slice(0, 5).map((job, index) => (
            <div className="list-item" key={job.id || `${job.jobKey}-${job.createdAt || index}`}>
              <strong>{traduzirChaveJob(job.jobKey)}</strong>
              <span className="muted">{traduzirStatusGenerico(job.status)} • {formatDateTime(job.createdAt)}</span>
            </div>
          )) : <div className="empty-state">Ainda não há execuções automáticas registradas nesta base.</div>}
        </div>
      </Section>
    </div>
  );
}
