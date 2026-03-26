const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'public-api.contract.json');

function loadPublicApiContract() {
  const raw = fs.readFileSync(CONTRACT_PATH, 'utf8');
  return JSON.parse(raw);
}

function classifySize(lines, thresholds = { ok: 250, warn: 500 }) {
  if (lines <= thresholds.ok) {
    return 'healthy';
  }
  if (lines <= thresholds.warn) {
    return 'degraded';
  }
  return 'blocked';
}

function buildRefactorTargets(metrics = {}) {
  const defaults = {
    frontendAppLines: 53,
    aiMainLines: 1032,
    socialMainLines: 536,
  };
  const effective = { ...defaults, ...metrics };

  return [
    {
      target: 'frontend/src/App.jsx',
      lines: effective.frontendAppLines,
      status: classifySize(effective.frontendAppLines),
      recommendation: effective.frontendAppLines <= 80
        ? 'manter como shell fino e evitar regressão de acoplamento'
        : 'continuar extraindo carregamento de dados e navegação para hooks e shells',
    },
    {
      target: 'ai/main.py',
      lines: effective.aiMainLines,
      status: classifySize(effective.aiMainLines),
      recommendation: 'extrair runtime state, clientes HTTP, features, experts e loop principal em módulos dedicados',
    },
    {
      target: 'social-worker/main.py',
      lines: effective.socialMainLines,
      status: classifySize(effective.socialMainLines),
      recommendation: 'extrair providers, scoring, runtime state e publicação para módulos dedicados',
    },
  ];
}

function evaluateMaintenanceChecklist(input = {}) {
  const {
    backendHasTests = true,
    frontendHasTests = true,
    hasSystemManifestRoute = false,
    hasPublicApiContract = true,
    hasMaintenanceAuditScript = true,
    frontendAppLines = 53,
    aiMainLines = 1032,
    socialMainLines = 536,
  } = input;

  const checks = [
    {
      key: 'backend_tests',
      status: backendHasTests ? 'healthy' : 'blocked',
      detail: backendHasTests ? 'backend já expõe script de teste' : 'backend sem script de teste',
    },
    {
      key: 'frontend_tests',
      status: frontendHasTests ? 'healthy' : 'blocked',
      detail: frontendHasTests ? 'frontend já expõe script de teste' : 'frontend sem script de teste',
    },
    {
      key: 'system_manifest_route',
      status: hasSystemManifestRoute ? 'healthy' : 'degraded',
      detail: hasSystemManifestRoute ? 'rota de manifesto registrada' : 'registrar /api/system em app.js',
    },
    {
      key: 'public_api_contract',
      status: hasPublicApiContract ? 'healthy' : 'blocked',
      detail: hasPublicApiContract ? 'contrato público versionado disponível' : 'faltando contrato público versionado',
    },
    {
      key: 'maintenance_audit',
      status: hasMaintenanceAuditScript ? 'healthy' : 'degraded',
      detail: hasMaintenanceAuditScript ? 'script de auditoria disponível' : 'faltando auditoria de manutenção',
    },
    {
      key: 'frontend_shell_size',
      status: classifySize(frontendAppLines),
      detail: `frontend/src/App.jsx com ${frontendAppLines} linhas`,
    },
    {
      key: 'ai_main_size',
      status: classifySize(aiMainLines),
      detail: `ai/main.py com ${aiMainLines} linhas`,
    },
    {
      key: 'social_main_size',
      status: classifySize(socialMainLines),
      detail: `social-worker/main.py com ${socialMainLines} linhas`,
    },
  ];

  const scoreMap = { healthy: 1, degraded: 0.5, blocked: 0 };
  const score = Number((checks.reduce((acc, item) => acc + scoreMap[item.status], 0) / checks.length).toFixed(3));
  const blocked = checks.filter((item) => item.status === 'blocked').length;
  const degraded = checks.filter((item) => item.status === 'degraded').length;
  const overallStatus = blocked > 0 ? 'blocked' : degraded > 0 ? 'degraded' : 'healthy';

  return {
    overallStatus,
    score,
    blocked,
    degraded,
    healthy: checks.filter((item) => item.status === 'healthy').length,
    checks,
  };
}

function buildSystemManifest(options = {}) {
  const contract = loadPublicApiContract();
  const {
    version = '33.0.0',
    generatedAt = new Date().toISOString(),
    metrics = {},
    checklist = {},
  } = options;

  return {
    service: 'cripto-ia-system',
    stage: 33,
    version,
    generatedAt,
    contractsVersion: contract.version,
    contractsAreas: Object.keys(contract.areas),
    modules: {
      backend: ['systemManifest.service', 'system.routes', 'public-api.contract'],
      frontend: ['contracts', 'system-manifest'],
      ai: ['runtime_state', 'service_manifest'],
      socialWorker: ['runtime_state', 'service_manifest'],
      scripts: ['maintenance-audit.sh', 'run-maintenance-tests.sh'],
    },
    refactorTargets: buildRefactorTargets(metrics),
    maintenanceChecklist: evaluateMaintenanceChecklist(checklist),
  };
}

module.exports = {
  loadPublicApiContract,
  classifySize,
  buildRefactorTargets,
  evaluateMaintenanceChecklist,
  buildSystemManifest,
};
