import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDecisionPolicy } from './decision-preview.js';

test('previewDecisionPolicy posts payload to decisions preview route', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { effectiveAction: 'BUY' };
      },
    };
  };

  try {
    const result = await previewDecisionPolicy({ action: 'BUY', confidence: 0.7 });
    assert.equal(result.effectiveAction, 'BUY');
    assert.match(calls[0].url, /\/decisions\/preview$/);
    assert.equal(calls[0].options.method, 'POST');
  } finally {
    global.fetch = originalFetch;
  }
});
