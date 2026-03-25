const express = require('express');
const {
  listPromotions,
  listPromotionRequests,
  simulateOptimizationWinnerPromotion,
  createApprovalRequestFromOptimizer,
  approvePromotionRequest,
  rejectPromotionRequest,
  rollbackActiveConfigToVersion,
} = require('../services/promotion.service');
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

router.get('/requests', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const status = request.query.status ? String(request.query.status) : null;
    const items = await listPromotionRequests({ limit, status });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/simulate/from-optimizer/:id', async (request, response, next) => {
  try {
    const { rank, targetChannel } = request.body || {};
    const result = await simulateOptimizationWinnerPromotion({
      optimizationRunId: Number(request.params.id),
      rank,
      targetChannel,
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/requests/from-optimizer/:id', async (request, response, next) => {
  try {
    const { rank, targetChannel, requestedBy, reason } = request.body || {};
    const result = await createApprovalRequestFromOptimizer({
      optimizationRunId: Number(request.params.id),
      rank,
      targetChannel,
      requestedBy,
      reason,
    });

    publish('promotion.requested', {
      requestId: result.request?.id,
      sourceRunId: result.request?.sourceRunId,
      targetChannel: result.request?.targetChannel,
      status: result.request?.status,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:requestId/approve', async (request, response, next) => {
  try {
    const { approvedBy, approvalNote } = request.body || {};
    const result = await approvePromotionRequest({
      requestId: Number(request.params.requestId),
      approvedBy,
      approvalNote,
    });

    publish('promotion.approved', {
      requestId: result.request?.id,
      promotionId: result.promotion?.id,
      targetChannel: result.promotion?.targetChannel,
      status: result.request?.status,
      appliedVersion: result.request?.appliedVersion,
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:requestId/reject', async (request, response, next) => {
  try {
    const { rejectedBy, rejectionNote } = request.body || {};
    const result = await rejectPromotionRequest({
      requestId: Number(request.params.requestId),
      rejectedBy,
      rejectionNote,
    });

    publish('promotion.rejected', {
      requestId: result?.id,
      targetChannel: result?.targetChannel,
      status: result?.status,
    });

    response.json({ request: result });
  } catch (error) {
    next(error);
  }
});

router.post('/rollback/:version', async (request, response, next) => {
  try {
    const { requestedBy, reason } = request.body || {};
    const result = await rollbackActiveConfigToVersion({
      version: Number(request.params.version),
      requestedBy,
      reason,
    });

    publish('promotion.rollback', {
      targetVersion: result.targetVersion?.version,
      appliedVersion: result.updatedConfig?.version,
      promotionId: result.promotion?.id,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/from-optimizer/:id', async (request, response, next) => {
  try {
    const { rank, targetChannel, approvedBy, reason } = request.body || {};
    const result = await createApprovalRequestFromOptimizer({
      optimizationRunId: Number(request.params.id),
      rank,
      targetChannel,
      requestedBy: approvedBy || 'dashboard',
      reason,
    });

    publish('promotion.requested', {
      requestId: result.request?.id,
      sourceRunId: result.request?.sourceRunId,
      targetChannel: result.request?.targetChannel,
      status: result.request?.status,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
