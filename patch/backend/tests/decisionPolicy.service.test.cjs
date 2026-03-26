const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const service = require(path.resolve(__dirname, '../src/services/decisionPolicy.service.js'));

test('hardenDecision blocks BUY when liquidity and slippage are weak', () => {
  const result = service.hardenDecision({
    action: 'BUY',
    confidence: 0.78,
    regime: 'mixed',
    market: {
      liquidityUsd: 40000,
      spreadPct: 0.12,
      estimatedSlippagePct: 0.61,
    },
    portfolio: {
      openRiskPct: 0.22,
      maxObservedCorrelation: 0.35,
    },
  });

  assert.equal(result.effectiveAction, 'HOLD');
  assert.equal(result.blocked, true);
  assert.ok(result.guards.some((item) => item.name === 'liquidity' && item.status === 'block'));
  assert.ok(result.guards.some((item) => item.name === 'slippage' && item.status === 'block'));
});

test('hardenDecision reduces size under high correlation but keeps BUY when thresholds still pass', () => {
  const result = service.hardenDecision({
    action: 'BUY',
    confidence: 0.83,
    regime: 'trend_bull',
    market: {
      liquidityUsd: 800000,
      spreadPct: 0.08,
      estimatedSlippagePct: 0.09,
    },
    portfolio: {
      openRiskPct: 0.48,
      maxObservedCorrelation: 0.75,
    },
    position: {
      portfolioCorrelation: 0.76,
      projectedOpenRiskPct: 0.5,
      hasExistingPosition: true,
    },
  });

  assert.equal(result.effectiveAction, 'BUY');
  assert.ok(result.recommendedSizeFraction > 0);
  assert.ok(result.recommendedSizeFraction < 1);
  assert.ok(result.guards.some((item) => item.name === 'correlation' && item.status === 'warn'));
});

test('trend_bear regime becomes stricter and can downgrade low-confidence BUY to HOLD', () => {
  const result = service.hardenDecision({
    action: 'BUY',
    confidence: 0.61,
    regime: 'trend_bear',
    market: {
      liquidityUsd: 900000,
      spreadPct: 0.06,
      estimatedSlippagePct: 0.08,
    },
    portfolio: {
      openRiskPct: 0.2,
      maxObservedCorrelation: 0.22,
    },
  });

  assert.equal(result.effectiveAction, 'HOLD');
  assert.equal(result.thresholds.buyThreshold > 0.64, true);
  assert.equal(result.adjustedConfidence < result.baseConfidence, true);
});

