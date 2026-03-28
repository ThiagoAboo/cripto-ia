import React, { useEffect, useMemo, useState } from 'react';
import Section from '../components/Section';
import ConfigField from '../components/ConfigField';
import Pill from '../components/Pill';
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

function getStatusTone(value) {
  const normalized = String(value || '').toLowerCase();
  if (['healthy', 'ok', 'success', 'completed', 'ready'].includes(normalized)) return 'buy';
  if (['warning', 'completed_with_warning', 'moderate', 'attention'].includes(normalized)) return 'warning';
  if (['failed', 'error', 'high', 'out_of_sync'].includes(normalized)) return 'high';
  return 'info';
}

function TrainingNotice({ type = 'info', title, children }) {
  return (
    <div className={`training-notice training-notice--${type}`}>
      {title ? <strong>{title}</strong> : null}
      <div className={title ? 'top-gap' : undefined}>{children}</div>
    </div>
  );
}

function TrainingPanel({ title, subtitle, actions, children, scroll = false }) {
  return (
    <div className="training-panel">
      <div className="training-panel__header">
        <div>
          <h3 className="training-panel__title">{title}</h3>
          {subtitle ? <p className="training-panel__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </div>
      <div className={scroll ? 'training-list training-scroll' : 'training-list'}>{children}</div>
    </div>
  );
}

function WeightList({ weights }) {
  const entries = Object.entries(weights || {});
  if (!entries.length) {
    return <div className="training-empty">Sem pesos disponíveis.</div>;
  }

  return (
    <div className="training-list">
      {entries.map(([key, value]) => (
        <div key={key} className="training-kv">
          <span>{String(key).toUpperCase()}</span>
          <strong>{formatNumber(value, 4)}</strong>
        </div>
      ))}
    </div>
  );
}

function PresetCard({ item, onApply, onActivateRuntime, applying, activating }) {
  return (
    <div className="training-panel">
      <div className="training-panel__header">
        <div>
          <h3 className="training-panel__title">{String(item.title || item.regimeKey || '').replace(/_/g, ' ')}</h3>
          <p className="training-panel__subtitle">{item.description || 'Sem descrição.'}</p>
        </div>
        <Pill tone={item.isApplied ? 'buy' : 'neutral'}>{item.isApplied ? 'Preset salvo' : 'Disponível'}</Pill>
      </div>
      <div className="metric-grid">
        <div className="list-item list-item--column">
          <strong>Qualidade</strong>
          <span>{formatNumber(item.qualityScore, 4)}</span>
        </div>
        <div className="list-item list-item--column">
          <strong>Drift</strong>
          <span>{formatNumber(item.driftScore, 4)}</span>
        </div>
        <div className="list-item list-item--column">
          <strong>Intensidade</strong>
          <span>{formatNumber(item.intensity, 4)}</span>
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="button button--ghost" onClick={() => onApply(item.regimeKey)}>
          {applying ? 'Aplicando...' : 'Salvar preset'}
        </button>
        <button type="button" className="button" onClick={() => onActivateRuntime(item.regimeKey)}>
          {activating ? 'Ativando...' : 'Ativar no runtime'}
        </button>
      </div>
    </div>
  );
}

function TrainingLogRow({ item }) {
  return (
    <div className="training-log-row">
      <div className="decision-card__row">
        <strong>{item.stepKey || 'etapa'}</strong>
        <Pill tone={getStatusTone(item.level || item.status || 'info')}>{translateStatus(item.level || item.status || 'info')}</Pill>
      </div>
      <div className="muted top-gap">{item.message || 'Sem mensagem'}</div>
      <div className="muted">{formatDateTime(item.createdAt)}</div>
      {item.payload ? (
        <pre className="training-log-payload">
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
    return (
      <div className="training-page">
        <Section title="Treinamento" subtitle="Carregando governança e runtime da AI...">
          <div className="training-empty">Aguarde enquanto os dados do módulo são carregados.</div>
        </Section>
      </div>
    );
  }

  const summaryNotice = summary?.message || summary?.notes || null;

  return (
    <div className="training-page">
      {error ? <TrainingNotice type="error" title="Falha">{error}</TrainingNotice> : null}
      {notice ? <TrainingNotice type={notice.type} title={notice.title}>{notice.message}</TrainingNotice> : null}
      {summaryNotice ? <TrainingNotice type="info" title="Resumo do módulo">{summaryNotice}</TrainingNotice> : null}

      <Section
        title="Treinamento assistido e runtime da AI"
        subtitle="Gerencie o regime ativo, acompanhe o runtime consumido pela AI e confira se pesos, drift e sincronização continuam coerentes com o mercado."
        actions={<button type="button" className="button button--ghost" onClick={loadEverything}>Atualizar</button>}
      >
        <div className="grid three-columns">
          <TrainingPanel title="Resumo rápido">
            <div className="training-kv"><span>Qualidade atual</span><strong>{formatNumber(latestQuality?.qualityScore, 4)}</strong></div>
            <div className="training-kv"><span>Status da qualidade</span><Pill tone={getStatusTone(latestQuality?.qualityStatus)}>{translateStatus(latestQuality?.qualityStatus)}</Pill></div>
            <div className="training-kv"><span>Drift atual</span><strong>{formatNumber(latestDrift?.driftScore, 4)}</strong></div>
            <div className="training-kv"><span>Status do drift</span><Pill tone={getStatusTone(latestDrift?.driftStatus)}>{translateStatus(latestDrift?.driftStatus)}</Pill></div>
            <div className="training-kv"><span>Regime ativo</span><strong>{currentRuntime?.currentRegime || '—'}</strong></div>
            <div className="training-kv"><span>Status do runtime</span><Pill tone={getStatusTone(currentRuntime?.runtimeStatus)}>{translateStatus(currentRuntime?.runtimeStatus)}</Pill></div>
            <div className="training-kv"><span>Última ação da AI</span><strong>{currentRuntime?.lastDecisionAction || '—'}</strong></div>
          </TrainingPanel>

          <TrainingPanel title="Rodar treinamento assistido" subtitle="Use esta execução manual para revisar o comportamento antes de aplicar ajustes em runtime.">
            <div className="grid two-columns">
              <ConfigField label="Label">
                <input value={form.label} onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))} />
              </ConfigField>
              <ConfigField label="Objetivo">
                <input value={form.objective} onChange={(e) => setForm((c) => ({ ...c, objective: e.target.value }))} />
              </ConfigField>
              <ConfigField label="Janela de avaliação (dias)">
                <input type="number" value={form.windowDays} onChange={(e) => setForm((c) => ({ ...c, windowDays: e.target.value }))} />
              </ConfigField>
              <ConfigField label="Escopo de símbolos" hint="Opcional. Ex.: BTCUSDT,ETHUSDT">
                <input value={form.symbolScope} onChange={(e) => setForm((c) => ({ ...c, symbolScope: e.target.value }))} placeholder="BTCUSDT,ETHUSDT" />
              </ConfigField>
            </div>
            <label className="training-check">
              <input
                type="checkbox"
                checked={form.applySuggestedWeights}
                onChange={(e) => setForm((c) => ({ ...c, applySuggestedWeights: e.target.checked }))}
              />
              <span>Aplicar pesos sugeridos automaticamente ao terminar o treinamento.</span>
            </label>
            <div className="button-row">
              <button type="button" className="button" onClick={handleRunTraining}>
                {trainingLoading ? 'Executando...' : 'Rodar treinamento assistido'}
              </button>
            </div>
          </TrainingPanel>

          <TrainingPanel title="Configurações de adaptação" subtitle="Defina guardrails de qualidade e o quanto o treinamento pode mexer no runtime.">
            <div className="grid two-columns">
              <ConfigField label="Mínimo de qualidade para aplicar">
                <input
                  type="number"
                  step="0.01"
                  value={settingsForm.minQualityScoreForApply}
                  onChange={(e) => setSettingsForm((c) => ({ ...c, minQualityScoreForApply: e.target.value }))}
                />
              </ConfigField>
              <ConfigField label="Modo de auto apply">
                <input value={settingsForm.autoApplyMode || ''} onChange={(e) => setSettingsForm((c) => ({ ...c, autoApplyMode: e.target.value }))} />
              </ConfigField>
              <ConfigField label="Máxima mudança por run">
                <input
                  type="number"
                  step="0.01"
                  value={settingsForm.maxWeightShiftPerRun}
                  onChange={(e) => setSettingsForm((c) => ({ ...c, maxWeightShiftPerRun: e.target.value }))}
                />
              </ConfigField>
            </div>
            <label className="training-check">
              <input
                type="checkbox"
                checked={Boolean(settingsForm.allowApplyWithWarning)}
                onChange={(e) => setSettingsForm((c) => ({ ...c, allowApplyWithWarning: e.target.checked }))}
              />
              <span>Permitir aplicação com warning.</span>
            </label>
            <label className="training-check">
              <input
                type="checkbox"
                checked={Boolean(settingsForm.adaptiveExpertsEnabled)}
                onChange={(e) => setSettingsForm((c) => ({ ...c, adaptiveExpertsEnabled: e.target.checked }))}
              />
              <span>Reforçar experts automaticamente.</span>
            </label>
            <label className="training-check">
              <input
                type="checkbox"
                checked={Boolean(settingsForm.adaptiveRegimePresetsEnabled)}
                onChange={(e) => setSettingsForm((c) => ({ ...c, adaptiveRegimePresetsEnabled: e.target.checked }))}
              />
              <span>Atualizar presets por regime.</span>
            </label>
            <div className="button-row">
              <button type="button" className="button button--ghost" onClick={handleSaveSettings}>
                {savingSettings ? 'Salvando...' : 'Salvar guardrails'}
              </button>
              <button type="button" className="button button--ghost" onClick={handleSyncRuntime}>
                {presetAction === 'runtime:sync' ? 'Sincronizando...' : 'Sincronizar runtime'}
              </button>
            </div>
          </TrainingPanel>
        </div>
      </Section>

      <Section
        title="Runtime e pesos efetivos"
        subtitle="Veja o que está rodando agora na AI, compare com a configuração persistida e identifique rapidamente qualquer desvio de sincronização."
      >
        <div className="grid three-columns">
          <TrainingPanel title="Estado do runtime">
            <div className="training-kv"><span>Status</span><Pill tone={getStatusTone(currentRuntime?.runtimeStatus)}>{translateStatus(currentRuntime?.runtimeStatus)}</Pill></div>
            <div className="training-kv"><span>Saúde da sincronização</span><Pill tone={getStatusTone(currentRuntime?.syncHealth)}>{translateStatus(currentRuntime?.syncHealth)}</Pill></div>
            <div className="training-kv"><span>Última sincronização</span><strong>{formatDateTime(currentRuntime?.lastRuntimeSyncAt)}</strong></div>
            <div className="training-kv"><span>Último reporte do worker</span><strong>{formatDateTime(currentRuntime?.workerReportedAt)}</strong></div>
            <div className="training-kv"><span>Defasagem do worker</span><strong>{currentRuntime?.workerLagSeconds != null ? `${formatNumber(currentRuntime?.workerLagSeconds, 0)}s` : '—'}</strong></div>
            <div className="training-kv"><span>Worker</span><strong>{currentRuntime?.workerName || '—'}</strong></div>
            <div className="training-kv"><span>Versão ativa da config</span><strong>{runtimePayload?.configVersion || '—'}</strong></div>
            <div className="training-kv"><span>Config usada no sync</span><strong>{currentRuntime?.configVersionAtSync || '—'}</strong></div>
            <div className="training-kv"><span>Versão vista pelo worker</span><strong>{currentRuntime?.workerConfigVersionSeen || '—'}</strong></div>
            <div className="training-note">{currentRuntime?.notes || 'Sem observações recentes.'}</div>
            {(currentRuntime?.syncIssues || []).length ? (
              <div className="training-warning">Pendências: {(currentRuntime.syncIssues || []).join(' • ')}</div>
            ) : null}
          </TrainingPanel>

          <TrainingPanel title="Pesos efetivos em runtime">
            <WeightList weights={currentRuntime?.effectiveExpertWeights} />
          </TrainingPanel>

          <TrainingPanel title="Diferença vs. configuração" scroll>
            {runtimeDiff.length ? (
              <div className="training-diff-grid">
                {runtimeDiff.map((item) => (
                  <div key={item.key} className="training-diff-row">
                    <div>{item.key}</div>
                    <div>runtime: {formatNumber(item.runtime, 4)}</div>
                    <div>config: {formatNumber(item.config, 4)}</div>
                    <div className={item.delta === 0 ? 'muted' : item.delta > 0 ? 'training-success' : 'training-danger'}>
                      Δ {formatNumber(item.delta, 4)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="training-empty">Sem dados de comparação.</div>
            )}
          </TrainingPanel>
        </div>
      </Section>

      <Section
        title="Presets adaptativos por regime"
        subtitle="Salve presets para consolidar ajustes por regime e ative o runtime quando quiser colocar imediatamente a AI para operar com aquele contexto."
      >
        {(presetsPayload?.presets || []).length ? (
          <div className="training-preset-grid">
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
        ) : (
          <div className="training-empty">Nenhum preset adaptativo disponível.</div>
        )}
      </Section>

      <Section
        title="Qualidade, drift e experts"
        subtitle="Acompanhe se o modelo continua saudável, quais experts estão contribuindo melhor e quando o regime atual começa a perder coerência."
      >
        <div className="grid three-columns">
          <TrainingPanel title="Últimos relatórios de qualidade" scroll>
            {qualityReports.slice(0, 8).length ? qualityReports.slice(0, 8).map((item, index) => (
              <div key={item.id || index} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>{formatNumber(item.qualityScore, 4)}</strong>
                  <Pill tone={getStatusTone(item.qualityStatus)}>{translateStatus(item.qualityStatus)}</Pill>
                </div>
                <div className="muted">{formatDateTime(item.createdAt)}</div>
              </div>
            )) : <div className="training-empty">Nenhum relatório de qualidade disponível.</div>}
          </TrainingPanel>

          <TrainingPanel title="Últimos relatórios de drift" scroll>
            {driftReports.slice(0, 8).length ? driftReports.slice(0, 8).map((item, index) => (
              <div key={item.id || index} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>{formatNumber(item.driftScore, 4)}</strong>
                  <Pill tone={getStatusTone(item.driftStatus)}>{translateStatus(item.driftStatus)}</Pill>
                </div>
                <div className="muted">{formatDateTime(item.createdAt)}</div>
              </div>
            )) : <div className="training-empty">Nenhum relatório de drift disponível.</div>}
          </TrainingPanel>

          <TrainingPanel title="Experts mais fortes" scroll>
            {expertReports.slice(0, 10).length ? expertReports.slice(0, 10).map((item, index) => (
              <div key={item.id || item.expertKey || index} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>{item.expertKey || item.name || 'expert'}</strong>
                  <Pill tone="info">peso {formatNumber(item.suggestedWeight, 4)}</Pill>
                </div>
                <div className="muted">hit rate: {formatNumber(item.hitRate, 4)} • contribuição: {formatNumber(item.contributionScore, 4)}</div>
              </div>
            )) : <div className="training-empty">Nenhum expert disponível.</div>}
          </TrainingPanel>
        </div>
      </Section>

      <Section title="Execuções recentes e logs" subtitle="Use esta área para entender o que foi treinado, quando rodou, qual status retornou e quais mensagens o pipeline gerou.">
        <div className="grid two-columns">
          <TrainingPanel title="Execuções recentes" scroll>
            {runs.slice(0, 10).length ? runs.slice(0, 10).map((item) => (
              <div key={item.id} className="list-item list-item--column">
                <div className="decision-card__row">
                  <strong>{item.label || `Execução #${item.id}`}</strong>
                  <Pill tone={getStatusTone(item.status)}>{translateStatus(item.status)}</Pill>
                </div>
                <div className="muted">{formatDateTime(item.createdAt)}</div>
              </div>
            )) : <div className="training-empty">Nenhuma execução recente.</div>}
          </TrainingPanel>

          <TrainingPanel title="Logs do treinamento" scroll>
            {logs.slice(0, 40).length ? logs.slice(0, 40).map((item, index) => (
              <TrainingLogRow key={item.id || index} item={item} />
            )) : <div className="training-empty">Nenhum log recente.</div>}
          </TrainingPanel>
        </div>
      </Section>
    </div>
  );
}
