const pool = require('../db/pool');
const env = require('../config/env');
const { publish } = require('./eventBus.service');

const SEVERITY_ORDER = { info: 1, warning: 2, high: 3, critical: 4 };

function severityAllowed(severity = 'high') {
  const current = SEVERITY_ORDER[String(severity).toLowerCase()] || 2;
  const minimum = SEVERITY_ORDER[String(env.notifications.minSeverity || 'high').toLowerCase()] || 3;
  return current >= minimum;
}

function getNotificationChannelsStatus() {
  return {
    enabled: Boolean(env.notifications.enabled),
    minSeverity: env.notifications.minSeverity,
    channels: [
      {
        key: 'webhook',
        enabled: Boolean(env.notifications.enabled && env.notifications.webhook.enabled && env.notifications.webhook.url),
        configured: Boolean(env.notifications.webhook.url),
        destination: env.notifications.webhook.url ? env.notifications.webhook.url.replace(/\?.*$/, '') : null,
        ready: Boolean(env.notifications.enabled && env.notifications.webhook.enabled && env.notifications.webhook.url),
      },
      {
        key: 'telegram',
        enabled: Boolean(env.notifications.enabled && env.notifications.telegram.enabled && env.notifications.telegram.botToken && env.notifications.telegram.chatId),
        configured: Boolean(env.notifications.telegram.botToken && env.notifications.telegram.chatId),
        destination: env.notifications.telegram.chatId || null,
        ready: Boolean(env.notifications.enabled && env.notifications.telegram.enabled && env.notifications.telegram.botToken && env.notifications.telegram.chatId),
      },
      {
        key: 'email_ready',
        enabled: Boolean(env.notifications.enabled && env.notifications.email.enabled),
        configured: Boolean(env.notifications.email.from && env.notifications.email.to),
        destination: env.notifications.email.to || null,
        ready: false,
        note: 'Canal preparado para integração SMTP/provider, ainda sem envio automático.',
      },
    ],
  };
}

async function createDeliveryLog({ channel, eventType, severity = null, destination = null, status = 'queued', payload = {}, responsePayload = null, errorMessage = null }) {
  const result = await pool.query(
    `
      INSERT INTO notification_deliveries (
        channel, event_type, severity, destination, status, payload, response_payload, error_message, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW())
      RETURNING id, channel, event_type AS "eventType", severity, destination, status,
                payload, response_payload AS "responsePayload", error_message AS "errorMessage", created_at AS "createdAt"
    `,
    [channel, eventType, severity, destination, status, JSON.stringify(payload || {}), responsePayload ? JSON.stringify(responsePayload) : null, errorMessage],
  );
  return result.rows[0];
}

async function sendWebhook(payload) {
  const url = env.notifications.webhook.url;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Math.max(1000, Number(env.notifications.webhook.timeoutMs || 8000))),
  });
  const text = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body: text.slice(0, 1000) };
}

async function sendTelegram(payload) {
  const url = `https://api.telegram.org/bot${env.notifications.telegram.botToken}/sendMessage`;
  const message = [
    `*${payload.title || 'Cripto IA'}*`,
    payload.message || '',
    payload.severity ? `Severity: ${payload.severity}` : null,
    payload.source ? `Source: ${payload.source}` : null,
  ].filter(Boolean).join('\n');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.notifications.telegram.chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_notification: Boolean(env.notifications.telegram.silent),
    }),
    signal: AbortSignal.timeout(8000),
  });

  const json = await response.json().catch(() => ({}));
  return { ok: response.ok && json.ok !== false, status: response.status, body: json };
}

async function dispatchNotification(eventType, payload = {}, options = {}) {
  const severity = String(options.severity || payload.severity || 'info').toLowerCase();
  const actor = options.actor || 'system';
  const channels = getNotificationChannelsStatus();
  const deliveries = [];

  if (!env.notifications.enabled || (!options.force && !severityAllowed(severity))) {
    return {
      skipped: true,
      reason: env.notifications.enabled ? 'severity_below_threshold' : 'notifications_disabled',
      channels,
      deliveries,
    };
  }

  const safePayload = { ...payload, eventType, actor, severity, timestamp: new Date().toISOString() };

  if (channels.channels[0].ready) {
    try {
      const response = await sendWebhook(safePayload);
      deliveries.push(await createDeliveryLog({
        channel: 'webhook',
        eventType,
        severity,
        destination: channels.channels[0].destination,
        status: response.ok ? 'sent' : 'failed',
        payload: safePayload,
        responsePayload: response,
        errorMessage: response.ok ? null : `status_${response.status}`,
      }));
    } catch (error) {
      deliveries.push(await createDeliveryLog({
        channel: 'webhook',
        eventType,
        severity,
        destination: channels.channels[0].destination,
        status: 'failed',
        payload: safePayload,
        errorMessage: error.message,
      }));
    }
  }

  if (channels.channels[1].ready) {
    try {
      const response = await sendTelegram(safePayload);
      deliveries.push(await createDeliveryLog({
        channel: 'telegram',
        eventType,
        severity,
        destination: channels.channels[1].destination,
        status: response.ok ? 'sent' : 'failed',
        payload: safePayload,
        responsePayload: response,
        errorMessage: response.ok ? null : `status_${response.status}`,
      }));
    } catch (error) {
      deliveries.push(await createDeliveryLog({
        channel: 'telegram',
        eventType,
        severity,
        destination: channels.channels[1].destination,
        status: 'failed',
        payload: safePayload,
        errorMessage: error.message,
      }));
    }
  }

  if (channels.channels[2].configured) {
    deliveries.push(await createDeliveryLog({
      channel: 'email_ready',
      eventType,
      severity,
      destination: channels.channels[2].destination,
      status: 'prepared',
      payload: safePayload,
      errorMessage: 'email_channel_not_implemented',
    }));
  }

  publish('notifications.dispatched', { eventType, severity, deliveriesCount: deliveries.length });
  return { skipped: false, deliveries, channels };
}

async function notifyAlertEvent(alert, options = {}) {
  if (!alert) return { skipped: true, reason: 'missing_alert' };
  return dispatchNotification('active_alert', {
    title: alert.title,
    message: alert.message,
    source: alert.source,
    severity: alert.severity,
    payload: alert.payload || {},
    alertKey: alert.alertKey,
  }, options);
}

async function sendTestNotification({ channel = 'all', actor = 'dashboard', message = 'Teste manual do Cripto IA' } = {}) {
  const payload = {
    title: 'Teste manual de alerta',
    message,
    source: 'dashboard',
    severity: 'warning',
  };

  if (channel === 'all') {
    return dispatchNotification('manual_test', payload, { actor, severity: 'warning', force: true });
  }

  const channels = getNotificationChannelsStatus();
  const target = channels.channels.find((item) => item.key === channel);
  if (!target) throw new Error('notification_channel_not_found');

  const original = {
    enabled: env.notifications.enabled,
    webhook: { ...env.notifications.webhook },
    telegram: { ...env.notifications.telegram },
    email: { ...env.notifications.email },
  };

  try {
    env.notifications.enabled = true;
    env.notifications.webhook.enabled = channel === 'webhook' && original.webhook.enabled;
    env.notifications.telegram.enabled = channel === 'telegram' && original.telegram.enabled;
    env.notifications.email.enabled = channel === 'email_ready' && original.email.enabled;
    return await dispatchNotification('manual_test', payload, { actor, severity: 'warning', force: true });
  } finally {
    env.notifications.enabled = original.enabled;
    env.notifications.webhook = original.webhook;
    env.notifications.telegram = original.telegram;
    env.notifications.email = original.email;
  }
}

async function listNotificationDeliveries({ limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(
    `
      SELECT id, channel, event_type AS "eventType", severity, destination, status,
             payload, response_payload AS "responsePayload", error_message AS "errorMessage", created_at AS "createdAt"
      FROM notification_deliveries
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

module.exports = {
  getNotificationChannelsStatus,
  dispatchNotification,
  notifyAlertEvent,
  sendTestNotification,
  listNotificationDeliveries,
};
