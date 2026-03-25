const express = require('express');
const {
  getRuntimeControl,
  updateRuntimeControl,
  pauseRuntimeControl,
  resumeRuntimeControl,
  listCooldowns,
  clearCooldown,
  getRiskGuardrailSummary,
  setMaintenanceMode,
  clearMaintenanceMode,
} = require('../services/control.service');
const { publish, publishStatusSnapshot } = require('../services/eventBus.service');
const { getSystemStatus } = require('../services/status.service');

const router = express.Router();

async function buildControlResponse() {
  const [control, guardrails, cooldowns] = await Promise.all([
    getRuntimeControl(),
    getRiskGuardrailSummary(),
    listCooldowns({ activeOnly: true, limit: 100 }),
  ]);

  return {
    ...control,
    activeCooldowns: cooldowns,
    guardrails,
  };
}

async function pushControlSnapshot(eventName, payload) {
  publish(eventName, payload);
  const snapshot = await getSystemStatus();
  publishStatusSnapshot(snapshot);
}

router.get('/', async (_request, response, next) => {
  try {
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.patch('/', async (request, response, next) => {
  try {
    const patch = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await updateRuntimeControl(patch, { updatedBy });
    await pushControlSnapshot('control.updated', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.post('/pause', async (request, response, next) => {
  try {
    const { reason = 'manual_pause', metadata = {} } = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await pauseRuntimeControl({ reason, updatedBy, emergencyStop: false, metadata });
    await pushControlSnapshot('control.paused', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.post('/resume', async (request, response, next) => {
  try {
    const { metadata = {}, clearEmergencyStop = true } = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await resumeRuntimeControl({ updatedBy, metadata, clearEmergencyStop });
    await pushControlSnapshot('control.resumed', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.post('/emergency-stop', async (request, response, next) => {
  try {
    const { reason = 'manual_emergency_stop', metadata = {} } = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await pauseRuntimeControl({ reason, updatedBy, emergencyStop: true, metadata });
    await pushControlSnapshot('control.emergency_stop', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});


router.post('/maintenance/on', async (request, response, next) => {
  try {
    const { reason = 'manual_maintenance', scope = 'system', until = null, metadata = {} } = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await setMaintenanceMode({ reason, scope, until, updatedBy, metadata });
    await pushControlSnapshot('control.maintenance_on', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.post('/maintenance/off', async (request, response, next) => {
  try {
    const { resume = false, metadata = {} } = request.body || {};
    const updatedBy = request.header('x-user-name') || 'dashboard';
    const control = await clearMaintenanceMode({ updatedBy, metadata, resume });
    await pushControlSnapshot('control.maintenance_off', control);
    response.json(await buildControlResponse());
  } catch (error) {
    next(error);
  }
});

router.get('/cooldowns', async (request, response, next) => {
  try {
    const activeOnly = request.query.activeOnly !== 'false';
    const limit = Number(request.query.limit || 100);
    const items = await listCooldowns({ activeOnly, limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.delete('/cooldowns/:symbol', async (request, response, next) => {
  try {
    const item = await clearCooldown(request.params.symbol);
    await pushControlSnapshot('control.cooldown_cleared', { symbol: String(request.params.symbol || '').toUpperCase(), item });
    response.json({ ok: true, item });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
