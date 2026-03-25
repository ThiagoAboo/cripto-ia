const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;

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
