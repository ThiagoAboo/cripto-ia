const express = require('express');
const { getActiveConfig, getConfigHistory, listConfigAudit, updateActiveConfig } = require('../services/config.service');
const { publish } = require('../services/eventBus.service');

const router = express.Router();

router.get('/', async (_request, response, next) => {
  try {
    const configRow = await getActiveConfig();
    response.json(configRow);
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await getConfigHistory({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/audit', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listConfigAudit({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (request, response, next) => {
  try {
    const nextConfig = request.body;

    if (!nextConfig || typeof nextConfig !== 'object' || Array.isArray(nextConfig)) {
      response.status(400).json({ error: 'invalid_config_payload' });
      return;
    }

    const updated = await updateActiveConfig(nextConfig, {
      actionType: 'config_update_manual',
      actor: 'dashboard',
      reason: 'manual_update',
    });
    publish('config.updated', {
      version: updated.version,
      updatedAt: updated.updated_at,
    });

    response.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
