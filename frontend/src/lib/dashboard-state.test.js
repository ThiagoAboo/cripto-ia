import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryCards, createInitialAuxData, resolveDashboardData } from './dashboard-state.js';

const baseStatus = {
  recentOrders: [],
  recentDecisions: [],
  social: { topScores: [], recentAlerts: [], strongCount: 2, highRiskCount: 1, providers: ['coingecko'], assetsCount: 12 },
  control: { updatedAt: '2026-03-26T12:00:00Z', activeCooldowns: [{ symbol: 'BTCUSDT' }], guardrails: { consecutiveLosses: 2 } },
  execution: { mode: 'paper' },
  notifications: { enabled: true, channels: ['telegram'] },
  policy: { recentReports: [{ id: 1 }] },
  observability: { exportKinds: ['json'] },
  portfolio: { accountKey: 'paper-main', baseCurrency: 'USDT', equity: 12000, cashBalance: 5400, realizedPnl: 320, feesPaid: 18 },
  training: {
    summary: { qualitySummary: { qualityStatus: 'healthy' } },
    recentRuns: [{ id: 7 }],
    recentQualityReports: [{ id: 8 }],
    recentDriftReports: [{ id: 9 }],
    recentExpertEvaluations: [{ id: 10 }],
  },
};

test('resolveDashboardData prioriza dados de status em vez de auxData quando disponíveis', () => {
  const auxData = createInitialAuxData();
  auxData.orders = [{ id: 'fallback-order' }];
  const resolved = resolveDashboardData({ ...baseStatus, recentOrders: [{ id: 'status-order' }] }, auxData);

  assert.equal(resolved.currentOrders[0].id, 'status-order');
  assert.equal(resolved.baseCurrency, 'USDT');
  assert.equal(resolved.providerStatuses[0], 'coingecko');
});

test('resolveDashboardData usa auxData como fallback', () => {
  const auxData = createInitialAuxData();
  auxData.portfolio = { baseCurrency: 'BRL', equity: 9000 };
  auxData.socialSummary = { providers: ['cache'], strongCount: 1, highRiskCount: 0 };

  const resolved = resolveDashboardData({ recentOrders: [], recentDecisions: [], social: {}, training: {} }, auxData);

  assert.equal(resolved.baseCurrency, 'BRL');
  assert.equal(resolved.socialSummary.providers[0], 'cache');
});

test('buildSummaryCards gera os cards esperados', () => {
  const cards = buildSummaryCards({
    health: { ok: true, timestamp: '2026-03-26T10:00:00Z' },
    currentPortfolio: baseStatus.portfolio,
    controlState: baseStatus.control,
    socialSummary: baseStatus.social,
  });

  assert.equal(cards.length, 6);
  assert.equal(cards[0].label, 'Backend');
  assert.match(cards[0].value, /Online/);
  assert.equal(cards[3].value, 'ATIVO');
  assert.match(cards[5].value, /2/);
});
