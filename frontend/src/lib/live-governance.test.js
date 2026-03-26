import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLiveGovernanceQuery,
  getLiveChecklist,
  createLiveRequest,
  activateLiveRequest,
} from './live-governance.js';

test('buildLiveGovernanceQuery ignora vazios', () => {
  const query = buildLiveGovernanceQuery({ targetMode: 'live', status: '', limit: 10 });
  assert.equal(query, '?targetMode=live&limit=10');
});

test('helpers chamam endpoints esperados', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  await getLiveChecklist({ targetMode: 'testnet' }, { baseUrl: 'http://localhost:3001' });
  await createLiveRequest({ targetMode: 'live' }, { baseUrl: 'http://localhost:3001' });
  await activateLiveRequest(7, { confirmationPhrase: 'CONFIRMAR_LIVE' }, { baseUrl: 'http://localhost:3001' });

  assert.equal(calls[0].url, 'http://localhost:3001/api/control/live/checklist?targetMode=testnet');
  assert.equal(calls[1].url, 'http://localhost:3001/api/control/live/requests');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].url, 'http://localhost:3001/api/control/live/requests/7/activate');
});
