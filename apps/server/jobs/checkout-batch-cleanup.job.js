'use strict';

const cron = require('node-cron');
const checkoutBatchService = require('../services/checkout-batch.service');
const { getPaymentIntent, cancelPaymentIntent } = require('../services/stripe.service');
const { select, supabaseFetch } = require('../lib/supabase');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

function expectedShopIds(row) {
  return [...new Set((row?.payload?.groups || []).map((g) => g?.shopId || g?.shop_id).filter(Boolean).map(String))];
}

async function batchFulfillmentState(row, paymentIntentId) {
  const expected = expectedShopIds(row);
  if (!paymentIntentId || !expected.length) {
    return { complete: false, expected: expected.length, found: 0 };
  }

  const orders = await select('orders', {
    select: 'id,shop_id',
    filters: { payment_intent_id: String(paymentIntentId) },
    limit: Math.max(100, expected.length + 10),
  });
  const found = new Set((orders || []).map((o) => o?.shop_id).filter(Boolean).map(String));
  return {
    complete: expected.every((shopId) => found.has(shopId)),
    expected: expected.length,
    found: found.size,
  };
}

async function hasWalletDebit(idempotencyBase) {
  if (!idempotencyBase) return false;
  const rows = await select('customer_wallet_ledger', {
    select: 'id',
    filters: { idempotency_key: `checkout_debit:${idempotencyBase}` },
    limit: 1,
  });
  return Boolean(rows?.[0]);
}

async function deleteCompletedExpired() {
  const cutoff = new Date().toISOString();
  await supabaseFetch(
    `/rest/v1/checkout_batches?status=eq.completed&expires_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
  );
  return cutoff;
}

async function reconcilePending(row) {
  const batchId = String(row.id);
  const paymentIntentId = row.payment_intent_id ? String(row.payment_intent_id) : null;

  // Wallet-only checkout uses a deterministic synthetic payment id. A crash can
  // happen after order creation but before the response wrapper links the batch;
  // recover that exact case without guessing about real Stripe intents.
  if (!paymentIntentId) {
    const walletPaymentId = `wallet_${batchId}`;
    const walletState = await batchFulfillmentState(row, walletPaymentId);
    if (walletState.complete) {
      await checkoutBatchService.attachPaymentIntent(batchId, walletPaymentId);
      await checkoutBatchService.completeCheckoutBatch(batchId);
      return 'completed_wallet_recovered';
    }

    if (await hasWalletDebit(batchId)) {
      logger.error('Expired checkout batch has a wallet debit but incomplete orders', {
        batchId,
        expectedOrders: walletState.expected,
        foundOrders: walletState.found,
      });
      return 'kept_wallet_debit_incomplete';
    }

    // No linked payment was ever exposed and no wallet money moved. Once the
    // retention horizon passes this is an abandoned pre-payment handoff.
    await checkoutBatchService.deleteCheckoutBatch(batchId);
    return 'deleted_unattached';
  }

  const fulfillment = await batchFulfillmentState(row, paymentIntentId);

  if (paymentIntentId.startsWith('wallet_')) {
    if (fulfillment.complete) {
      await checkoutBatchService.completeCheckoutBatch(batchId);
      return 'completed_wallet_from_orders';
    }

    const walletBase = paymentIntentId.slice('wallet_'.length) || batchId;
    if (await hasWalletDebit(walletBase)) {
      logger.error('Expired wallet checkout is financially debited but not fully fulfilled', {
        batchId,
        paymentIntentId,
        expectedOrders: fulfillment.expected,
        foundOrders: fulfillment.found,
      });
      return 'kept_wallet_debit_incomplete';
    }
    await checkoutBatchService.deleteCheckoutBatch(batchId);
    return 'deleted_wallet_unfunded';
  }

  if (paymentIntentId.startsWith('pi_dummy_')) {
    if (fulfillment.complete) {
      await checkoutBatchService.completeCheckoutBatch(batchId);
      return 'completed_demo_from_orders';
    }

    if (await hasWalletDebit(paymentIntentId)) {
      logger.error('Expired demo checkout has a wallet debit but incomplete orders', {
        batchId,
        paymentIntentId,
        expectedOrders: fulfillment.expected,
        foundOrders: fulfillment.found,
      });
      return 'kept_demo_wallet_incomplete';
    }
    await checkoutBatchService.deleteCheckoutBatch(batchId);
    return 'deleted_demo_incomplete';
  }

  // Real Stripe batches are completed only by the webhook lifecycle. Local
  // order rows alone do not prove the event ledger/audit tail committed. If any
  // order already exists, preserve the payload and let Stripe retries finish the
  // exact webhook transaction rather than cancelling/deleting underneath it.
  if (fulfillment.found > 0) {
    logger.error('Stripe checkout batch has local orders but webhook is still pending', {
      batchId,
      paymentIntentId,
      expectedOrders: fulfillment.expected,
      foundOrders: fulfillment.found,
      allOrdersPresent: fulfillment.complete,
    });
    return fulfillment.complete
      ? 'kept_orders_complete_webhook_pending'
      : 'kept_orders_partial_webhook_pending';
  }

  let intent;
  try {
    intent = await getPaymentIntent(paymentIntentId);
  } catch (err) {
    logger.warn('Checkout batch reconciliation could not retrieve PaymentIntent', {
      batchId,
      paymentIntentId,
      error: err.message,
    });
    return 'kept_retrieval_failed';
  }

  if (!intent) {
    // Stripe unavailable/misconfigured: never infer an attached financial state.
    return 'kept_unknown_payment';
  }

  if (intent.status === 'succeeded' || intent.status === 'processing') {
    // A succeeded/processing charge with no local order is a recovery incident.
    // Preserve the payload so Stripe webhook retries can still fulfill it.
    logger.error('Paid checkout batch has no fulfilled orders yet', {
      batchId,
      paymentIntentId,
      stripeStatus: intent.status,
    });
    return `kept_${intent.status}_unfulfilled`;
  }

  if (intent.status !== 'canceled') {
    try {
      await cancelPaymentIntent(paymentIntentId, {
        idempotencyKey: `checkout_batch_expiry:${paymentIntentId}`,
      });
    } catch (err) {
      logger.warn('Checkout batch reconciliation could not safely cancel PaymentIntent', {
        batchId,
        paymentIntentId,
        stripeStatus: intent.status,
        error: err.message,
      });
      return 'kept_cancel_failed';
    }
  }

  await checkoutBatchService.deleteCheckoutBatch(batchId);
  return 'deleted_canceled';
}

/**
 * Daily financial handoff reconciliation. Completed rows age out normally;
 * expired pending rows are reconciled against orders, wallet ledger and Stripe
 * before any destructive cleanup is allowed.
 */
async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock
    ? { acquired: true }
    : await acquireLock('lock:job:checkout-batch-cleanup', 5 * 60_000);
  if (!lock) return { skipped: true, processed: 0 };

  try {
    const rows = await checkoutBatchService.listExpiredPending(100);
    const outcomes = {};

    for (const row of rows || []) {
      try {
        const outcome = await reconcilePending(row);
        outcomes[outcome] = (outcomes[outcome] || 0) + 1;
      } catch (err) {
        outcomes.failed = (outcomes.failed || 0) + 1;
        logger.error('Checkout batch reconciliation failed', {
          batchId: row?.id || null,
          paymentIntentId: row?.payment_intent_id || null,
          error: err.message,
        });
      }
    }

    const cutoff = await deleteCompletedExpired();
    logger.info('Checkout batch reconciliation complete', {
      processed: rows?.length || 0,
      outcomes,
      completedCutoff: cutoff,
    });
    return { processed: rows?.length || 0, outcomes, cutoff };
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '30 3 * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule('30 3 * * *', () => runOnce().catch((err) => {
    logger.error('Checkout batch cleanup job error', { error: err.message });
  }));
  logger.info('Background job started: checkout-batch-cleanup (daily at 03:30 UTC)');
  return task;
}

module.exports = {
  start,
  runOnce,
  reconcilePending,
  batchFulfillmentState,
  expectedShopIds,
  hasWalletDebit,
  schedule,
  name: 'checkout-batch-cleanup',
};
