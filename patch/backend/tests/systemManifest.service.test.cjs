const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySize,
  buildRefactorTargets,
  evaluateMaintenanceChecklist,
  buildSystemManifest,
  loadPublicApiContract,
} = require('../src/services/systemManifest.service');

test('classifySize respects thresholds', () => {
  assert.equal(classifySize(80), 'healthy');
  assert.equal(classifySize(400), 'degraded');
  assert.equal(classifySize(900), 'blocked');
});

test('buildRefactorTargets highlights python monoliths first', () => {
  const targets = buildRefactorTargets();
  const ai = targets.find((item) => item.target === 'ai/main.py');
  const social = targets.find((item) => item.target === 'social-worker/main.py');

  assert.equal(ai.status, 'blocked');
  assert.equal(social.status, 'blocked');
  assert.match(ai.recommendation, /extrair runtime state/i);
});

test('evaluateMaintenanceChecklist returns degraded when route missing', () => {
  const result = evaluateMaintenanceChecklist({
    hasSystemManifestRoute: false,
    frontendAppLines: 53,
    aiMainLines: 1032,
    socialMainLines: 536,
  });

  assert.equal(result.overallStatus, 'blocked');
  assert.ok(result.blocked >= 2);
  assert.ok(result.degraded >= 1);
});

test('buildSystemManifest includes contract version and modules', () => {
  const manifest = buildSystemManifest({
    version: '33.1.0',
    generatedAt: '2026-03-26T00:00:00.000Z',
  });

  assert.equal(manifest.stage, 33);
  assert.equal(manifest.version, '33.1.0');
  assert.ok(manifest.modules.backend.includes('system.routes'));
  assert.equal(typeof manifest.contractsVersion, 'string');
});

test('loadPublicApiContract exposes system endpoints', () => {
  const contract = loadPublicApiContract();
  assert.ok(contract.areas.system.includes('/api/system/manifest'));
});
