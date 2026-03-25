const express = require('express');
const env = require('../config/env');
const { getSystemStatus } = require('../services/status.service');
const { addClient, removeClient, publishStatusSnapshot } = require('../services/eventBus.service');

const router = express.Router();

router.get('/', async (_request, response, next) => {
  try {
    const status = await getSystemStatus();
    response.json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/stream', async (_request, response, next) => {
  try {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    response.write('retry: 5000\n\n');
    addClient(response);

    const snapshot = await getSystemStatus();
    publishStatusSnapshot(snapshot);

    const keepAlive = setInterval(() => {
      response.write('event: ping\ndata: {}\n\n');
    }, 25000);

    const periodicStatus = setInterval(async () => {
      try {
        const latest = await getSystemStatus();
        response.write(`event: status\ndata: ${JSON.stringify(latest)}\n\n`);
      } catch (_error) {
        // ignore snapshot fetch errors inside SSE loop
      }
    }, Math.max(5, Number(env.health.sseSnapshotIntervalSec || 15)) * 1000);

    _request.on('close', () => {
      clearInterval(keepAlive);
      clearInterval(periodicStatus);
      removeClient(response);
      response.end();
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
