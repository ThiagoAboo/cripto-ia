
const express = require('express');
const {
  getObservabilitySummary,
  listObservabilitySnapshots,
  insertObservabilitySnapshot,
  exportObservabilityData,
} = require('../services/observability.service');

const router = express.Router();

router.get('/', async (_request, response, next) => {
  try {
    const summary = await getObservabilitySummary();
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/snapshots', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listObservabilitySnapshots({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/snapshot', async (request, response, next) => {
  try {
    const source = request.body?.source || 'dashboard';
    const item = await insertObservabilitySnapshot({ source });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.get('/export', async (request, response, next) => {
  try {
    const kind = String(request.query.kind || '').trim();
    const format = String(request.query.format || 'json').trim().toLowerCase();
    const limit = Number(request.query.limit || 200);
    const exported = await exportObservabilityData({ kind, format, limit });

    response.setHeader('Content-Type', exported.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.send(exported.body);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
