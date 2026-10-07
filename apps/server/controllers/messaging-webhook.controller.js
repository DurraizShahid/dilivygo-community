'use strict';

/**
 * Resend and Twilio delivery/bounce/complaint callbacks (Phase 06 & Phase 07).
 *
 * Resend webhooks:
 *   Svix-signed (`svix-id` / `svix-timestamp` / `svix-signature` over raw JSON body).
 *   Mounted in `app.js` with `express.raw({ type: 'application/json' })` at `/api/webhooks/resend`.
 *   CSRF-exempted in `middleware/csrf.middleware.js`.
 *   Answers 503 until `RESEND_WEBHOOK_SECRET` is configured.
 *
 * Twilio SMS status callbacks:
 *   Twilio-signed (`X-Twilio-Signature` HMAC-SHA1 over canonical URL + POST params).
 *   Mounted in `app.js` with `express.urlencoded({ extended: false })` at `/api/webhooks/twilio/status`.
 *   CSRF-exempted in `middleware/csrf.middleware.js`.
 *   Answers 503 until `TWILIO_AUTH_TOKEN` is configured.
 *
 * Behavior: acknowledge quickly, update the `message_deliveries` row matched
 * by provider_message_id (Resend `data.email_id` or Twilio `MessageSid`), then 2xx.
 * Processing failures return 500 so providers retry (updates are idempotent and terminal-safe).
 * No recipient PII in logs — provider ids, event types, and error codes only.
 */

const { Webhook } = require('svix');
const config = require('../config');
const logger = require('../lib/logger');

function resendWebhookSecret() {
  return (process.env.RESEND_WEBHOOK_SECRET || '').trim();
}

function twilioAuthToken() {
  return ((config.twilio && config.twilio.authToken) || process.env.TWILIO_AUTH_TOKEN || '').trim();
}

/**
 * Map a Resend `email.*` event type onto delivery state. Matched generically
 * on the verb so unknown-but-harmless future types ack without flipping
 * state; returns null when the event carries no delivery verdict.
 */
function statusForResendEvent(type) {
  const t = String(type || '').toLowerCase();
  if (!t.startsWith('email.')) return null;
  if (/bounce|complain|fail/.test(t)) return 'failed';
  if (/deliver|sent/.test(t)) return 'sent';
  return null; // opened/clicked/delayed: no terminal verdict
}

/**
 * Map a Twilio SMS MessageStatus onto delivery state.
 * accepted, queued, sending -> queued
 * sent, delivered -> sent
 * failed, undelivered -> failed
 * unknown / harmless -> null (ack without mutating state)
 */
function statusForTwilioStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase().trim();
  if (!s) return null;
  if (['accepted', 'queued', 'sending'].includes(s)) return 'queued';
  if (['sent', 'delivered'].includes(s)) return 'sent';
  if (['failed', 'undelivered'].includes(s)) return 'failed';
  return null;
}

async function resendWebhook(req, res) {
  const secret = resendWebhookSecret();
  if (!secret) {
    logger.warn('messaging resend webhook: RESEND_WEBHOOK_SECRET not set');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  let evt;
  try {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    logger.warn('messaging resend webhook verify failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid webhook' });
  }

  try {
    const type = evt?.type || null;
    const emailId = (evt?.data && (evt.data.email_id || evt.data.id)) || null;
    const status = statusForResendEvent(type);

    if (!emailId || !status) {
      // Unknown/engagement event or unparseable payload: ack, change nothing.
      return res.json({ received: true });
    }

    const { applyProviderDeliveryStatus } = require('../services/messaging-provider');
    const result = await applyProviderDeliveryStatus({
      provider: 'resend',
      providerMessageId: String(emailId),
      status,
      lastError: status === 'failed' ? `resend:${type}` : null,
    });

    if (!result || !result.matched) {
      logger.info('messaging resend webhook: unknown message ID (unmatched, acked)', { emailId: String(emailId) });
      return res.json({ received: true });
    }

    logger.info('messaging resend webhook applied', { emailId: String(emailId), type, status });
    return res.json({ received: true });
  } catch (err) {
    // 500 so Resend retries; the update is idempotent (keyed by provider id).
    logger.error('messaging resend webhook processing failed', { error: err.message });
    return res.status(500).json({ error: 'Processing failed' });
  }
}

async function twilioStatusCallback(req, res) {
  const authToken = twilioAuthToken();
  if (!authToken) {
    logger.warn('messaging twilio status webhook: TWILIO_AUTH_TOKEN not set');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  const publicBase = (config.publicServerUrl || (config.isProd ? '' : 'http://localhost:8080')).replace(/\/$/, '');
  if (!publicBase && config.isProd) {
    logger.error('messaging twilio status webhook: PUBLIC_SERVER_URL not configured in production');
    return res.status(500).json({ error: 'PUBLIC_SERVER_URL not configured' });
  }
  const canonicalUrl = `${publicBase || 'http://localhost:8080'}/api/webhooks/twilio/status`;

  const signature = req.headers['x-twilio-signature'];
  let twilio;
  try {
    twilio = require('twilio');
  } catch (err) {
    logger.error('twilio sdk not available', { error: err.message });
    return res.status(500).json({ error: 'Twilio SDK unavailable' });
  }

  const isValid = signature && typeof twilio.validateRequest === 'function'
    ? twilio.validateRequest(authToken, signature, canonicalUrl, req.body || {})
    : false;

  if (!isValid) {
    logger.warn('messaging twilio status webhook verify failed');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const messageSid = (req.body && (req.body.MessageSid || req.body.SmsSid)) || null;
    const rawStatus = (req.body && (req.body.MessageStatus || req.body.SmsStatus)) || null;
    const status = statusForTwilioStatus(rawStatus);

    if (!messageSid || !status) {
      // Unknown status or unparseable payload: ack with empty TwiML without modifying state.
      return res.type('text/xml').send('<Response/>');
    }

    const { applyProviderDeliveryStatus } = require('../services/messaging-provider');
    let lastError = null;
    if (status === 'failed') {
      const errCode = req.body.ErrorCode ? `:${req.body.ErrorCode}` : '';
      lastError = `twilio:${String(rawStatus).toLowerCase().trim()}${errCode}`;
    }

    const result = await applyProviderDeliveryStatus({
      provider: 'twilio',
      providerMessageId: String(messageSid),
      status,
      lastError,
    });

    if (!result || !result.matched) {
      logger.info('messaging twilio status webhook: unknown SID (unmatched, acked)', { messageSid: String(messageSid) });
      return res.type('text/xml').send('<Response/>');
    }

    logger.info('messaging twilio status webhook applied', {
      messageSid: String(messageSid),
      rawStatus,
      status,
    });
    return res.type('text/xml').send('<Response/>');
  } catch (err) {
    logger.error('messaging twilio status webhook processing failed', { error: err.message });
    return res.status(500).type('text/xml').send('<Response/>');
  }
}

module.exports = {
  resendWebhook,
  statusForResendEvent,
  twilioStatusCallback,
  statusForTwilioStatus,
};
