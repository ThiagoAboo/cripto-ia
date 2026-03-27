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
  return <h3 style={{ margin: 0, fontSize: 16 }}>{children}</h3>;
}

function Card({ title, subtitle, extra, children }) {
  return (
    <section style={shellCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
          {subtitle ? <p style={{ margin: '6px 0 0', color: '#9ca3af' }}>{subtitle}</p> : null}
        </div>
        {extra}
      </div>
      {children}
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
    <div style={{ background: palette.background, color: palette.color, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}>
      {title ? <strong style={{ display: 'block', marginBottom: 6 }}>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

function WeightList({ weights }) {
  const entries = Object.entries(weights || {});
  if (!entries.length) return <div style={{ color: '#9ca3af' }}>Sem pesos disponíveis.</div>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ textTransform: 'uppercase', color: '#9ca3af' }}>{key}</span>
          <strong>{formatNumber(value, 4)}</strong>
        </div>
      ))}
    </div>
  );
}

function PresetCard({ item, onApply, onActivateRuntime, applying, activating }) {
  return (
    <div style={{ ...shellCardStyle, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong>{String(item.title || item.regimeKey || '').replace(/_/g, ' ')}</strong>
        <span style={{ color: item.isApplied ? '#34d399' : '#9ca3af', fontSize: 13 }}>{item.isApplied ? 'Preset salvo' : 'Disponível'}</span>
      </div>
      <p style={{ color: '#9ca3af', margin: '8px 0 12px' }}>{item.description}</p>
      <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>
        qualidade: {formatNumber(item.qualityScore, 4)} • drift: {formatNumber(item.driftScore, 4)} • intensidade: {formatNumber(item.intensity, 4)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={secondaryButtonStyle} onClick={() => onApply(item.regimeKey)}>
          {applying ? 'Aplicando...' : 'Salvar preset'}
        </button>
        <button type="button" style={primaryButtonStyle} onClick={() => onActivateRuntime(item.regimeKey)}>
          {activating ? 'Ativando...' : 'Ativar no runtime'}
        </button>
      </div>
    </div>
  );
}

function TrainingLogRow({ item }) {
  return (
    <div style={{ borderBottom: '1px solid #1f2937', paddingBottom: 10 }}>
      <div><strong>{item.stepKey || 'etapa'}</strong> • {item.message || 'Sem mensagem'}</div>
      <div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)} • nível: {translateStatus(item.level || item.status || 'info')}</div>
      {item.payload ? (
        <pre style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: 12, marginTop: 8 }}>
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
      setSettingsForm((current) => ({ ...current, ...nextSettings }));
      setForm((current) => ({ ...current, windowDays: nextSettings.evaluationWindowDays || current.windowDays || 14 }));
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
        setNotice({ type: 'success', title: 'Treinamento concluído', message: `Execução registrada${result?.id ? ` #${result.id}` : ''}.` });
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
      const payload = await updateTrainingSettings({ ...settingsForm, requestedBy: 'dashboard' });
      setSettingsPayload((current) => ({ ...(current || {}), ...payload }));
      setNotice({ type: 'success', title: 'Configurações salvas', message: payload.message || 'As configurações do treinamento foram atualizadas.' });
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
      setNotice({ type: 'success', title: 'Preset salvo na configuração', message: payload.message || `Preset ${regimeKey} salvo com sucesso.` });
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
      setNotice({ type: 'success', title: 'Regime ativado em runtime', message: payload.message || `Regime ${regimeKey} ativado com sucesso para a AI.` });
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
      setNotice({ type: 'success', title: 'Runtime sincronizado', message: payload.message || 'Runtime sincronizado com o preset ativo.' });
      await loadEverything();
    } catch (requestError) {
      setError(requestError.message || 'Falha ao sincronizar runtime.');
    } finally {
      setPresetAction('');
    }
  };

  if (loading) {
    return <div style={{ display: 'grid', gap: 16 }}><Card title="Treinamento" subtitle="Carregando governança e runtime da AI..." /></div>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error ? <Notice type="error" title="Falha">{error}</Notice> : null}
      {notice ? <Notice type={notice.type} title={notice.title}>{notice.message}</Notice> : null}

      <Card
        title="Treinamento assistido e runtime da AI"
        subtitle="Gerencie o regime ativo, acompanhe o runtime consumido pela AI e confira se pesos, drift e sincronização continuam coerentes com o mercado."
        extra={<button type="button" style={secondaryButtonStyle} onClick={loadEverything}>Atualizar</button>}
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
            <div>Última ação da AI: <strong>{currentRuntime?.lastDecisionAction || '—'}</strong></div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Rodar treinamento assistido</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              <label><div style={{ marginBottom: 6 }}>Label</div><input value={form.label} onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))} style={{ width: '100%' }} /></label>
              <label><div style={{ marginBottom: 6 }}>Objetivo</div><input value={form.objective} onChange={(e) => setForm((c) => ({ ...c, objective: e.target.value }))} style={{ width: '100%' }} /></label>
              <label><div style={{ marginBottom: 6 }}>Janela de avaliação (dias)</div><input type="number" value={form.windowDays} onChange={(e) => setForm((c) => ({ ...c, windowDays: e.target.value }))} style={{ width: '100%' }} /></label>
              <label><div style={{ marginBottom: 6 }}>Escopo de símbolos (opcional)</div><input value={form.symbolScope} onChange={(e) => setForm((c) => ({ ...c, symbolScope: e.target.value }))} placeholder="BTCUSDT,ETHUSDT" style={{ width: '100%' }} /></label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.applySuggestedWeights} onChange={(e) => setForm((c) => ({ ...c, applySuggestedWeights: e.target.checked }))} />Aplicar pesos sugeridos automaticamente</label>
              <button type="button" style={primaryButtonStyle} onClick={handleRunTraining}>{trainingLoading ? 'Executando...' : 'Rodar treinamento assistido'}</button>
            </div>
          </div>

          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Configurações de adaptação</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              <label><div style={{ marginBottom: 6 }}>Mínimo de qualidade para aplicar</div><input type="number" step="0.01" value={settingsForm.minQualityScoreForApply} onChange={(e) => setSettingsForm((c) => ({ ...c, minQualityScoreForApply: e.target.value }))} style={{ width: '100%' }} /></label>
              <label><div style={{ marginBottom: 6 }}>Modo de auto apply</div><input value={settingsForm.autoApplyMode || ''} onChange={(e) => setSettingsForm((c) => ({ ...c, autoApplyMode: e.target.value }))} style={{ width: '100%' }} /></label>
              <label><div style={{ marginBottom: 6 }}>Máxima mudança por run</div><input type="number" step="0.01" value={settingsForm.maxWeightShiftPerRun} onChange={(e) => setSettingsForm((c) => ({ ...c, maxWeightShiftPerRun: e.target.value }))} style={{ width: '100%' }} /></label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(settingsForm.allowApplyWithWarning)} onChange={(e) => setSettingsForm((c) => ({ ...c, allowApplyWithWarning: e.target.checked }))} />Permitir aplicação com warning</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(settingsForm.adaptiveExpertsEnabled)} onChange={(e) => setSettingsForm((c) => ({ ...c, adaptiveExpertsEnabled: e.target.checked }))} />Reforçar experts automaticamente</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(settingsForm.adaptiveRegimePresetsEnabled)} onChange={(e) => setSettingsForm((c) => ({ ...c, adaptiveRegimePresetsEnabled: e.target.checked }))} />Atualizar presets por regime</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={secondaryButtonStyle} onClick={handleSaveSettings}>{savingSettings ? 'Salvando...' : 'Salvar guardrails'}</button>
                <button type="button" style={secondaryButtonStyle} onClick={handleSyncRuntime}>{presetAction === 'runtime:sync' ? 'Sincronizando...' : 'Sincronizar runtime'}</button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Runtime e pesos efetivos"
        subtitle="Veja o que está rodando agora na AI, compare com a configuração persistida e identifique rapidamente qualquer desvio de sincronização."
      >
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Estado do runtime</SectionTitle>
            <div>Status: {translateStatus(currentRuntime?.runtimeStatus)}</div>
            <div>Saúde da sincronização: {translateStatus(currentRuntime?.syncHealth)}</div>
            <div>Última sincronização: {formatDateTime(currentRuntime?.lastRuntimeSyncAt)}</div>
            <div>Último reporte do worker: {formatDateTime(currentRuntime?.workerReportedAt)}</div>
            <div>Defasagem do worker: {currentRuntime?.workerLagSeconds != null ? `${formatNumber(currentRuntime?.workerLagSeconds, 0)}s` : '—'}</div>
            <div>Worker: {currentRuntime?.workerName || '—'}</div>
            <div>Versão ativa da config: {runtimePayload?.configVersion || '—'}</div>
            <div>Config usada no sync: {currentRuntime?.configVersionAtSync || '—'}</div>
            <div>Versão vista pelo worker: {currentRuntime?.workerConfigVersionSeen || '—'}</div>
            <div>Runtime persistido em: {formatDateTime(runtimePayload?.runtimeUpdatedAt || currentRuntime?.runtimeUpdatedAt)}</div>
            <div>Expert dominante: {currentRuntime?.dominantExpertKey || '—'}{currentRuntime?.dominantExpertScore != null ? ` • score ${formatNumber(currentRuntime?.dominantExpertScore, 4)}` : ''}</div>
            <div style={{ color: '#9ca3af', marginTop: 8 }}>{currentRuntime?.notes || 'Sem observações recentes.'}</div>
            {(currentRuntime?.syncIssues || []).length ? <div style={{ color: '#fbbf24', marginTop: 8 }}>Pendências: {(currentRuntime.syncIssues || []).join(' • ')}</div> : null}
          </div>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Pesos efetivos em runtime</SectionTitle>
            <WeightList weights={currentRuntime?.effectiveExpertWeights} />
          </div>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Diferença vs. configuração</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              {runtimeDiff.length ? runtimeDiff.map((item) => (
                <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 14 }}>
                  <div style={{ textTransform: 'uppercase', color: '#9ca3af' }}>{item.key}</div>
                  <div>runtime: {formatNumber(item.runtime, 4)}</div>
                  <div>config: {formatNumber(item.config, 4)}</div>
                  <div style={{ color: item.delta === 0 ? '#9ca3af' : item.delta > 0 ? '#34d399' : '#f59e0b' }}>Δ {formatNumber(item.delta, 4)}</div>
                </div>
              )) : <div style={{ color: '#9ca3af' }}>Sem dados de comparação.</div>}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Presets adaptativos por regime"
        subtitle="Salve presets para consolidar ajustes por regime e ative o runtime quando quiser colocar imediatamente a AI para operar com aquele contexto."
      >
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

      <Card
        title="Qualidade, drift e experts"
        subtitle="Acompanhe se o modelo continua saudável, quais experts estão contribuindo melhor e quando o regime atual começa a perder coerência."
      >
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Últimos relatórios de qualidade</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>{qualityReports.slice(0, 5).map((item, index) => <div key={item.id || index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}><div><strong>{formatNumber(item.qualityScore, 4)}</strong> • {translateStatus(item.qualityStatus)}</div><div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)}</div></div>)}</div>
          </div>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Últimos relatórios de drift</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>{driftReports.slice(0, 5).map((item, index) => <div key={item.id || index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}><div><strong>{formatNumber(item.driftScore, 4)}</strong> • {translateStatus(item.driftStatus)}</div><div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)}</div></div>)}</div>
          </div>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Experts mais fortes</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>{expertReports.slice(0, 7).map((item, index) => <div key={item.id || item.expertKey || index} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}><div><strong>{item.expertKey || item.name || 'expert'}</strong></div><div style={{ color: '#9ca3af', fontSize: 13 }}>hit rate: {formatNumber(item.hitRate, 4)} • contribuição: {formatNumber(item.contributionScore, 4)} • peso sugerido: {formatNumber(item.suggestedWeight, 4)}</div></div>)}</div>
          </div>
        </div>
      </Card>

      <Card title="Execuções recentes e logs" subtitle="Use esta área para entender o que foi treinado, quando rodou, qual status retornou e quais mensagens o pipeline gerou.">
        <div style={sectionGridStyle}>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Execuções recentes</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>{runs.slice(0, 8).map((item) => <div key={item.id} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8 }}><div><strong>{item.label || `Execução #${item.id}`}</strong></div><div style={{ color: '#9ca3af', fontSize: 13 }}>{formatDateTime(item.createdAt)} • status: {translateStatus(item.status)}</div></div>)}</div>
          </div>
          <div style={{ ...shellCardStyle, padding: 14 }}>
            <SectionTitle>Logs do treinamento</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>{logs.slice(0, 40).map((item, index) => <TrainingLogRow key={item.id || index} item={item} />)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
