import { getExpectedContractVersion, validateContractVersion } from './contracts.js';

function resolveApiBaseUrl() {
  try {
    return (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://localhost:4000/api';
  } catch (error) {
    return 'http://localhost:4000/api';
  }
}

async function fetchJson(pathname, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponível no ambiente atual');
  }

  const response = await fetchImpl(`${resolveApiBaseUrl()}${pathname}`);
  if (!response.ok) {
    throw new Error(`falha ao carregar ${pathname}: ${response.status}`);
  }
  return response.json();
}

export async function fetchSystemManifest(fetchImpl) {
  return fetchJson('/system/manifest', fetchImpl);
}

export async function fetchMaintenanceChecklist(fetchImpl) {
  return fetchJson('/system/maintenance-checklist', fetchImpl);
}

export async function fetchPublicApiContract(fetchImpl) {
  return fetchJson('/system/contracts/public-api', fetchImpl);
}

export function summarizeManifest(manifestPayload) {
  const data = manifestPayload?.data ?? {};
  return {
    stage: data.stage ?? null,
    version: data.version ?? null,
    contractsVersion: data.contractsVersion ?? null,
    contractCheck: validateContractVersion(data.contractsVersion),
    modulesCount: Object.values(data.modules ?? {}).reduce((acc, items) => acc + items.length, 0),
  };
}

export function getFrontendMaintenanceTarget() {
  return {
    shellBudgetLines: 80,
    expectedContractVersion: getExpectedContractVersion(),
  };
}
