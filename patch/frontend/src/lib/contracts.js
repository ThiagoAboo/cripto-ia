export const PUBLIC_API_CONTRACT_VERSION = '2026-03';

export const PUBLIC_API_AREAS = Object.freeze({
  core: ['/api/health', '/api/config', '/api/status'],
  market: ['/api/market', '/api/portfolio', '/api/decisions'],
  training: [
    '/api/training/summary',
    '/api/training/runtime',
    '/api/training/regime-presets',
    '/api/training/expert-reports',
  ],
  ops: ['/api/alerts', '/api/readiness', '/api/observability', '/api/incidents', '/api/control'],
  system: ['/api/system/manifest', '/api/system/maintenance-checklist', '/api/system/contracts/public-api'],
});

export function getExpectedContractVersion() {
  return PUBLIC_API_CONTRACT_VERSION;
}

export function getAllContractEndpoints() {
  return Object.values(PUBLIC_API_AREAS).flat();
}

export function validateContractVersion(receivedVersion) {
  return {
    expected: PUBLIC_API_CONTRACT_VERSION,
    received: receivedVersion ?? null,
    compatible: receivedVersion === PUBLIC_API_CONTRACT_VERSION,
  };
}
