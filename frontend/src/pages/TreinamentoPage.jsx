import React, { useEffect, useMemo, useState } from 'react';
import {
  activateTrainingRuntimeRegime,
  applyTrainingRegimePreset,
  fetchTrainingDriftReports,
  fetchTrainingExpertReports,
  fetchTrainingLogs,
  fetchTrainingQualityReports,
  fetchTrainingRegimePresets,
  fetchTrainingRuns,
  fetchTrainingRuntime,
  fetchTrainingSettings,
  fetchTrainingSummary,
  runTrainingAssistance,
  syncTrainingRuntime,
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
    ready: 'pronto',
    idle: 'ocioso',
    running: 'em execução',
    attention: 'atenção',
    out_of_sync: 'fora de sincronia',
    config_only: 'somente configuração',
  };
  return map[String(value || '').toLowerCase()] || (value ? String(value) : '—');
}

const shellCardStyle = {
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: 16,
  padding: 18,
  color: '#e5e7eb',
  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
};

const sectionGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
};

const primaryButtonStyle = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  background: '#1f2937',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 600,
  cursor: 'pointer',
};

function SectionTitle({ children }) {
  return <h3 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>{children}</h3>;
}

function Card({ title, subtitle, extra, children }) {
  return (
    <section style={shellCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          {subtitle ? <p style={{ margin: '8px 0 0', color: '#9ca3af' }}>{subtitle}</p> : null}
        </div>
        {extra}
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

function Notice({ type = 'info', title, children }) {
  const palettes = {
    info: { background: '#0f172a', border: '#1d4ed8', color: '#dbeafe' },
    success: { background: '#052e16', border: '#16a34a', color: '#dcfce7' },
    warning: { background: '#422006', border: '#d97706', color: '#fef3c7' },
    error: { background: '#450a0a', border: '#dc2626', color: '#fee2e2' },
  };
  const palette = palettes[type] || palettes.info;

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        borderRadius: 12,
        padding: 12,
      }}
    >
      {title ? <strong style={{ display: 'block', marginBottom: 6 }}>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

function WeightList({ weights }) {
  const entries = Object.entries(weights || {});
  if (!entries.length) return <div style={{ color: '#9ca3af' }}>Sem pesos disponíveis.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ padding: 10, background: '#0b1220', borderRadius: 10, border: '1px solid #1f2937' }}>
          <div style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>{key}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatNumber(value, 4)}</div>
        </div>
      ))}
    </div>
  );
}

function PresetCard({ item, onApply, onActivateRuntime, applying, activating }) {
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong style={{ textTransform: 'capitalize' }}>{String(item.title || item.regimeKey || '').replace(/_/g, ' ')}</strong>
        <span style={{ fontSize: 12, color: item.isApplied ? '#34d399' : '#9ca3af' }}>
          {item.isApplied ? 'Preset salvo' : 'Disponível'}
        </span>
      </div>
      <p style={{ color: '#9ca3af' }}>{item.description}</p>
      <WeightList weights={item.weights} />
      <div style={{ marginTop: 10, color: '#9ca3af', fontSize: 13 }}>
        qualidade: {formatNumber(item.qualityScore, 4)} • drift: {formatNumber(item.driftScore, 4)} • intensidade: {formatNumber(item.intensity, 4)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" style={secondaryButtonStyle} disabled={applying} onClick={() => onApply(item.regimeKey)}>
          {applying ? 'Aplicando...' : 'Salvar preset'}
        </button>
        <button type="button" style={primaryButtonStyle} disabled={activating} onClick={() => onActivateRuntime(item.regimeKey)}>
          {activating ? 'Ativando...' : 'Ativar no runtime'}
        </button>
      </div>
    </div>
  );
}

function TrainingLogRow({ item }) {
  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1f2937' }}>
      <div style={{ fontWeight: 600 }}>{item.stepKey || 'etapa'} • {item.message || 'Sem mensagem'}</div>
      <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
        {formatDateTime(item.createdAt)} • nível: {translateStatus(item.level || item.status || 'info')}
      </div>
      {item.payload ? (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, color: '#cbd5e1' }}>
          {typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export default function TreinamentoPage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [presetAction, setPresetAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const [summary, setSummary] = useState(null);
  const [settingsPayload, setSettingsPayload] = useState(null);
  const [runtimePayload, setRuntimePayload] = useState(null);
  const [presetsPayload, setPresetsPayload] = useState(null);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [qualityReports, setQualityReports] = useState([]);
  const [driftReports, setDriftReports] = useState([]);
  const [expertReports, setExpertReports] = useState([]);

  const [form, setForm] = useState({
    label: 'manual-training-assistance',
    objective: 'quality_assistance',
    windowDays: 14,
    symbolScope: '',
    applySuggestedWeights: false,
  });

  const [settingsForm, setSettingsForm] = useState({
    minQualityScoreForApply: 0.56,
    autoApplyMode: 'guarded',
    allowApplyWithWarning: false,
    adaptiveExpertsEnabled: true,
    adaptiveRegimePresetsEnabled: true,
    maxWeightShiftPerRun: 0.15,
  });

  const loadEverything = async () => {
    setLoading(true);
    setError('');
    try {
      const [
        summaryData,
        settingsData,
        runtimeData,
        presetsData,
        runsData,
        logsData,
        qualityData,
        driftData,
        expertData,
      ] = await Promise.all([
        fetchTrainingSummary(),
        fetchTrainingSettings(),
        fetchTrainingRuntime(),
        fetchTrainingRegimePresets(12),
        fetchTrainingRuns(12),
        fetchTrainingLogs(100),
        fetchTrainingQualityReports(12),
        fetchTrainingDriftReports(12),
        fetchTrainingExpertReports(12),
      ]);

      setSummary(summaryData || null);
      setSettingsPayload(settingsData || null);
      setRuntimePayload(runtimeData || null);
      setPresetsPayload(presetsData || null);
      setRuns(runsData?.items || []);
      setLogs(logsData?.items || []);
      setQualityReports(qualityData?.items || []);
      setDriftReports(driftData?.items || []);
      setExpertReports(expertData?.items || []);

      const nextSettings = settingsData?.settings || {};
      setSettingsForm((current) => ({
        ...current,
        ...nextSettings,
      }));
      setForm((current) => ({
        ...current,
        windowDays: nextSettings.evaluationWindowDays || current.windowDays || 14,
      }));
    } catch (requestError) {
      setError(requestError.message || 'Falha ao carregar a governança do treinamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEverything();
  }, []);

  const latestQuality = qualityReports[0] || null;
  const latestDrift = driftReports[0] || null;
  const currentRuntime = runtimePayload?.runtime || null;

  const runtimeDiff = useMemo(() => {
    const runtimeWeights = currentRuntime?.effectiveExpertWeights || {};
    const configWeights = runtimePayload?.training?.expertWeights || {};
    const keys = Array.from(new Set([...Object.keys(runtimeWeights), ...Object.keys(configWeights)]));
    return keys.map((key) => ({
      key,
      runtime: Number(runtimeWeights[key] || 0),
      config: Number(configWeights[key] || 0),
      delta: Number((Number(runtimeWeights[key] || 0) - Number(configWeights[key] || 0)).toFixed(4)),
    }));
  }, [currentRuntime, runtimePayload]);

  const handleRunTraining = async () => {
    setTrainingLoading(true);
    setError('');
    setNotice(null);
    try {
      const result = await runTrainingAssistance({
        label: form.label || 'manual-training-assistance',
        objective: form.objective || 'quality_assistance',
        windowDays: Number(form.windowDays || settingsForm.evaluationWindowDays || 14),
        symbolScope: form.symbolScope || null,
        applySuggestedWeights: Boolean(form.applySuggestedWeights),
        requestedBy: 'dashboard',
      });

      if (result?.warning) {
        setNotice({
          type: 'warning',
          title: 'Treinamento concluído com alerta',
          message: `${result.message} Score atual: ${formatNumber(result.qualityScore, 4)} • mínimo: ${formatNumber(result.minRequired, 2)}`,
        });
      } else {
        setNotice({
          type: 'success',
          title: 'Treinamento concluído',
          message: `Execução registrada${result?.id ? ` #${result.id}` : ''}.`,
        });
      }

      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao rodar treinamento assistido.');
    } finally {
      setTrainingLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setNotice(null);
    try {
      const payload = await updateTrainingSettings({
        ...settingsForm,
        requestedBy: 'dashboard',
      });
      setSettingsPayload((current) => ({
        ...(current || {}),
        ...payload,
      }));
      setNotice({
        type: 'success',
        title: 'Configurações salvas',
        message: payload.message || 'As configurações do treinamento foram atualizadas.',
      });
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao salvar configurações do treinamento.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApplyPreset = async (regimeKey) => {
    setPresetAction(`apply:${regimeKey}`);
    setError('');
    setNotice(null);
    try {
      const payload = await applyTrainingRegimePreset(regimeKey, 'dashboard');
      setNotice({
        type: 'success',
        title: 'Preset salvo na configuração',
        message: payload.message || `Preset ${regimeKey} salvo com sucesso.`,
      });
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao aplicar preset.');
    } finally {
      setPresetAction('');
    }
  };

  const handleActivateRuntime = async (regimeKey) => {
    setPresetAction(`runtime:${regimeKey}`);
    setError('');
    setNotice(null);
    try {
      const payload = await activateTrainingRuntimeRegime(regimeKey, 'dashboard');
      setNotice({
        type: 'success',
        title: 'Regime ativado em runtime',
        message: payload.message || `Regime ${regimeKey} ativado com sucesso para a AI.`,
      });
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao ativar regime em runtime.');
    } finally {
      setPresetAction('');
    }
  };

  const handleSyncRuntime = async () => {
    setPresetAction('runtime:sync');
    setError('');
    setNotice(null);
    try {
      const payload = await syncTrainingRuntime('dashboard');
      setNotice({
        type: 'success',
        title: 'Runtime sincronizado',
        message: payload.message || 'Runtime sincronizado com o preset ativo.',
      });
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao sincronizar runtime.');
    } finally {
      setPresetAction('');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <Card title="Treinamento" subtitle="Carregando governança e runtime da AI..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error ? <Notice type="error" title="Falha">{error}</Notice> : null}
      {notice ? <Notice type={notice.type} title={notice.title}>{notice.message}</Notice> : null}

      <Card
        title="Treinamento assistido e runtime da AI"
        subtitle="Nesta etapa, o painel passa a controlar explicitamente o regime ativo de runtime e os pesos efetivos usados pela AI."
        extra={
          <button type="button" style={secondaryButtonStyle} onClick={loadEverything}>
            Atualizar
          </button>
        }
      >
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Resumo rápido</SectionTitle>
            <div>Qualidade atual: <strong>{formatNumber(latestQuality?.qualityScore, 4)}</strong></div>
            <div>Status da qualidade: <strong>{translateStatus(latestQuality?.qualityStatus)}</strong></div>
            <div>Drift atual: <strong>{formatNumber(latestDrift?.driftScore, 4)}</strong></div>
            <div>Status do drift: <strong>{translateStatus(latestDrift?.driftStatus)}</strong></div>
            <div>Regime ativo em runtime: <strong>{currentRuntime?.currentRegime || '—'}</strong></div>
            <div>Status do runtime: <strong>{translateStatus(currentRuntime?.runtimeStatus)}</strong></div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Rodar treinamento assistido</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              <label>
                <div style={{ marginBottom: 6 }}>Label</div>
                <input value={form.label} onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ marginBottom: 6 }}>Objetivo</div>
                <input value={form.objective} onChange={(e) => setForm((c) => ({ ...c, objective: e.target.value }))} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ marginBottom: 6 }}>Janela de avaliação (dias)</div>
                <input type="number" value={form.windowDays} onChange={(e) => setForm((c) => ({ ...c, windowDays: e.target.value }))} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ marginBottom: 6 }}>Escopo de símbolos (opcional)</div>
                <input value={form.symbolScope} onChange={(e) => setForm((c) => ({ ...c, symbolScope: e.target.value }))} placeholder="BTCUSDT,ETHUSDT" style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.applySuggestedWeights} onChange={(e) => setForm((c) => ({ ...c, applySuggestedWeights: e.target.checked }))} />
                Aplicar pesos sugeridos automaticamente
              </label>
              <button type="button" style={primaryButtonStyle} disabled={trainingLoading} onClick={handleRunTraining}>
                {trainingLoading ? 'Executando...' : 'Rodar treinamento assistido'}
              </button>
            </div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Guardrails do treinamento</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              <label>
                <div style={{ marginBottom: 6 }}>Limiar mínimo para aplicar pesos</div>
                <input
                  type="number"
                  step="0.01"
                  value={settingsForm.minQualityScoreForApply}
                  onChange={(e) => setSettingsForm((c) => ({ ...c, minQualityScoreForApply: Number(e.target.value || 0) }))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div style={{ marginBottom: 6 }}>Modo de aplicação automática</div>
                <select
                  value={settingsForm.autoApplyMode}
                  onChange={(e) => setSettingsForm((c) => ({ ...c, autoApplyMode: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="guarded">guarded</option>
                  <option value="manual_only">manual_only</option>
                  <option value="aggressive">aggressive</option>
                </select>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(settingsForm.allowApplyWithWarning)}
                  onChange={(e) => setSettingsForm((c) => ({ ...c, allowApplyWithWarning: e.target.checked }))}
                />
                Permitir aplicação com alerta
              </label>
              <button type="button" style={secondaryButtonStyle} disabled={savingSettings} onClick={handleSaveSettings}>
                {savingSettings ? 'Salvando...' : 'Salvar guardrails'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Runtime da AI"
        subtitle="Estado explícito que a AI deve consumir: regime atual, pesos efetivos e última sincronização."
        extra={
          <button type="button" style={secondaryButtonStyle} disabled={presetAction === 'runtime:sync'} onClick={handleSyncRuntime}>
            {presetAction === 'runtime:sync' ? 'Sincronizando...' : 'Sincronizar runtime'}
          </button>
        }
      >
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Estado atual</SectionTitle>
            <div>Regime atual: <strong>{currentRuntime?.currentRegime || '—'}</strong></div>
            <div>Fonte: <strong>{currentRuntime?.source || '—'}</strong></div>
            <div>Status: <strong>{translateStatus(currentRuntime?.runtimeStatus)}</strong></div>
            <div>Saúde da sincronização: <strong>{translateStatus(currentRuntime?.syncHealth)}</strong></div>
            <div>Última sincronização: <strong>{formatDateTime(currentRuntime?.lastRuntimeSyncAt)}</strong></div>
            <div>Último reporte do worker: <strong>{formatDateTime(currentRuntime?.workerReportedAt)}</strong></div>
            <div>Defasagem do worker: <strong>{currentRuntime?.workerLagSeconds != null ? `${formatNumber(currentRuntime?.workerLagSeconds, 0)}s` : '—'}</strong></div>
            <div>Worker: <strong>{currentRuntime?.workerName || '—'}</strong></div>
            <div>Config usada no sync: <strong>{runtimePayload?.configVersion || currentRuntime?.configVersionAtSync || '—'}</strong></div>
            <div>Versão vista pelo worker: <strong>{currentRuntime?.workerConfigVersionSeen || '—'}</strong></div>
            <div>Última ação da AI: <strong>{currentRuntime?.lastDecisionAction || '—'}</strong></div>
            <div>Motivo da última ação: <strong>{currentRuntime?.lastDecisionReason || '—'}</strong></div>
            <div>Expert dominante: <strong>{currentRuntime?.dominantExpertKey || '—'}</strong>{currentRuntime?.dominantExpertScore != null ? ` • score ${formatNumber(currentRuntime?.dominantExpertScore, 4)}` : ''}</div>
            <div style={{ marginTop: 10, color: '#9ca3af' }}>{currentRuntime?.notes || 'Sem observações recentes.'}</div>
            {(currentRuntime?.syncIssues || []).length ? (
              <div style={{ marginTop: 10, color: '#fbbf24', fontSize: 13 }}>
                Pendências: {(currentRuntime.syncIssues || []).join(' • ')}
              </div>
            ) : null}
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Pesos efetivos em runtime</SectionTitle>
            <WeightList weights={currentRuntime?.effectiveExpertWeights || {}} />
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Diferença vs. configuração</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              {runtimeDiff.length ? runtimeDiff.map((item) => (
                <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 14 }}>
                  <div style={{ textTransform: 'uppercase', color: '#9ca3af' }}>{item.key}</div>
                  <div>runtime: {formatNumber(item.runtime, 4)}</div>
                  <div>config: {formatNumber(item.config, 4)}</div>
                  <div style={{ color: item.delta === 0 ? '#9ca3af' : item.delta > 0 ? '#34d399' : '#f59e0b' }}>
                    Δ {formatNumber(item.delta, 4)}
                  </div>
                </div>
              )) : <div style={{ color: '#9ca3af' }}>Sem dados de comparação.</div>}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Presets adaptativos por regime" subtitle="Salvar preset atualiza a configuração. Ativar no runtime muda o regime efetivo consumido pela AI.">
        <div style={{ ...sectionGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {(presetsPayload?.presets || []).map((item) => (
            <PresetCard
              key={item.regimeKey}
              item={item}
              onApply={handleApplyPreset}
              onActivateRuntime={handleActivateRuntime}
              applying={presetAction === `apply:${item.regimeKey}`}
              activating={presetAction === `runtime:${item.regimeKey}`}
            />
          ))}
        </div>
      </Card>

      <Card title="Qualidade, drift e experts" subtitle="Governança contínua para validar se o runtime está coerente com o mercado atual.">
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Últimos relatórios de qualidade</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              {qualityReports.slice(0, 5).map((item, index) => (
                <div key={index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>
                  <div><strong>{formatNumber(item.qualityScore, 4)}</strong> • {translateStatus(item.qualityStatus)}</div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Últimos relatórios de drift</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              {driftReports.slice(0, 5).map((item, index) => (
                <div key={index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>
                  <div><strong>{formatNumber(item.driftScore, 4)}</strong> • {translateStatus(item.driftStatus)}</div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Experts mais fortes</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              {expertReports.slice(0, 7).map((item, index) => (
                <div key={index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>
                  <div><strong>{item.expertKey || item.name || 'expert'}</strong></div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    hit rate: {formatNumber(item.hitRate, 4)} • contribuição: {formatNumber(item.contributionScore, 4)} • peso sugerido: {formatNumber(item.suggestedWeight, 4)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Execuções e logs do treinamento" subtitle="Histórico operacional do treinamento assistido.">
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Execuções recentes</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              {runs.slice(0, 8).map((item) => (
                <div key={item.id || `${item.label}-${item.createdAt}`} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}>
                  <div><strong>{item.label || `Execução #${item.id}`}</strong></div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    {formatDateTime(item.createdAt)} • status: {translateStatus(item.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Logs do treinamento</SectionTitle>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {logs.slice(0, 40).map((item, index) => (
                <TrainingLogRow key={`${item.createdAt}-${index}`} item={item} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
