const express = require('express');
const { listRunbooks, getRunbook } = require('../services/runbooks.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listRunbooks({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/:runbookKey', async (request, response, next) => {
  try {
    const item = await getRunbook(request.params.runbookKey);
    if (!item) {
      response.status(404).json({ error: 'runbook_not_found', message: 'Runbook não encontrado.' });
      return;
    }

    response.json(item);
  } catch (error) {
    next(error);
  }
});

router.get('/:runbookKey/guide', async (request, response, next) => {
  try {
    const item = await getRunbook(request.params.runbookKey);
    if (!item) {
      response.status(404).json({ error: 'runbook_not_found', message: 'Runbook não encontrado.' });
      return;
    }

    response.json({
      runbookKey: item.runbookKey,
      title: item.title,
      severity: item.severity,
      description: item.description,
      detectionSignals: item.detectionSignals,
      steps: item.steps,
      recoveryActions: item.recoveryActions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
