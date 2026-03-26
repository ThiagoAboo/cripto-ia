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
const {
  DEFAULT_LIVE_GOVERNANCE_POLICY,
  getActivationChecklist,
  createLiveActivationRequest,
  getLiveActivationRequestById,
  listLiveActivationRequests,
  revalidateLiveActivationRequest,
  approveLiveActivationRequest,
  activateLiveMode,
  rollbackLiveMode,
  insertTestnetSupervisionReport,
  listTestnetSupervisionReports,
  listLiveModeEvents,
} = require('../services/liveGovernance.service');

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

router.get('/live/policy/defaults', (_request, response) => {
  response.json({ policy: DEFAULT_LIVE_GOVERNANCE_POLICY });
});

router.get('/live/checklist', async (request, response, next) => {
  try {
    const targetMode = request.query.targetMode || 'testnet';
    const checklist = await getActivationChecklist({ targetMode });
    response.json(checklist);
  } catch (error) {
    next(error);
  }
});

router.get('/live/requests', async (request, response, next) => {
  try {
    const status = request.query.status ? String(request.query.status) : null;
    const limit = Number(request.query.limit || 20);
    const items = await listLiveActivationRequests({ status, limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/live/requests/:id', async (request, response, next) => {
  try {
    const item = await getLiveActivationRequestById(request.params.id);
    if (!item) {
      response.status(404).json({ error: 'activation_request_not_found' });
      return;
    }
    response.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/live/requests', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const item = await createLiveActivationRequest({
      targetMode: request.body?.targetMode || 'testnet',
      requestedBy,
      reason: request.body?.reason || 'manual_activation_request',
      metadata: request.body?.metadata || {},
    });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/live/requests/:id/revalidate', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const item = await revalidateLiveActivationRequest(request.params.id, { requestedBy });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/live/requests/:id/approve', async (request, response, next) => {
  try {
    const approvedBy = request.body?.approvedBy || request.header('x-user-name') || 'dashboard';
    const item = await approveLiveActivationRequest(request.params.id, {
      approvedBy,
      comment: request.body?.comment || '',
    });
    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/live/requests/:id/activate', async (request, response, next) => {
  try {
    const activatedBy = request.body?.activatedBy || request.header('x-user-name') || 'dashboard';
    const result = await activateLiveMode(request.params.id, {
      activatedBy,
      confirmationPhrase: request.body?.confirmationPhrase || '',
      metadata: request.body?.metadata || {},
    });
    await pushControlSnapshot('control.live_activated', result.control);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/live/rollback', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const result = await rollbackLiveMode({
      requestedBy,
      reason: request.body?.reason || 'manual_live_rollback',
      targetMode: request.body?.targetMode || 'paper',
      metadata: request.body?.metadata || {},
    });
    await pushControlSnapshot('control.live_rollback', result.control);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/live/supervision', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listTestnetSupervisionReports({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/live/supervision/run', async (request, response, next) => {
  try {
    const requestedBy = request.body?.requestedBy || request.header('x-user-name') || 'dashboard';
    const result = await insertTestnetSupervisionReport({
      requestedBy,
      triggerSource: 'manual',
      autoRollback: Boolean(request.body?.autoRollback),
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/live/events', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 20);
    const items = await listLiveModeEvents({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
