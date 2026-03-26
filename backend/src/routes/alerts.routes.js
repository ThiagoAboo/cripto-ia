const express = require('express');
const { listActiveAlerts, acknowledgeAlert, resolveAlert, getAlertsSummary } = require('../services/alerts.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const status = request.query.status ? String(request.query.status) : 'open';
    const limit = Number(request.query.limit || 50);
    const items = await listActiveAlerts({ limit, status });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});


router.get('/summary', async (request, response, next) => {
  try {
    const status = request.query.status ? String(request.query.status) : 'open';
    const summary = await getAlertsSummary({ status });
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/:alertKey/ack', async (request, response, next) => {
  try {
    const actor = request.body?.actor || request.header('x-user-name') || 'dashboard';
    const item = await acknowledgeAlert(request.params.alertKey, actor);
    response.json({ ok: true, item });
  } catch (error) {
    next(error);
  }
});

router.post('/:alertKey/resolve', async (request, response, next) => {
  try {
    const actor = request.body?.actor || request.header('x-user-name') || 'dashboard';
    const item = await resolveAlert(request.params.alertKey, actor);
    response.json({ ok: true, item });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
