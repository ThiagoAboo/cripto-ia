const express = require('express');
const { listPolicyGateReports, evaluatePromotionPolicy } = require('../services/policyGate.service');

const router = express.Router();

router.get('/reports', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listPolicyGateReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/evaluate-promotion', async (request, response, next) => {
  try {
    const { targetChannel = 'paper_active', candidateSummary = {}, requestedBy = 'dashboard' } = request.body || {};
    const result = await evaluatePromotionPolicy({ targetChannel, candidateSummary, requestedBy });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
