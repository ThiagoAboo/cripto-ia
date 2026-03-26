const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_SOCIAL_POLICY,
  buildWatchlist,
  buildRiskRadar,
  buildNarrativeBoard,
  buildProviderHealth,
  filterRankedItems,
} = require('../src/services/socialIntelligence.service');

const sampleItems = [
  {
    symbol: 'SOL',
    classification: 'FORTE',
    socialScore: 86,
    socialRisk: 22,
    sentiment: 18,
    momentum: 20,
    spamRisk: 8,
    sourceCount: 5,
  },
  {
    symbol: 'PEPE',
    classification: 'PROMISSORA',
    socialScore: 72,
    socialRisk: 48,
    sentiment: 12,
    momentum: 17,
    spamRisk: 15,
    sourceCount: 4,
  },
  {
    symbol: 'RUG',
    classification: 'ALTO_RISCO',
    socialScore: 38,
    socialRisk: 91,
    sentiment: -30,
    momentum: -22,
    spamRisk: 88,
    sourceCount: 2,
  },
];

const sampleAlerts = [
  { symbol: 'RUG', severity: 'critical', alertType: 'pump', message: 'pico artificial' },
  { symbol: 'PEPE', severity: 'high', alertType: 'spam', message: 'spam crescente' },
];

const providerStatuses = [
  { providerKey: 'coingecko', status: 'ok', mode: 'free' },
  { providerKey: 'reddit', status: 'degraded', mode: 'free' },
];

test('buildWatchlist ranks stronger asset first and assigns ranks', () => {
  const board = buildWatchlist(sampleItems, sampleAlerts, providerStatuses, DEFAULT_SOCIAL_POLICY);

  assert.equal(board.items[0].symbol, 'SOL');
  assert.equal(board.items[0].watchlistRank, 1);
  assert.ok(board.items[0].opportunityScore > board.items[1].opportunityScore);
  assert.equal(board.items[2].narrativeState, 'high-risk');
});

test('filterRankedItems applies risk and confidence filters', () => {
  const board = buildWatchlist(sampleItems, sampleAlerts, providerStatuses, DEFAULT_SOCIAL_POLICY);
  const filtered = filterRankedItems(board.items, { maxRisk: 40, limit: 5 });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].symbol, 'SOL');
});

test('buildRiskRadar extracts high risk symbols with recommendation', () => {
  const radar = buildRiskRadar(sampleItems, sampleAlerts, providerStatuses, DEFAULT_SOCIAL_POLICY);

  assert.equal(radar.highRiskCount, 1);
  assert.equal(radar.items[0].symbol, 'RUG');
  assert.equal(radar.items[0].recommendation, 'bloquear');
});

test('buildNarrativeBoard groups emerging and high-risk assets', () => {
  const board = buildNarrativeBoard(sampleItems, sampleAlerts, providerStatuses, DEFAULT_SOCIAL_POLICY);

  assert.equal(board.groups.emerging[0].symbol, 'SOL');
  assert.equal(board.groups['high-risk'][0].symbol, 'RUG');
});

test('buildProviderHealth penalizes degraded providers', () => {
  const providerHealth = buildProviderHealth(providerStatuses);

  assert.equal(providerHealth.status, 'warning');
  assert.ok(providerHealth.score < 100);
  assert.equal(providerHealth.counts.total, 2);
});
