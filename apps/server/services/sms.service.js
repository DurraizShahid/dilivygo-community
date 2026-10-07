'use strict';

const config = require('../config');
const logger = require('../lib/logger');
const messagingProvider = require('./messaging-provider');

function isSmsConfigured() {
  return Boolean(config.twilio && config.twilio.enabled);
}

/**
 * Send an SMS message.
 * Falls back to console.log when Twilio is not configured.
 *
 * Phase 06: delivery runs through the canonical messaging capability
 * (services/messaging-provider.js — Twilio adapter, correlation-key
 * idempotency, delivery records, honest health). This wrapper preserves the
 * historical contract: same arguments (plus optional pass-through
 * `organizationId` / `correlationId`), same dev-fallback return, throws on
 * failure. Logs carry correlation ids only — never phone/body PII.
 *
 * OTP safety: callers SHOULD pass a stable `correlationId` shaped
 * `otp:{org}:{channel}:{recipient-digest}:{window}` (see
 * `messagingProvider.buildOtpCorrelationKey`) so queue retries of the same
 * logical OTP cannot double-send. When omitted, the capability derives a
 * stable (channel, recipient, content, 15-min window) key with the same
 * property — a fresh OTP code still delivers because the content differs.
 */
async function sendSMS({ to, body, organizationId = null, correlationId = null }) {
  if (!isSmsConfigured()) {
    logger.warn('[SMS FALLBACK] Would send SMS');
    return { sid: 'dev-fallback', status: 'logged' };
  }

  try {
    const result = await messagingProvider.sendSms({
      organizationId,
      to,
      body,
      correlationId,
    });
    return {
      sid: result.providerMessageId,
      providerMessageId: result.providerMessageId,
      status: result.status,
      raw: result.raw,
    };
  } catch (err) {
    logger.error('SMS send failed', {
      code: err.code || null,
      statusCode: err.statusCode || null,
    });
    throw err;
  }
}

/**
 * Generate a cryptographically random 6-digit OTP.
 */
function generateOTP() {
  const crypto = require('crypto');
  return String(crypto.randomInt(100000, 999999));
}

module.exports = { sendSMS, generateOTP };
