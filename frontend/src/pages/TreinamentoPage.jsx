import React, { useEffect, useMemo, useState } from 'react';
import {
  applyTrainingRegimePreset,
  fetchTrainingDriftReports,
  fetchTrainingExpertReports,
  fetchTrainingLogs,
  fetchTrainingQualityReports,
  fetchTrainingRegimePresets,
  fetchTrainingRuns,
  fetchTrainingSettings,
  fetchTrainingSummary,
  runTrainingAssistance,
  updateTrainingSettings,
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

function Notice({ type = 'info', title, children, detail }) {
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
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        borderRadius: 16,
        padding: '14px 16px',
        display: 'grid',
        gap: 6,
      }}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
      {detail ? <small style={{ opacity: 0.9 }}>{detail}</small> : null}
    </div>
  );
}

function Card({ title, subtitle, children, extra = null }) {
  return (
    <section
      style={{
        display: 'grid',
        gap: 14,
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 20,
        padding: 20,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          {subtitle ? <p style={{ margin: 0, color: '#9ca3af' }}>{subtitle}</p> : null}
        </div>
        {extra}
      </header>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
      <div style={{ color: '#9ca3af', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 style={{ margin: 0, fontSize: 16 }}>{children}</h3>;
}

function TrainingLogRow({ item }) {
  return (
    <div style={rowStyle}>
      <div style={{ display: 'grid', gap: 4 }}>
        <strong>{item.stepKey || 'etapa'}</strong>
        <span style={{ color: '#e5e7eb' }}>{item.message || 'Sem mensagem'}</span>
      </div>
      <div style={{ textAlign: 'right', display: 'grid', gap: 4 }}>
        <small style={mutedTextStyle}>{formatDateTime(item.createdAt)}</small>
        <small style={mutedTextStyle}>nível: {translateStatus(item.level || item.status || 'info')}</small>
      </div>
    </div>
  );
}

function PresetCard({ item, onApply, applying }) {
  return (
    <div style={{ ...rowStyle, alignItems: 'stretch', display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <strong style={{ textTransform: 'capitalize' }}>{item.title}</strong>
          <span
            style={{
              fontSize: 12,
              color: item.isApplied ? '#86efac' : '#9ca3af',
              border: `1px solid ${item.isApplied ? '#166534' : '#374151'}`,
              background: item.isApplied ? '#052e16' : '#111827',
              borderRadius: 999,
              padding: '4px 8px',
            }}
          >
            {item.isApplied ? 'Aplicado' : 'Disponível'}
          </span>
        </div>
        <div style={mutedTextStyle}>{item.description}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(item.weights || {}).map(([key, value]) => (
            <span
              key={key}
              style={{
                border: '1px solid #374151',
                borderRadius: 999,
                padding: '4px 8px',
                fontSize: 12,
                color: '#d1d5db',
                background: '#0b1220',
              }}
            >
              {key}: {formatNumber(value, 4)}
            </span>
          ))}
        </div>
        <small style={mutedTextStyle}>
          qualidade: {formatNumber(item.qualityScore, 4)} • drift: {formatNumber(item.driftScore, 4)} • intensidade:{' '}
          {formatNumber(item.intensity, 4)}
        </small>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onApply(item.regimeKey)}
          disabled={applying}
          style={item.isApplied ? secondaryButtonStyle : primaryButtonStyle}
        >
          {applying ? 'Aplicando...' : item.isApplied ? 'Reaplicar preset' : 'Aplicar preset'}
        </button>
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
  adaptiveExpertsEnabled: true,
  adaptiveRegimePresetsEnabled: true,
  maxWeightShiftPerRun: 0.15,
};

export default function TreinamentoPage() {
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [presetApplying, setPresetApplying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [qualityReports, setQualityReports] = useState([]);
  const [driftReports, setDriftReports] = useState([]);
  const [expertReports, setExpertReports] = useState([]);
  const [regimePresets, setRegimePresets] = useState([]);
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
        presetResponse,
      ] = await Promise.all([
        fetchTrainingSummary(),
        fetchTrainingSettings(),
        fetchTrainingRuns(12),
        fetchTrainingQualityReports(8),
        fetchTrainingDriftReports(8),
        fetchTrainingExpertReports(8),
        fetchTrainingRegimePresets(12),
      ]);

      const fetchedRuns = runsResponse?.items || [];
      const nextSelectedRunId = preserveRunSelection && selectedRunId
        ? selectedRunId
        : fetchedRuns[0]?.id
          ? String(fetchedRuns[0].id)
          : '';

      const logsResponse = await fetchTrainingLogs(120, nextSelectedRunId);

      setSummary(summaryResponse || null);
      setSettings({ ...defaultSettings, ...(settingsResponse?.settings || {}) });
      setRuns(fetchedRuns);
      setQualityReports(qualityResponse?.items || []);
      setDriftReports(driftResponse?.items || []);
      setExpertReports(expertResponse?.items || []);
      setRegimePresets(presetResponse?.presets || []);
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
        requestedBy: 'dashboard',
        minQualityScoreForApply: Number(settings.minQualityScoreForApply || 0),
        autoApplyMode: settings.autoApplyMode,
        allowApplyWithWarning: Boolean(settings.allowApplyWithWarning),
        adaptiveExpertsEnabled: Boolean(settings.adaptiveExpertsEnabled),
        adaptiveRegimePresetsEnabled: Boolean(settings.adaptiveRegimePresetsEnabled),
        maxWeightShiftPerRun: Number(settings.maxWeightShiftPerRun || 0.15),
      });

      setSettings({ ...defaultSettings, ...(result?.settings || {}) });
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

  async function handleApplyPreset(regimeKey) {
    setPresetApplying(true);
    setError('');
    setNotice(null);

    try {
      const result = await applyTrainingRegimePreset({ regimeKey, requestedBy: 'dashboard' });
      setNotice({
        type: 'success',
        title: 'Preset aplicado',
        message: result?.message || 'Preset aplicado com sucesso.',
        detail: result?.preset?.regimeKey ? `Regime: ${result.preset.regimeKey}` : '',
      });
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao aplicar preset de regime.');
    } finally {
      setPresetApplying(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {notice ? (
        <Notice type={notice.type} title={notice.title} detail={notice.detail}>
          {notice.message}
        </Notice>
      ) : null}

      {error ? <Notice type="error">{error}</Notice> : null}

      {loading ? <Notice>Carregando dados do treinamento...</Notice> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Metric label="Score de qualidade" value={formatNumber(latestQuality?.qualityScore, 4)} hint={translateStatus(latestQuality?.qualityStatus)} />
        <Metric label="Drift atual" value={formatNumber(latestDrift?.driftScore, 4)} hint={translateStatus(latestDrift?.driftStatus)} />
        <Metric label="Execuções recentes" value={formatNumber(runs.length, 0)} hint="Últimas execuções carregadas" />
        <Metric label="Experts monitorados" value={formatNumber(topExperts.length, 0)} hint="Top 5 exibidos abaixo" />
      </div>

      <Card title="Executar treinamento assistido" subtitle="Rode uma nova avaliação sem sair do painel.">
        <form onSubmit={handleRunTraining} style={{ display: 'grid', gap: 14 }}>
          <div style={gridTwoColsStyle}>
            <label style={fieldStyle}>
              <span>Label</span>
              <input
                value={runForm.label}
                onChange={(event) =>
                  setRunForm((current) => ({ ...current, label: event.target.value }))
                }
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span>Janela de avaliação (dias)</span>
              <input
                type="number"
                min="1"
                value={runForm.windowDays}
                onChange={(event) =>
                  setRunForm((current) => ({ ...current, windowDays: Number(event.target.value || 14) }))
                }
                style={inputStyle}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            <span>Escopo de símbolos</span>
            <input
              value={runForm.symbolScope}
              onChange={(event) =>
                setRunForm((current) => ({ ...current, symbolScope: event.target.value }))
              }
              placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
              style={inputStyle}
            />
          </label>

          <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={runForm.applySuggestedWeights}
              onChange={(event) =>
                setRunForm((current) => ({ ...current, applySuggestedWeights: event.target.checked }))
              }
            />
            <span>Aplicar pesos sugeridos automaticamente</span>
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
      </Card>

      <Card title="Configurações do guardrail de treinamento" subtitle="Defina como o treinamento pode sugerir e aplicar pesos.">
        <form onSubmit={handleSaveSettings} style={{ display: 'grid', gap: 14 }}>
          <div style={gridTwoColsStyle}>
            <label style={fieldStyle}>
              <span>Limiar mínimo para aplicar pesos</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={settings.minQualityScoreForApply}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, minQualityScoreForApply: event.target.value }))
                }
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span>Modo de aplicação automática</span>
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
          </div>

          <div style={gridTwoColsStyle}>
            <label style={fieldStyle}>
              <span>Shift máximo de peso por run</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={settings.maxWeightShiftPerRun}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, maxWeightShiftPerRun: event.target.value }))
                }
                style={inputStyle}
              />
            </label>
            <div style={{ display: 'grid', gap: 10, alignContent: 'center' }}>
              <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.allowApplyWithWarning)}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, allowApplyWithWarning: event.target.checked }))
                  }
                />
                <span>Permitir aplicação mesmo com alerta de qualidade baixa</span>
              </label>
              <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.adaptiveExpertsEnabled)}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, adaptiveExpertsEnabled: event.target.checked }))
                  }
                />
                <span>Ativar aprendizado contínuo dos experts</span>
              </label>
              <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.adaptiveRegimePresetsEnabled)}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, adaptiveRegimePresetsEnabled: event.target.checked }))
                  }
                />
                <span>Ativar presets adaptativos por regime</span>
              </label>
            </div>
          </div>

          <div style={{ color: '#9ca3af', fontSize: 13 }}>
            Recomendo manter a aplicação automática em modo guardado até você ganhar confiança com os relatórios de qualidade, drift e os presets abaixo.
          </div>

          <div>
            <button type="submit" disabled={settingsSaving} style={primaryButtonStyle}>
              {settingsSaving ? 'Salvando...' : 'Salvar configuração do treinamento'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Presets adaptativos por regime" subtitle="Recomendações automáticas de pesos por comportamento de mercado.">
        <div style={{ display: 'grid', gap: 12 }}>
          {regimePresets.length ? (
            regimePresets.map((item) => (
              <PresetCard key={item.regimeKey} item={item} onApply={handleApplyPreset} applying={presetApplying} />
            ))
          ) : (
            <div style={mutedTextStyle}>Nenhum preset adaptativo encontrado.</div>
          )}
        </div>
      </Card>

      <Card title="Logs do treinamento" subtitle="Acompanhe a execução selecionada e as últimas etapas registradas.">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={fieldStyle}>
              <span>Execução selecionada</span>
              <select
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
                style={{ ...inputStyle, minWidth: 260 }}
              >
                <option value="">Selecione uma execução</option>
                {runs.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id} • {item.label || 'sem label'} • {formatDateTime(item.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {logs.length ? logs.map((item) => <TrainingLogRow key={item.id || `${item.createdAt}-${item.stepKey}`} item={item} />) : (
            <div style={mutedTextStyle}>Nenhum log encontrado para a execução selecionada.</div>
          )}
        </div>
      </Card>

      <div style={gridTwoColsStyle}>
        <Card title="Relatórios recentes de qualidade">
          <div style={{ display: 'grid', gap: 10 }}>
            {qualityReports.length ? (
              qualityReports.map((item) => (
                <div key={item.id || item.createdAt} style={rowStyle}>
                  <div>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                    <div style={mutedTextStyle}>score: {formatNumber(item.qualityScore, 4)}</div>
                  </div>
                  <span style={mutedTextStyle}>{translateStatus(item.qualityStatus)}</span>
                </div>
              ))
            ) : (
              <div style={mutedTextStyle}>Nenhum relatório de qualidade encontrado.</div>
            )}
          </div>
        </Card>

        <Card title="Relatórios recentes de drift">
          <div style={{ display: 'grid', gap: 10 }}>
            {driftReports.length ? (
              driftReports.map((item) => (
                <div key={item.id || item.createdAt} style={rowStyle}>
                  <div>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                    <div style={mutedTextStyle}>drift: {formatNumber(item.driftScore, 4)}</div>
                  </div>
                  <span style={mutedTextStyle}>{translateStatus(item.driftStatus)}</span>
                </div>
              ))
            ) : (
              <div style={mutedTextStyle}>Nenhum relatório de drift encontrado.</div>
            )}
          </div>
        </Card>
      </div>

      <div style={gridTwoColsStyle}>
        <Card title="Experts mais fortes">
          <div style={{ display: 'grid', gap: 10 }}>
            {topExperts.length ? (
              topExperts.map((item) => (
                <div key={item.id || item.expertKey} style={rowStyle}>
                  <div>
                    <strong>{item.expertKey}</strong>
                    <div style={mutedTextStyle}>
                      contribuição: {formatNumber(item.contributionScore, 4)} • peso sugerido: {formatNumber(item.suggestedWeight, 4)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={mutedTextStyle}>Nenhum relatório de expert encontrado.</div>
            )}
          </div>
        </Card>

        <Card title="Execuções recentes">
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.length ? (
              runs.map((item) => (
                <div key={item.id} style={rowStyle}>
                  <div>
                    <strong>Execução #{item.id} • {item.label || 'sem label'}</strong>
                    <div style={mutedTextStyle}>
                      {formatDateTime(item.createdAt)} • objetivo: {item.objective || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={mutedTextStyle}>{translateStatus(item.status)}</div>
                    <div style={mutedTextStyle}>score: {formatNumber(item.qualityScore, 4)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={mutedTextStyle}>Ainda não há execuções registradas.</div>
            )}
          </div>
        </Card>
      </div>

      <Card title="Resumo bruto da governança" subtitle="Saída detalhada do summary para inspeção rápida.">
        {summary ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              color: '#d1d5db',
              background: '#0b1220',
              border: '1px solid #1f2937',
              borderRadius: 16,
              padding: 16,
            }}
          >
            {JSON.stringify(summary, null, 2)}
          </pre>
        ) : (
          <div style={mutedTextStyle}>Resumo indisponível no momento.</div>
        )}
      </Card>
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
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #1f2937',
  background: '#0b1220',
  color: '#e5e7eb',
};

const mutedTextStyle = {
  color: '#9ca3af',
  fontSize: 13,
};

const fieldStyle = {
  display: 'grid',
  gap: 8,
  color: '#e5e7eb',
};

const gridTwoColsStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 14,
};
