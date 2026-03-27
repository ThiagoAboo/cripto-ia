function normalizeExecutionPaperConfig(config = {}) {
  const paper = config?.execution?.paper || {};
  return {
    feePct: Number(paper.feePct ?? 0.1),
    bnbFeePct: Number(paper.bnbFeePct ?? 0.075),
    useBnbFeeDiscount: paper.useBnbFeeDiscount !== false,
    minBnbReserveQty: Number(paper.minBnbReserveQty ?? 0.05),
  };
}

function resolveAppliedFeePct({ config = {}, bnbQuantity = 0 }) {
  const settings = normalizeExecutionPaperConfig(config);
  const normalizedBnbQty = Number(bnbQuantity || 0);
  const hasBnbAvailable = settings.useBnbFeeDiscount && normalizedBnbQty > 0;

  return {
    appliedFeePct: hasBnbAvailable ? settings.bnbFeePct : settings.feePct,
    feeSource: hasBnbAvailable ? 'bnb_discount' : 'standard',
    hasBnbAvailable,
    minBnbReserveQty: settings.minBnbReserveQty,
  };
}

function evaluateBnbSellGuard({ currentQuantity = 0, quantityToSell = 0, config = {} }) {
  const settings = normalizeExecutionPaperConfig(config);
  const nextQuantity = Number(currentQuantity || 0) - Number(quantityToSell || 0);
  const shouldProtectReserve = settings.minBnbReserveQty > 0;
  const blocked = shouldProtectReserve && nextQuantity < settings.minBnbReserveQty;

  return {
    blocked,
    reserveQty: settings.minBnbReserveQty,
    nextQuantity,
    reason: blocked ? 'bnb_reserve_protection' : null,
  };
}

module.exports = {
  normalizeExecutionPaperConfig,
  resolveAppliedFeePct,
  evaluateBnbSellGuard,
};
