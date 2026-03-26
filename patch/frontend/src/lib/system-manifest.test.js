import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSystemManifest,
  summarizeManifest,
  getFrontendMaintenanceTarget,
} from './system-manifest.js';

test('summarizeManifest derives compact dashboard data', () => {
  const summary = summarizeManifest({
    data: {
      stage: 33,
      version: '33.0.0',
      contractsVersion: '2026-03',
      modules: {
        backend: ['a', 'b'],
        frontend: ['c'],
      },
    },
  });

  assert.equal(summary.stage, 33);
  assert.equal(summary.contractCheck.compatible, true);
  assert.equal(summary.modulesCount, 3);
});

test('fetchSystemManifest uses injected fetch', async () => {
  const payload = await fetchSystemManifest(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: { stage: 33 } }),
  }));

  assert.equal(payload.ok, true);
  assert.equal(payload.data.stage, 33);
  assert.equal(getFrontendMaintenanceTarget().shellBudgetLines, 80);
});
