import { useMemo } from 'react';
import Section from '../components/Section';
import Pill from '../components/Pill';
import { formatDateTime, formatNumber } from '../lib/format';
import { mapStatusTone } from '../lib/ui';
import { traduzirClassificacaoSocial, traduzirSeveridade, traduzirStatusGenerico } from '../lib/dashboard';

export default function SocialPage({ ctx }) {
  const { socialScores, socialAlerts, socialSummary, providerStatuses, pageFilters, clearPageFilter } = ctx;
  const symbolFilter = String(pageFilters?.social?.symbol || '').toUpperCase();

  const filteredScores = useMemo(
    () => (symbolFilter ? (socialScores || []).filter((item) => item.symbol === symbolFilter) : socialScores || []),
    [socialScores, symbolFilter],
  );
  const filteredAlerts = useMemo(
    () => (symbolFilter ? (socialAlerts || []).filter((item) => item.symbol === symbolFilter) : socialAlerts || []),
    [socialAlerts, symbolFilter],
  );

  return (
    <div className="page-stack">
      {symbolFilter ? (
        <Section title="Filtro de mercado ativo" subtitle={`Exibindo dados sociais de ${symbolFilter}.`}>
          <div className="button-row">
            <Pill tone="info">{symbolFilter}</Pill>
            <button type="button" className="button button--ghost button--small" onClick={() => clearPageFilter('social')}>
              Limpar filtro
            </button>
          </div>
        </Section>
      ) : null}

      <div className="grid two-columns">
        <Section title="Ranking social" subtitle={symbolFilter ? `Leituras sociais filtradas para ${symbolFilter}.` : 'Sugestões consultivas de moedas fortes, promissoras e de alto risco.'}>
          <div className="table-wrap compact-scroll">
            <table>
              <thead>
                <tr><th>Símbolo</th><th>Classificação</th><th>Score</th><th>Risco</th><th>Atualizado</th></tr>
              </thead>
              <tbody>
                {filteredScores.length ? filteredScores.map((item) => (
                  <tr key={item.symbol}>
                    <td>{item.symbol}</td>
                    <td>{traduzirClassificacaoSocial(item.classification)}</td>
                    <td>{formatNumber(item.score || 0, 0)}</td>
                    <td>{formatNumber(item.riskScore || 0, 0)}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                  </tr>
                )) : <tr><td colSpan="5" className="muted">{symbolFilter ? `Sem ranking social para ${symbolFilter}.` : 'Sem ranking social disponível.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        {symbolFilter ? (
          <Section title="Resumo do ativo" subtitle={`Visão social executiva para ${symbolFilter}.`}>
            <div className="list-stack">
              {filteredScores[0] ? (
                <div className="alert-card">
                  <div className="decision-card__row"><strong>{filteredScores[0].symbol}</strong><Pill tone={mapStatusTone(filteredScores[0].riskScore >= 85 ? 'bloqueado' : 'ativo')}>{traduzirClassificacaoSocial(filteredScores[0].classification)}</Pill></div>
                  <div className="muted">Score social: {formatNumber(filteredScores[0].score || 0, 0)}</div>
                  <div className="muted">Risco: {formatNumber(filteredScores[0].riskScore || 0, 0)}</div>
                </div>
              ) : (
                <div className="muted">Sem resumo social disponível para {symbolFilter}.</div>
              )}
            </div>
          </Section>
        ) : (
          <Section title="Provedores sociais" subtitle="Status do CoinGecko Demo e demais fontes ligadas ao social worker.">
            <div className="list-stack compact-scroll">
              {providerStatuses?.length ? providerStatuses.map((item) => (
                <div key={item.provider} className="list-item list-item--column">
                  <div className="decision-card__row"><strong>{item.provider}</strong><Pill tone={mapStatusTone(traduzirStatusGenerico(item.status))}>{traduzirStatusGenerico(item.status)}</Pill></div>
                  <div className="muted">Última atualização: {formatDateTime(item.updatedAt)}</div>
                  <div className="muted">Retry after: {item.retryAfterSec ? `${item.retryAfterSec}s` : '—'}</div>
                </div>
              )) : <div className="muted">Nenhum provedor social carregado.</div>}
            </div>
          </Section>
        )}
      </div>

      {!symbolFilter ? (
        <Section title="Resumo social" subtitle="Distribuição das classificações atuais e visão executiva do radar social.">
          <div className="metric-grid">
            <div className="list-item list-item--column"><strong>Fortes</strong><span>{formatNumber(socialSummary?.strongCount || 0, 0)}</span></div>
            <div className="list-item list-item--column"><strong>Promissoras</strong><span>{formatNumber(socialSummary?.promisingCount || 0, 0)}</span></div>
            <div className="list-item list-item--column"><strong>Alto risco</strong><span>{formatNumber(socialSummary?.highRiskCount || 0, 0)}</span></div>
          </div>
        </Section>
      ) : null}

      <Section title="Alertas sociais" subtitle={symbolFilter ? `Alertas sociais filtrados para ${symbolFilter}.` : 'Sinais de observação e proteção, sem execução direta de compra e venda.'}>
        <div className="list-stack compact-scroll">
          {filteredAlerts.length ? filteredAlerts.map((item) => (
            <div key={item.id} className="alert-card">
              <div className="decision-card__row"><strong>{item.symbol}</strong><Pill tone={item.severity === 'critical' ? 'high' : item.severity === 'warning' ? 'warning' : 'info'}>{traduzirSeveridade(item.severity)}</Pill></div>
              <div className="muted">{item.message || item.reasonSummary || 'Sem detalhes adicionais.'}</div>
              <div className="muted">{formatDateTime(item.createdAt)}</div>
            </div>
          )) : <div className="muted">{symbolFilter ? `Nenhum alerta social recente para ${symbolFilter}.` : 'Nenhum alerta social recente.'}</div>}
        </div>
      </Section>
    </div>
  );
}
