'use strict';

const cron = require('node-cron');
const inventoryReservations = require('../services/inventory-reservation.service');
const { getPaymentIntent, cancelPaymentIntent } = require('../services/stripe.service');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

async function reconcileReservation(row) {
  const reservationId = row.id;
  const paymentIntentId = row.payment_intent_id || null;

  if (!paymentIntentId) {
    await inventoryReservations.release(reservationId);
    return 'released_unattached';
  }

  let intent;
  try {
    intent = await getPaymentIntent(paymentIntentId);
  } catch (err) {
    // A Stripe outage must never cause us to put possibly-paid stock back on
    // sale. Leave the row reserved and retry on the next job run.
    logger.warn('Inventory cleanup could not retrieve PaymentIntent', {
      reservationId,
      paymentIntentId,
      error: err.message,
    });
    return 'kept_retrieval_failed';
  }

  if (!intent) {
    // Stripe is unavailable/misconfigured in non-production environments. Keep
    // attached reservations rather than guessing their payment state.
    return 'kept_unknown_payment';
  }

  if (intent.status === 'succeeded' || intent.status === 'processing') {
    // Webhook fulfillment may still be retrying. Never release paid/in-flight
    // inventory simply because the checkout reservation TTL elapsed.
    return `kept_${intent.status}`;
  }

  if (intent.status !== 'canceled') {
    try {
      await cancelPaymentIntent(paymentIntentId, {
        idempotencyKey: `inventory_expiry:${paymentIntentId}`,
      });
    } catch (err) {
      logger.warn('Inventory cleanup could not safely cancel PaymentIntent', {
        reservationId,
        paymentIntentId,
        status: intent.status,
        error: err.message,
      });
      return 'kept_cancel_failed';
    }
  }

  await inventoryReservations.release(reservationId);
  return 'released';
}

/** Every 5 minutes: safely return stock from abandoned checkouts. */
async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock
    ? { acquired: true }
    : await acquireLock('lock:job:inventory-reservation-cleanup', 4 * 60_000);
  if (!lock) return { skipped: true, processed: 0 };

  try {
    const rows = await inventoryReservations.listExpiredReserved(100);
    if (!rows?.length) return { processed: 0 };

    const counts = {};
    for (const row of rows) {
      try {
        const outcome = await reconcileReservation(row);
        counts[outcome] = (counts[outcome] || 0) + 1;
      } catch (err) {
        counts.failed = (counts.failed || 0) + 1;
        logger.error('Inventory reservation cleanup failed for row', {
          reservationId: row.id,
          paymentIntentId: row.payment_intent_id || null,
          error: err.message,
        });
      }
    }

    logger.info('Inventory reservation cleanup complete', {
      processed: rows.length,
      outcomes: counts,
    });
    return { processed: rows.length, outcomes: counts };
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '*/5 * * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule('*/5 * * * *', () => runOnce().catch((err) => {
    logger.error('Inventory reservation cleanup job error', { error: err.message });
  }));
  logger.info('Background job started: inventory-reservation-cleanup (every 5 minutes)');
  return task;
}

module.exports = {
  start,
  runOnce,
  reconcileReservation,
  schedule,
  name: 'inventory-reservation-cleanup',
};
