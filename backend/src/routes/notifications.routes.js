const express = require('express');
const { getNotificationChannelsStatus, sendTestNotification, listNotificationDeliveries } = require('../services/notifications.service');

const router = express.Router();

router.get('/channels', async (_request, response, next) => {
  try {
    response.json(getNotificationChannelsStatus());
  } catch (error) {
    next(error);
  }
});

router.get('/deliveries', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 30);
    const items = await listNotificationDeliveries({ limit });
    response.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (request, response, next) => {
  try {
    const { channel = 'all', actor = 'dashboard', message } = request.body || {};
    const result = await sendTestNotification({ channel, actor, message });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
