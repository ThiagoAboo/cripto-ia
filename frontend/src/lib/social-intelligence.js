function resolveApiBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, '');
  try {
    const envBaseUrl = import.meta?.env?.VITE_API_BASE_URL;
    if (envBaseUrl) return String(envBaseUrl).replace(/\/$/, '');
  } catch (_error) {
    // ignored on non-Vite environments
  }
  return 'http://localhost:3001';
}

export function buildSocialQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function fetchSocialJson(path, options = {}) {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`social_request_failed:${response.status}`);
  }
  return response.json();
}

export function getSocialPolicyDefaults(options = {}) {
  return fetchSocialJson('/api/social/policy/defaults', options);
}

export function getSocialWatchlist(params = {}, options = {}) {
  return fetchSocialJson(`/api/social/watchlist${buildSocialQuery(params)}`, options);
}

export function getSocialNarratives(options = {}) {
  return fetchSocialJson('/api/social/narratives', options);
}

export function getSocialRiskRadar(options = {}) {
  return fetchSocialJson('/api/social/risk-radar', options);
}

export function getSocialPipelineHealth(options = {}) {
  return fetchSocialJson('/api/social/pipeline-health', options);
}
