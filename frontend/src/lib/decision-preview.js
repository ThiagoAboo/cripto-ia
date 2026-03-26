const API_BASE_URL = import.meta?.env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `request_failed:${response.status}`);
  }

  return response.json();
}

export async function fetchDecisionPolicyDefaults() {
  return request('/decisions/policy/defaults');
}

export async function previewDecisionPolicy(payload) {
  return request('/decisions/preview', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}
