const express = require('express');
const { listPromotions, promoteOptimizationWinner } = require('../services/promotion.service');
const { publish } = require('../services/eventBus.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listPromotions({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/from-optimizer/:id', async (request, response, next) => {
  try {
    const { rank, targetChannel, approvedBy, reason } = request.body || {};
    const result = await promoteOptimizationWinner({
      optimizationRunId: Number(request.params.id),
      rank,
      targetChannel,
      approvedBy,
      reason,
    });

    publish('promotion.created', {
      promotionId: result.promotion?.id,
      targetChannel: result.promotion?.targetChannel,
      status: result.promotion?.status,
      appliedVersion: result.promotion?.appliedVersion,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
