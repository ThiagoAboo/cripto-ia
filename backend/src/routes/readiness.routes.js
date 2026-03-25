const express = require('express');
const { evaluateReadiness, getLatestReadinessReport, listReadinessReports } = require('../services/readiness.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const latest = await getLatestReadinessReport();
    response.json(latest || { status: 'unknown', summary: { checklist: [] } });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listReadinessReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/run', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const item = await evaluateReadiness({ requestedBy, triggerSource: 'manual' });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
