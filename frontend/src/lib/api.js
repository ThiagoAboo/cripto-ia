const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.message || payload.error || message;
    } catch (_error) {
      // ignore json parse error
    }
    throw new Error(message);
  }

  return response.json();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function fetchHealth() {
  return request('/api/health');
}

export function fetchConfig() {
  return request('/api/config');
}

export function fetchConfigHistory(limit = 10) {
  return request(`/api/config/history?limit=${limit}`);
}

export function fetchConfigAudit(limit = 20) {
  return request(`/api/config/audit?limit=${limit}`);
}

export function updateConfig(config) {
  return request('/api/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export function fetchStatus() {
  return request('/api/status');
}

export function fetchPortfolio() {
  return request('/api/portfolio');
}

export function fetchOrders(limit = 30) {
  return request(`/api/portfolio/orders?limit=${limit}`);
}

export function fetchDecisions(limit = 30) {
  return request(`/api/decisions?limit=${limit}`);
}

export function fetchSocialSummary() {
  return request('/api/social/summary');
}

export function fetchSocialScores(limit = 20) {
  return request(`/api/social/scores?limit=${limit}`);
}

export function fetchSocialAlerts(limit = 20) {
  return request(`/api/social/alerts?limit=${limit}`);
}

export function fetchControl() {
  return request('/api/control');
}

export function pauseControl(reason = 'manual_pause') {
  return request('/api/control/pause', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function resumeControl(clearEmergencyStop = true) {
  return request('/api/control/resume', {
    method: 'POST',
    body: JSON.stringify({ clearEmergencyStop }),
  });
}

export function triggerEmergencyStop(reason = 'manual_emergency_stop') {
  return request('/api/control/emergency-stop', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function fetchCooldowns(activeOnly = true, limit = 100) {
  return request(`/api/control/cooldowns?activeOnly=${activeOnly ? 'true' : 'false'}&limit=${limit}`);
}

export function clearCooldown(symbol) {
  return request(`/api/control/cooldowns/${symbol}`, {
    method: 'DELETE',
  });
}

export function fetchBacktests(limit = 12) {
  return request(`/api/backtests?limit=${limit}`);
}

export function fetchBacktestById(id) {
  return request(`/api/backtests/${id}`);
}

export function runBacktest(payload) {
  return request('/api/backtests/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function compareBacktests(payload) {
  return request('/api/backtests/compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchOptimizations(limit = 10) {
  return request(`/api/optimizer?limit=${limit}`);
}

export function fetchOptimizationById(id) {
  return request(`/api/optimizer/${id}`);
}

export function runOptimization(payload) {
  return request('/api/optimizer/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchPromotions(limit = 10) {
  return request(`/api/promotions?limit=${limit}`);
}

export function fetchPromotionRequests(limit = 10, status = '') {
  const suffix = status ? `&status=${encodeURIComponent(status)}` : '';
  return request(`/api/promotions/requests?limit=${limit}${suffix}`);
}

export function simulatePromotionWinner(optimizationRunId, payload) {
  return request(`/api/promotions/simulate/from-optimizer/${optimizationRunId}`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function requestPromotionApproval(optimizationRunId, payload) {
  return request(`/api/promotions/requests/from-optimizer/${optimizationRunId}`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function approvePromotionRequest(requestId, payload) {
  return request(`/api/promotions/requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function rejectPromotionRequest(requestId, payload) {
  return request(`/api/promotions/requests/${requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function rollbackConfigVersion(version, payload) {
  return request(`/api/promotions/rollback/${version}`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function promoteOptimizationWinner(optimizationRunId, payload) {
  return request(`/api/promotions/from-optimizer/${optimizationRunId}`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function fetchExecutionHealthchecks(limit = 10) {
  return request(`/api/execution/healthchecks?limit=${limit}`);
}

export function runExecutionHealthcheck(payload = {}) {
  return request('/api/execution/healthcheck', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchExecutionReconciliations(limit = 10) {
  return request(`/api/execution/reconciliations?limit=${limit}`);
}

export function runExecutionReconciliation(payload = {}) {
  return request('/api/execution/reconcile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchExecutionActionLogs(limit = 20) {
  return request(`/api/execution/action-logs?limit=${limit}`);
}

export function previewExecutionOrder(payload = {}) {
  return request('/api/execution/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitLiveOrder(payload = {}) {
  return request('/api/execution/live-submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runReadinessCheck(payload = {}) {
  return request('/api/readiness/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runScheduledJob(jobKey, payload = {}) {
  return request(`/api/jobs/run/${encodeURIComponent(jobKey)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function acknowledgeAlert(alertKey, payload = {}) {
  return request(`/api/alerts/${encodeURIComponent(alertKey)}/ack`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resolveAlert(alertKey, payload = {}) {
  return request(`/api/alerts/${encodeURIComponent(alertKey)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setMaintenanceMode(payload = {}) {
  return request('/api/control/maintenance/on', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function clearMaintenanceMode(payload = {}) {
  return request('/api/control/maintenance/off', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchNotificationChannels() {
  return request('/api/notifications/channels');
}

export function fetchNotificationDeliveries(limit = 20) {
  return request(`/api/notifications/deliveries?limit=${limit}`);
}

export function sendTestNotification(payload = {}) {
  return request('/api/notifications/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchPolicyReports(limit = 20) {
  return request(`/api/policy/reports?limit=${limit}`);
}

export function evaluatePromotionPolicy(payload = {}) {
  return request('/api/policy/evaluate-promotion', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runObservabilitySnapshot(payload = {}) {
  return request('/api/observability/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function buildObservabilityExportUrl(kind, format = 'json', limit = 500) {
  const params = new URLSearchParams({ kind, format, limit: String(limit) });
  return `${API_BASE_URL}/api/observability/export?${params.toString()}`;
}

export function fetchRunbooks(limit = 20) {
  return request(`/api/runbooks?limit=${limit}`);
}

export function fetchRunbookByKey(runbookKey) {
  return request(`/api/runbooks/${encodeURIComponent(runbookKey)}`);
}

export function fetchIncidentDrills(limit = 20) {
  return request(`/api/incidents/drills?limit=${limit}`);
}

export function runIncidentDrill(payload = {}) {
  return request('/api/incidents/drills/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchRecoveryActions(limit = 20) {
  return request(`/api/incidents/recovery-actions?limit=${limit}`);
}

export function runRecoveryAction(payload = {}) {
  return request('/api/incidents/recovery-actions/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchTrainingSummary() {
  return request('/api/training/summary');
}

export function fetchTrainingSettings() {
  return request('/api/training/settings');
}

export function updateTrainingSettings(payload = {}) {
  return request('/api/training/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchTrainingRegimePresets(limit = 20) {
  return request(`/api/training/regime-presets?limit=${limit}`);
}

export function applyTrainingRegimePreset(payload = {}) {
  return request('/api/training/regime-presets/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchTrainingRuns(limit = 10) {
  return request(`/api/training/runs?limit=${limit}`);
}

export function fetchTrainingLogs(limit = 80, trainingRunId = '') {
  const suffix = trainingRunId ? `&trainingRunId=${encodeURIComponent(trainingRunId)}` : '';
  return request(`/api/training/logs?limit=${limit}${suffix}`);
}

export function fetchTrainingRunLogs(trainingRunId, limit = 80) {
  return request(`/api/training/runs/${encodeURIComponent(trainingRunId)}/logs?limit=${limit}`);
}

export function fetchTrainingQualityReports(limit = 10) {
  return request(`/api/training/quality-reports?limit=${limit}`);
}

export function fetchTrainingDriftReports(limit = 10) {
  return request(`/api/training/drift-reports?limit=${limit}`);
}

export function fetchTrainingExpertReports(limit = 10) {
  return request(`/api/training/expert-reports?limit=${limit}`);
}

export function runTrainingAssistance(payload = {}) {
  return request('/api/training/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
