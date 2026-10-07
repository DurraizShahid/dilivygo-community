'use strict';

const logger = require('../lib/logger');
const { remove } = require('../lib/supabase');
const messagingProvider = require('./messaging-provider');

/**
 * Send a push notification to a single device token.
 *
 * Phase 06: delivery runs through the canonical messaging capability
 * (services/messaging-provider.js — FCM adapter, correlation-key
 * idempotency, delivery records, honest health). Contract preserved: resolves
 * the FCM message id on success, resolves `null` when push is unconfigured,
 * when the send fails, or when the token is stale (stale tokens are removed
 * — see below). Never throws; never logs token/title/body content.
 */
async function sendPushNotification({ token, title, body, data = {}, organizationId = null, correlationId = null }) {
  try {
    const result = await messagingProvider.sendPush({
      organizationId,
      token,
      title,
      body,
      data,
      correlationId,
    });
    return result.providerMessageId;
  } catch (err) {
    if (err && err.code === 'PUSH_INVALID_TOKEN') {
      await _removeStaleToken(token);
      return null;
    }
    if (err && err.statusCode === 503) {
      logger.debug('[PUSH FALLBACK] Push provider not configured, skipping send');
      return null;
    }
    logger.error('Push send failed', { code: err && err.code ? err.code : null });
    return null;
  }
}

/**
 * Send push notifications to multiple tokens.
 *
 * Contract preserved: resolves the FCM `sendEachForMulticast`-style batch
 * response (`{ successCount, failureCount, responses }`) on success,
 * resolves `null` when push is unconfigured, the token list is empty, or the
 * send fails. Stale tokens are removed exactly as before. Never throws;
 * logs counts only — never tokens or message content.
 */
async function sendPushToMultiple({ tokens, title, body, data = {}, organizationId = null, correlationId = null }) {
  if (!tokens || !tokens.length) return null;

  try {
    const summary = await messagingProvider.sendPushBatch({
      organizationId,
      tokens,
      title,
      body,
      data,
      correlationId,
    });

    if (summary.invalidTokens && summary.invalidTokens.length) {
      await Promise.allSettled(summary.invalidTokens.map(_removeStaleToken));
    }

    // Duplicate-suppressed batches have no provider response to return;
    // callers treat a non-null value as "handled".
    if (!summary.raw) return { successCount: 0, failureCount: 0, responses: [], duplicate: true };
    return summary.raw;
  } catch (err) {
    if (err && err.statusCode === 503) return null;
    logger.error('Push multicast failed', { code: err && err.code ? err.code : null });
    return null;
  }
}

async function _removeStaleToken(token) {
  try {
    await remove('push_tokens', { token });
  } catch (err) {
    logger.error('Failed to remove stale push token', { error: err.message });
  }
}

function _isStaleTokenError(err) {
  // Canonical definition now lives in the messaging capability; kept here as
  // a deprecated alias so any external importer keeps working.
  return messagingProvider.isInvalidPushToken(err);
}

module.exports = { sendPushNotification, sendPushToMultiple };
