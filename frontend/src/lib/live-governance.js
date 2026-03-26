function resolveApiBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, '');
  try {
    const envBaseUrl = import.meta?.env?.VITE_API_BASE_URL;
    if (envBaseUrl) return String(envBaseUrl).replace(/\/$/, '');
  } catch (_error) {
    // ignored outside Vite
  }
  return 'http://localhost:3001';
}

export function buildLiveGovernanceQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function requestJson(path, { method = 'GET', body, baseUrl } = {}) {
  const response = await fetch(`${resolveApiBaseUrl(baseUrl)}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`live_governance_request_failed:${response.status}`);
  }
  return response.json();
}

export function getLiveGovernanceDefaults(options = {}) {
  return requestJson('/api/control/live/policy/defaults', options);
}

export function getLiveChecklist(params = {}, options = {}) {
  return requestJson(`/api/control/live/checklist${buildLiveGovernanceQuery(params)}`, options);
}

export function listLiveRequests(params = {}, options = {}) {
  return requestJson(`/api/control/live/requests${buildLiveGovernanceQuery(params)}`, options);
}

export function createLiveRequest(payload = {}, options = {}) {
  return requestJson('/api/control/live/requests', { ...options, method: 'POST', body: payload });
}

export function revalidateLiveRequest(id, payload = {}, options = {}) {
  return requestJson(`/api/control/live/requests/${id}/revalidate`, { ...options, method: 'POST', body: payload });
}

export function approveLiveRequest(id, payload = {}, options = {}) {
  return requestJson(`/api/control/live/requests/${id}/approve`, { ...options, method: 'POST', body: payload });
}

export function activateLiveRequest(id, payload = {}, options = {}) {
  return requestJson(`/api/control/live/requests/${id}/activate`, { ...options, method: 'POST', body: payload });
}

export function rollbackLiveMode(payload = {}, options = {}) {
  return requestJson('/api/control/live/rollback', { ...options, method: 'POST', body: payload });
}

export function listLiveEvents(params = {}, options = {}) {
  return requestJson(`/api/control/live/events${buildLiveGovernanceQuery(params)}`, options);
}

export function listLiveSupervision(params = {}, options = {}) {
  return requestJson(`/api/control/live/supervision${buildLiveGovernanceQuery(params)}`, options);
}

export function runLiveSupervision(payload = {}, options = {}) {
  return requestJson('/api/control/live/supervision/run', { ...options, method: 'POST', body: payload });
}
