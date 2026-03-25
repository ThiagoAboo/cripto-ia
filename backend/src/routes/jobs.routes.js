const express = require('express');
const { listScheduledJobRuns, runNamedJob } = require('../services/scheduler.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listScheduledJobRuns({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/run/:jobKey', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const item = await runNamedJob(request.params.jobKey, { requestedBy, triggerSource: 'manual' });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
