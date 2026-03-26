import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_API_CONTRACT_VERSION,
  getAllContractEndpoints,
  validateContractVersion,
} from './contracts.js';

test('contract version validation works', () => {
  assert.equal(PUBLIC_API_CONTRACT_VERSION, '2026-03');
  assert.equal(validateContractVersion('2026-03').compatible, true);
  assert.equal(validateContractVersion('2026-02').compatible, false);
});

test('system endpoints are part of the contract', () => {
  const endpoints = getAllContractEndpoints();
  assert.ok(endpoints.includes('/api/system/manifest'));
  assert.ok(endpoints.includes('/api/system/contracts/public-api'));
});
