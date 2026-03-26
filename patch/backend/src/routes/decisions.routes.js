const express = require('express');
const { listRecentDecisions } = require('../services/portfolio.service');
const { hardenDecision, DEFAULT_GUARDRAILS, DEFAULT_REGIME_POLICIES } = require('../services/decisionPolicy.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 50);
    const decisions = await listRecentDecisions({ limit });
    response.json({
      count: decisions.length,
      items: decisions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/policy/defaults', (_request, response) => {
  response.json({
    guardrails: DEFAULT_GUARDRAILS,
    regimes: DEFAULT_REGIME_POLICIES,
  });
});

router.post('/preview', async (request, response, next) => {
  try {
    const payload = hardenDecision(request.body || {});
    response.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
