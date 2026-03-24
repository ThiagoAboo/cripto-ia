const express = require('express');
const {
  getSocialScores,
  listSocialAlerts,
  getSocialSummary,
  getProviderStatuses,
} = require('../services/social.service');

const router = express.Router();

router.get('/scores', async (request, response, next) => {
  try {
    const symbols = String(request.query.symbols || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    const classification = request.query.classification ? String(request.query.classification) : null;
    const limit = Number(request.query.limit || 50);
    const items = await getSocialScores({ symbols, classification, limit });

    response.json({
      count: items.length,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts', async (request, response, next) => {
  try {
    const severity = request.query.severity ? String(request.query.severity) : null;
    const limit = Number(request.query.limit || 50);
    const items = await listSocialAlerts({ severity, limit });

    response.json({
      count: items.length,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/providers', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await getProviderStatuses({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (_request, response, next) => {
  try {
    const summary = await getSocialSummary();
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
