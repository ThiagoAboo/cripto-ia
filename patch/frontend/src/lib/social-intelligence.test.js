import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSocialQuery,
  getSocialWatchlist,
} from './social-intelligence.js';

test('buildSocialQuery omits empty params and keeps useful ones', () => {
  const query = buildSocialQuery({ classification: 'FORTE', minScore: 70, empty: '', nil: null });
  assert.equal(query, '?classification=FORTE&minScore=70');
});

test('getSocialWatchlist uses baseUrl override and encoded querystring', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return { ok: true };
      },
    };
  };

  const response = await getSocialWatchlist(
    { classification: 'PROMISSORA', confidenceBand: 'media' },
    { baseUrl: 'http://localhost:3001/' },
  );

  assert.deepEqual(response, { ok: true });
  assert.equal(
    calls[0],
    'http://localhost:3001/api/social/watchlist?classification=PROMISSORA&confidenceBand=media',
  );
});
