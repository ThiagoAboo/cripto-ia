import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;

test('api governance helpers chamam endpoints corretos', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true, url }),
    };
  };

  try {
    const api = await import('./api.js');
    await api.fetchGovernanceOverview();
    await api.fetchGovernanceHistory(15, 'blocked');
    await api.runGovernanceAssessment({ requestedBy: 'dashboard' });
    await api.fetchAlertsSummary('open');

    assert.equal(calls[0].url, 'http://localhost:4000/api/observability/governance');
    assert.equal(calls[1].url, 'http://localhost:4000/api/observability/governance/history?limit=15&status=blocked');
    assert.equal(calls[2].url, 'http://localhost:4000/api/observability/governance/run');
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(calls[3].url, 'http://localhost:4000/api/alerts/summary?status=open');
  } finally {
    global.fetch = originalFetch;
  }
});
