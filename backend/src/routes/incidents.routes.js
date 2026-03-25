const express = require('express');
const {
  listIncidentDrills,
  listRecoveryActions,
  simulateIncidentDrill,
  executeRecoveryAction,
} = require('../services/runbooks.service');
const { publish, publishStatusSnapshot } = require('../services/eventBus.service');
const { getSystemStatus } = require('../services/status.service');

const router = express.Router();

async function pushSnapshot(eventName, payload) {
  publish(eventName, payload);
  const snapshot = await getSystemStatus();
  publishStatusSnapshot(snapshot);
}

router.get('/drills', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listIncidentDrills({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/drills/run', async (request, response, next) => {
  try {
    const actor = request.body?.actor || request.header('x-user-name') || 'dashboard';
    const item = await simulateIncidentDrill({
      scenarioKey: request.body?.scenarioKey,
      severity: request.body?.severity,
      actor,
      notes: request.body?.notes || '',
      payload: request.body?.payload || {},
    });
    await pushSnapshot('incident.drill.simulated', item);
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.get('/recovery-actions', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listRecoveryActions({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/recovery-actions/run', async (request, response, next) => {
  try {
    const actor = request.body?.actor || request.header('x-user-name') || 'dashboard';
    const item = await executeRecoveryAction({
      runbookKey: request.body?.runbookKey,
      actionKey: request.body?.actionKey,
      actor,
      notes: request.body?.notes || '',
      payload: request.body?.payload || {},
    });
    await pushSnapshot('incident.recovery_action', item);
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
