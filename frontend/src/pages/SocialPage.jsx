import Section from '../components/Section';
import Pill from '../components/Pill';
import { formatDateTime, formatNumber } from '../lib/format';
import { traduzirClassificacaoSocial, traduzirSeveridade, traduzirStatusGenerico } from '../lib/dashboard';

export default function SocialPage({ ctx }) {
  const { socialScores, socialAlerts, socialSummary, providerStatuses } = ctx;

  return (
    <div className="page-stack">
      <div className="grid two-columns">
        <Section title="Ranking social" subtitle="Sugestões consultivas de moedas fortes, promissoras e de alto risco.">
          <div className="table-wrap compact-scroll">
            <table>
              <thead>
                <tr><th>Símbolo</th><th>Classificação</th><th>Score</th><th>Risco</th><th>Atualizado</th></tr>
              </thead>
              <tbody>
                {socialScores?.length ? socialScores.map((item) => (
                  <tr key={item.symbol}>
                    <td>{item.symbol}</td>
                    <td>{traduzirClassificacaoSocial(item.classification)}</td>
                    <td>{formatNumber(item.score || 0, 0)}</td>
                    <td>{formatNumber(item.riskScore || 0, 0)}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                  </tr>
                )) : <tr><td colSpan="5" className="muted">Sem ranking social disponível.</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Provedores sociais" subtitle="Status do CoinGecko Demo e demais fontes ligadas ao social worker.">
          <div className="list-stack compact-scroll">
            {providerStatuses?.length ? providerStatuses.map((item) => (
              <div key={item.provider} className="list-item list-item--column">
                <div className="decision-card__row"><strong>{item.provider}</strong><Pill tone={item.status === 'healthy' ? 'buy' : item.status === 'backoff' ? 'warning' : 'high'}>{traduzirStatusGenerico(item.status)}</Pill></div>
                <div className="muted">Última atualização: {formatDateTime(item.updatedAt)}</div>
                <div className="muted">Retry after: {item.retryAfterSec ? `${item.retryAfterSec}s` : '—'}</div>
              </div>
            )) : <div className="muted">Nenhum provedor social carregado.</div>}
          </div>
        </Section>
      </div>

      <Section title="Resumo social" subtitle="Distribuição das classificações atuais e visão executiva do radar social.">
        <div className="metric-grid">
          <div className="list-item list-item--column"><strong>Fortes</strong><span>{formatNumber(socialSummary?.strongCount || 0, 0)}</span></div>
          <div className="list-item list-item--column"><strong>Promissoras</strong><span>{formatNumber(socialSummary?.promisingCount || 0, 0)}</span></div>
          <div className="list-item list-item--column"><strong>Alto risco</strong><span>{formatNumber(socialSummary?.highRiskCount || 0, 0)}</span></div>
        </div>
      </Section>

      <Section title="Alertas sociais" subtitle="Sinais de observação e proteção, sem execução direta de compra e venda.">
        <div className="list-stack compact-scroll">
          {socialAlerts?.length ? socialAlerts.map((item) => (
            <div key={item.id} className="alert-card">
              <div className="decision-card__row"><strong>{item.symbol}</strong><Pill tone={item.severity === 'critical' ? 'high' : item.severity === 'warning' ? 'warning' : 'info'}>{traduzirSeveridade(item.severity)}</Pill></div>
              <div className="muted">{item.message || item.reasonSummary || 'Sem detalhes adicionais.'}</div>
              <div className="muted">{formatDateTime(item.createdAt)}</div>
            </div>
          )) : <div className="muted">Nenhum alerta social recente.</div>}
        </div>
      </Section>
    </div>
  );
}
