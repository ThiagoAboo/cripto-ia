import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchTrainingSummary,
  fetchTrainingSettings,
  updateTrainingSettings,
  fetchTrainingRuns,
  fetchTrainingLogs,
  fetchTrainingQualityReports,
  fetchTrainingDriftReports,
  fetchTrainingExpertReports,
  runTrainingAssistance,
} from '../lib/api';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch (_error) {
    return String(value);
  }
}

function formatNumber(value, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function translateStatus(value) {
  const map = {
    healthy: 'saudável',
    ok: 'ok',
    success: 'sucesso',
    completed: 'concluído',
    completed_with_warning: 'concluído com alerta',
    warning: 'atenção',
    failed: 'falhou',
    error: 'erro',
    low: 'baixo',
    moderate: 'moderado',
    high: 'alto',
  };

  return map[String(value || '').toLowerCase()] || (value ? String(value) : '—');
}

function Notice({ type = 'info', children }) {
  const colors = {
    info: { background: '#0f172a', border: '#1d4ed8', color: '#dbeafe' },
    success: { background: '#052e16', border: '#16a34a', color: '#dcfce7' },
    warning: { background: '#422006', border: '#d97706', color: '#fef3c7' },
    error: { background: '#450a0a', border: '#dc2626', color: '#fee2e2' },
  };

  const palette = colors[type] || colors.info;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
      }}
    >
      {children}
    </div>
  );
}

function Card({ title, subtitle, children, extra = null }) {
  return (
    <section
      style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 16,
        padding: 18,
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#f9fafb' }}>{title}</h2>
          {subtitle ? (
            <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 14 }}>{subtitle}</p>
          ) : null}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div
      style={{
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#f9fafb', fontSize: 22, fontWeight: 700 }}>{value}</div>
      {hint ? <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ margin: '0 0 12px', color: '#e5e7eb', fontSize: 16, fontWeight: 700 }}>
      {children}
    </h3>
  );
}

function TrainingLogRow({ item }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid #1f2937',
        background: '#0b1220',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: '#f3f4f6' }}>{item.stepKey || 'etapa'}</strong>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>{formatDateTime(item.createdAt)}</span>
      </div>
      <div style={{ color: '#d1d5db', marginTop: 6 }}>{item.message || 'Sem mensagem'}</div>
      <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 12 }}>
        nível: {translateStatus(item.level || item.status || 'info')}
      </div>
    </div>
  );
}

const defaultRunForm = {
  label: 'manual-training-assistance',
  objective: 'quality_assistance',
  windowDays: 14,
  symbolScope: '',
  applySuggestedWeights: false,
};

const defaultSettings = {
  minQualityScoreForApply: 0.56,
  autoApplyMode: 'guarded',
  allowApplyWithWarning: false,
};

export default function TreinamentoPage() {
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [qualityReports, setQualityReports] = useState([]);
  const [driftReports, setDriftReports] = useState([]);
  const [expertReports, setExpertReports] = useState([]);

  const [selectedRunId, setSelectedRunId] = useState('');
  const [runForm, setRunForm] = useState(defaultRunForm);

  async function loadData({ preserveRunSelection = true } = {}) {
    setLoading(true);
    setError('');

    try {
      const [
        summaryResponse,
        settingsResponse,
        runsResponse,
        qualityResponse,
        driftResponse,
        expertResponse,
      ] = await Promise.all([
        fetchTrainingSummary(),
        fetchTrainingSettings(),
        fetchTrainingRuns(12),
        fetchTrainingQualityReports(8),
        fetchTrainingDriftReports(8),
        fetchTrainingExpertReports(8),
      ]);

      const fetchedRuns = runsResponse?.items || [];
      const nextSelectedRunId =
        preserveRunSelection && selectedRunId
          ? selectedRunId
          : fetchedRuns[0]?.id
            ? String(fetchedRuns[0].id)
            : '';

      const logsResponse = await fetchTrainingLogs(120, nextSelectedRunId);

      setSummary(summaryResponse || null);
      setSettings({
        ...defaultSettings,
        ...(settingsResponse?.settings || {}),
      });
      setRuns(fetchedRuns);
      setQualityReports(qualityResponse?.items || []);
      setDriftReports(driftResponse?.items || []);
      setExpertReports(expertResponse?.items || []);
      setSelectedRunId(nextSelectedRunId);
      setLogs(logsResponse?.items || []);
    } catch (requestError) {
      setError(requestError.message || 'Falha ao carregar dados de treinamento.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    fetchTrainingLogs(120, selectedRunId)
      .then((response) => {
        setLogs(response?.items || []);
      })
      .catch((requestError) => {
        setError(requestError.message || 'Falha ao carregar logs do treinamento.');
      });
  }, [selectedRunId]);

  const latestQuality = qualityReports[0] || null;
  const latestDrift = driftReports[0] || null;
  const topExperts = useMemo(() => expertReports.slice(0, 5), [expertReports]);

  async function handleRunTraining(event) {
    event.preventDefault();
    setRunLoading(true);
    setError('');
    setNotice(null);

    try {
      const payload = {
        ...runForm,
        symbolScope: runForm.symbolScope
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
        requestedBy: 'dashboard',
      };

      const result = await runTrainingAssistance(payload);

      if (result?.warning) {
        setNotice({
          type: 'warning',
          title: 'Treinamento concluído com alerta',
          message:
            result.message ||
            'O treinamento foi executado, mas a aplicação automática dos pesos foi bloqueada.',
          detail:
            result.qualityScore !== undefined
              ? `Score atual: ${formatNumber(result.qualityScore, 4)} • mínimo: ${formatNumber(result.minRequired, 4)}`
              : '',
        });
      } else {
        setNotice({
          type: 'success',
          title: 'Treinamento concluído',
          message: 'A execução do treinamento assistido foi concluída com sucesso.',
          detail: result?.message || '',
        });
      }

      await loadData({ preserveRunSelection: false });
    } catch (requestError) {
      setError(requestError.message || 'Falha ao executar treinamento assistido.');
    } finally {
      setRunLoading(false);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsSaving(true);
    setError('');
    setNotice(null);

    try {
      const result = await updateTrainingSettings({
        minQualityScoreForApply: Number(settings.minQualityScoreForApply || 0),
        autoApplyMode: settings.autoApplyMode,
        allowApplyWithWarning: Boolean(settings.allowApplyWithWarning),
      });

      setSettings({
        ...defaultSettings,
        ...(result?.settings || {}),
      });

      setNotice({
        type: 'success',
        title: 'Configurações atualizadas',
        message: result?.message || 'As configurações de treinamento foram salvas.',
      });
    } catch (requestError) {
      setError(requestError.message || 'Falha ao salvar configurações de treinamento.');
    } finally {
      setSettingsSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Card
        title="Treinamento assistido e qualidade do modelo"
        subtitle="Agora o treinamento não quebra o fluxo quando a qualidade ficar abaixo do limiar: ele retorna alerta amigável e mantém a revisão manual no painel."
      >
        {notice ? (
          <Notice type={notice.type}>
            <strong>{notice.title}</strong>
            <div style={{ marginTop: 6 }}>{notice.message}</div>
            {notice.detail ? <div style={{ marginTop: 6, fontSize: 13 }}>{notice.detail}</div> : null}
          </Notice>
        ) : null}

        {error ? <Notice type="error">{error}</Notice> : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Metric
            label="Score de qualidade recente"
            value={formatNumber(latestQuality?.qualityScore, 4)}
            hint={latestQuality ? `status: ${translateStatus(latestQuality.qualityStatus)}` : 'sem relatório'}
          />
          <Metric
            label="Drift recente"
            value={translateStatus(latestDrift?.driftStatus)}
            hint={latestDrift ? `índice: ${formatNumber(latestDrift.driftScore, 4)}` : 'sem relatório'}
          />
          <Metric
            label="Execuções recentes"
            value={formatNumber(runs.length, 0)}
            hint={runs[0] ? `última em ${formatDateTime(runs[0].createdAt)}` : 'nenhuma execução'}
          />
          <Metric
            label="Top expert recente"
            value={topExperts[0]?.expertKey || '—'}
            hint={
              topExperts[0]
                ? `peso sugerido: ${formatNumber(topExperts[0].suggestedWeight, 3)}`
                : 'sem avaliação'
            }
          />
        </div>

        {loading ? <Notice type="info">Carregando dados do treinamento...</Notice> : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)',
            gap: 18,
          }}
        >
          <form onSubmit={handleRunTraining} style={{ display: 'grid', gap: 12 }}>
            <SectionTitle>Executar treinamento assistido</SectionTitle>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#d1d5db' }}>Label</span>
              <input
                value={runForm.label}
                onChange={(event) => setRunForm((current) => ({ ...current, label: event.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#d1d5db' }}>Janela de avaliação (dias)</span>
              <input
                type="number"
                min="1"
                value={runForm.windowDays}
                onChange={(event) =>
                  setRunForm((current) => ({
                    ...current,
                    windowDays: Number(event.target.value || 14),
                  }))
                }
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#d1d5db' }}>Escopo de símbolos</span>
              <input
                value={runForm.symbolScope}
                onChange={(event) =>
                  setRunForm((current) => ({ ...current, symbolScope: event.target.value }))
                }
                placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#d1d5db' }}>
              <input
                type="checkbox"
                checked={runForm.applySuggestedWeights}
                onChange={(event) =>
                  setRunForm((current) => ({
                    ...current,
                    applySuggestedWeights: event.target.checked,
                  }))
                }
              />
              Aplicar pesos sugeridos automaticamente
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" disabled={runLoading} style={primaryButtonStyle}>
                {runLoading ? 'Executando...' : 'Rodar treinamento assistido'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRunForm(defaultRunForm);
                  setNotice(null);
                  setError('');
                }}
                style={secondaryButtonStyle}
              >
                Limpar formulário
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveSettings} style={{ display: 'grid', gap: 12 }}>
            <SectionTitle>Configurações do guardrail de treinamento</SectionTitle>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#d1d5db' }}>Limiar mínimo para aplicar pesos</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={settings.minQualityScoreForApply}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    minQualityScoreForApply: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#d1d5db' }}>Modo de aplicação automática</span>
              <select
                value={settings.autoApplyMode}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, autoApplyMode: event.target.value }))
                }
                style={inputStyle}
              >
                <option value="guarded">Guardado</option>
                <option value="manual_first">Manual primeiro</option>
                <option value="aggressive">Mais agressivo</option>
              </select>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#d1d5db' }}>
              <input
                type="checkbox"
                checked={settings.allowApplyWithWarning}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    allowApplyWithWarning: event.target.checked,
                  }))
                }
              />
              Permitir aplicação mesmo com alerta de qualidade baixa
            </label>

            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              Recomendo manter essa opção desligada até você ganhar confiança com os relatórios
              de qualidade e drift.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" disabled={settingsSaving} style={primaryButtonStyle}>
                {settingsSaving ? 'Salvando...' : 'Salvar configuração do treinamento'}
              </button>
            </div>
          </form>
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(320px, 1fr)',
          gap: 18,
        }}
      >
        <Card
          title="Logs do treinamento"
          subtitle="Selecione uma execução para ver a trilha das etapas realizadas."
          extra={
            <select
              value={selectedRunId}
              onChange={(event) => setSelectedRunId(event.target.value)}
              style={{ ...inputStyle, minWidth: 220 }}
            >
              <option value="">Selecione uma execução</option>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} • {item.label || 'sem label'} • {formatDateTime(item.createdAt)}
                </option>
              ))}
            </select>
          }
        >
          <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflow: 'auto' }}>
            {logs.length ? (
              logs.map((item) => <TrainingLogRow key={item.id || `${item.stepKey}-${item.createdAt}`} item={item} />)
            ) : (
              <Notice type="info">Nenhum log encontrado para a execução selecionada.</Notice>
            )}
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card title="Qualidade, drift e experts" subtitle="Resumo operacional para decidir se vale aplicar pesos sugeridos.">
            <SectionTitle>Relatórios recentes de qualidade</SectionTitle>
            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {qualityReports.length ? (
                qualityReports.map((item) => (
                  <div key={item.id || `${item.createdAt}-quality`} style={rowStyle}>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                    <span>
                      score: {formatNumber(item.qualityScore, 4)} • status:{' '}
                      {translateStatus(item.qualityStatus)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={mutedTextStyle}>Nenhum relatório de qualidade encontrado.</div>
              )}
            </div>

            <SectionTitle>Relatórios recentes de drift</SectionTitle>
            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {driftReports.length ? (
                driftReports.map((item) => (
                  <div key={item.id || `${item.createdAt}-drift`} style={rowStyle}>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                    <span>
                      drift: {formatNumber(item.driftScore, 4)} • status:{' '}
                      {translateStatus(item.driftStatus)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={mutedTextStyle}>Nenhum relatório de drift encontrado.</div>
              )}
            </div>

            <SectionTitle>Experts mais fortes</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              {topExperts.length ? (
                topExperts.map((item) => (
                  <div key={item.id || `${item.expertKey}-${item.createdAt}`} style={rowStyle}>
                    <strong>{item.expertKey}</strong>
                    <span>
                      contribuição: {formatNumber(item.contributionScore, 4)} • peso sugerido:{' '}
                      {formatNumber(item.suggestedWeight, 4)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={mutedTextStyle}>Nenhum relatório de expert encontrado.</div>
              )}
            </div>
          </Card>

          <Card title="Execuções recentes" subtitle="Histórico para revisar os últimos ciclos de treinamento.">
            <div style={{ display: 'grid', gap: 10 }}>
              {runs.length ? (
                runs.map((item) => (
                  <div key={item.id} style={rowStyle}>
                    <div>
                      <strong>
                        Execução #{item.id} • {item.label || 'sem label'}
                      </strong>
                      <div style={mutedTextStyle}>
                        {formatDateTime(item.createdAt)} • objetivo: {item.objective || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div>{translateStatus(item.status)}</div>
                      <div style={mutedTextStyle}>
                        score: {formatNumber(item.qualityScore, 4)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Notice type="info">Ainda não há execuções registradas.</Notice>
              )}
            </div>
          </Card>
        </div>
      </div>

      {summary ? (
        <Card title="Resumo consolidado" subtitle="Visão rápida do estado atual do treinamento.">
          <pre
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 14,
              background: '#0b1220',
              border: '1px solid #1f2937',
              color: '#d1d5db',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(summary, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}

const inputStyle = {
  background: '#0b1220',
  color: '#f9fafb',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '10px 12px',
  outline: 'none',
};

const primaryButtonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 12,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const secondaryButtonStyle = {
  background: '#111827',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid #1f2937',
  background: '#0b1220',
  color: '#e5e7eb',
};

const mutedTextStyle = {
  color: '#9ca3af',
  fontSize: 13,
};
