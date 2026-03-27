const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeExecutionPaperConfig,
  resolveAppliedFeePct,
  evaluateBnbSellGuard,
} = require('../src/services/binanceFeePolicy.service');

test('normalizeExecutionPaperConfig aplica defaults esperados', () => {
  const result = normalizeExecutionPaperConfig({});
  assert.equal(result.feePct, 0.1);
  assert.equal(result.bnbFeePct, 0.075);
  assert.equal(result.useBnbFeeDiscount, true);
  assert.equal(result.minBnbReserveQty, 0.05);
});

test('resolveAppliedFeePct usa taxa com BNB quando há saldo disponível', () => {
  const result = resolveAppliedFeePct({
    config: { execution: { paper: { feePct: 0.1, bnbFeePct: 0.075, useBnbFeeDiscount: true } } },
    bnbQuantity: 0.2,
  });
  assert.equal(result.appliedFeePct, 0.075);
  assert.equal(result.feeSource, 'bnb_discount');
});

test('resolveAppliedFeePct mantém taxa padrão sem saldo BNB', () => {
  const result = resolveAppliedFeePct({
    config: { execution: { paper: { feePct: 0.1, bnbFeePct: 0.075, useBnbFeeDiscount: true } } },
    bnbQuantity: 0,
  });
  assert.equal(result.appliedFeePct, 0.1);
  assert.equal(result.feeSource, 'standard');
});

test('evaluateBnbSellGuard bloqueia venda abaixo da reserva mínima', () => {
  const result = evaluateBnbSellGuard({
    currentQuantity: 0.08,
    quantityToSell: 0.04,
    config: { execution: { paper: { minBnbReserveQty: 0.05, useBnbFeeDiscount: true } } },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'bnb_reserve_protection');
});

test('evaluateBnbSellGuard não protege reserva quando desconto BNB estiver desligado', () => {
  const result = evaluateBnbSellGuard({
    currentQuantity: 0.08,
    quantityToSell: 0.04,
    config: { execution: { paper: { minBnbReserveQty: 0.05, useBnbFeeDiscount: false } } },
  });
  assert.equal(result.blocked, false);
  assert.equal(result.reason, null);
});
