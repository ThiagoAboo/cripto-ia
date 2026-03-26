const express = require('express');
const {
  getSocialScores,
  listSocialAlerts,
  getSocialSummary,
  getProviderStatuses,
} = require('../services/social.service');
const {
  DEFAULT_SOCIAL_POLICY,
  buildWatchlist,
  buildRiskRadar,
  buildNarrativeBoard,
  buildProviderHealth,
  filterRankedItems,
} = require('../services/socialIntelligence.service');

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
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts', async (request, response, next) => {
  try {
    const severity = request.query.severity ? String(request.query.severity) : null;
    const limit = Number(request.query.limit || 50);
    const items = await listSocialAlerts({ severity, limit });
    response.json({ count: items.length, items });
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

router.get('/policy/defaults', (_request, response) => {
  response.json({ policy: DEFAULT_SOCIAL_POLICY });
});

router.get('/watchlist', async (request, response, next) => {
  try {
    const classification = request.query.classification ? String(request.query.classification) : null;
    const [items, alerts, providerStatuses] = await Promise.all([
      getSocialScores({ classification, limit: 200 }),
      listSocialAlerts({ limit: 200 }),
      getProviderStatuses({ limit: 50 }),
    ]);

    const board = buildWatchlist(items, alerts, providerStatuses, DEFAULT_SOCIAL_POLICY);
    const filteredItems = filterRankedItems(board.items, request.query, DEFAULT_SOCIAL_POLICY);

    response.json({
      generatedAt: new Date().toISOString(),
      policy: board.policy,
      providerPenalty: board.providerPenalty,
      count: filteredItems.length,
      items: filteredItems,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/risk-radar', async (_request, response, next) => {
  try {
    const [items, alerts, providerStatuses] = await Promise.all([
      getSocialScores({ limit: 200 }),
      listSocialAlerts({ limit: 200 }),
      getProviderStatuses({ limit: 50 }),
    ]);

    const radar = buildRiskRadar(items, alerts, providerStatuses, DEFAULT_SOCIAL_POLICY);
    response.json(radar);
  } catch (error) {
    next(error);
  }
});

router.get('/narratives', async (_request, response, next) => {
  try {
    const [items, alerts, providerStatuses] = await Promise.all([
      getSocialScores({ limit: 200 }),
      listSocialAlerts({ limit: 200 }),
      getProviderStatuses({ limit: 50 }),
    ]);

    const board = buildNarrativeBoard(items, alerts, providerStatuses, DEFAULT_SOCIAL_POLICY);
    response.json(board);
  } catch (error) {
    next(error);
  }
});

router.get('/pipeline-health', async (_request, response, next) => {
  try {
    const [summary, providerStatuses] = await Promise.all([
      getSocialSummary(),
      getProviderStatuses({ limit: 50 }),
    ]);

    const providerHealth = buildProviderHealth(providerStatuses);
    response.json({
      generatedAt: new Date().toISOString(),
      providerHealth,
      summary,
      status:
        providerHealth.status === 'ok' && summary.assetsCount > 0
          ? 'healthy'
          : providerHealth.status === 'warning'
            ? 'degraded'
            : 'blocked',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
