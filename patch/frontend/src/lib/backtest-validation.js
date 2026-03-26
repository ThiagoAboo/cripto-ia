function apiBase() {
  return import.meta?.env?.VITE_API_BASE_URL || 'http://localhost:3001/api';
}

async function handleJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || `request_failed:${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getValidationDefaults(fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase()}/backtests/validation/defaults`);
  return handleJson(response);
}

export async function listValidationRuns({ limit = 20 } = {}, fetchImpl = fetch) {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetchImpl(`${apiBase()}/backtests/validation-runs?${params.toString()}`);
  return handleJson(response);
}

export async function getValidationRun(id, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase()}/backtests/validation-runs/${id}`);
  return handleJson(response);
}

export async function runWalkForwardValidation(payload, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase()}/backtests/walk-forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return handleJson(response);
}

export async function runRobustnessSweep(payload, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase()}/backtests/robustness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return handleJson(response);
}

export function summarizeValidationBadge(summary = {}) {
  const stabilityScore = Number(summary.stabilityScore || 0);
  if (stabilityScore >= 72) return { tone: 'success', label: 'Robusto' };
  if (stabilityScore >= 58) return { tone: 'warning', label: 'Revisar' };
  return { tone: 'danger', label: 'Frágil' };
}
