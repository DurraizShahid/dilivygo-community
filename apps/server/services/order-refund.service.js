'use strict';

const { createRefund, getPaymentIntent } = require('./stripe.service');
// Commercial: Connect transfer payouts/reversals are not part of the Community
// Edition. In CE the restaurant's own Stripe account is charged directly, so
// there are no platform->vendor transfers to reverse. Guarded requires with
// benign fallbacks keep the refund flow working.
let reverseVendorTransferForOrderRefund = async () => ({ ok: true, skipped: true });
let transferReversalLedger = { recordCompletedTransferReversal: async () => {} };
try {
  ({ reverseVendorTransferForOrderRefund } = require('./vendor-payout.service'));
  transferReversalLedger = require('./vendor-transfer-reversal-ledger.service');
} catch {
  // commercial modules absent in CE — fallbacks above apply
}
const refundOperations = require('./refund-operation.service');
const notificationService = require('./notification.service');
const { writeAuditLog } = require('../lib/audit');
const { organizationIdByProjectRef } = require('../lib/audit-org');
const { acquireLock, releaseLock } = require('../lib/lock');
const { select } = require('../lib/supabase');
const customerModel = require('../models/customer.model');
const orderModel = require('../models/order.model');
const walletService = require('./wallet.service');
const { createError } = require('../middleware/error.middleware');
const logger = require('../lib/logger');

const REFUND_LOCK_TTL_MS = 2 * 60 * 1000;

function safeCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

async function resolveOrderPaymentAllocation(order) {
  const totalCents = safeCents(order.total_cents);
  const paymentIntentId = String(order.payment_intent_id || '');

  if (!paymentIntentId) {
    return { walletPaidCents: 0, stripePaidCents: 0, totalCents };
  }
  if (paymentIntentId.startsWith('wallet_')) {
    return { walletPaidCents: totalCents, stripePaidCents: 0, totalCents };
  }
  if (paymentIntentId.startsWith('pi_dummy')) {
    return { walletPaidCents: 0, stripePaidCents: 0, totalCents, demo: true };
  }

  const intent = await getPaymentIntent(paymentIntentId);
  if (!intent) {
    throw createError('Unable to resolve the original payment allocation', 503);
  }

  const batchWalletCents = safeCents(intent.metadata?.walletAmountCents);
  if (batchWalletCents <= 0) {
    return { walletPaidCents: 0, stripePaidCents: totalCents, totalCents };
  }

  const siblingOrders = await select('orders', {
    select: 'id,shop_id,total_cents',
    filters: { payment_intent_id: paymentIntentId },
    limit: 200,
  });
  const sorted = [...(siblingOrders || [])].sort((a, b) =>
    String(a.shop_id || '').localeCompare(String(b.shop_id || '')),
  );

  let remainingWallet = Math.min(
    batchWalletCents,
    sorted.reduce((sum, row) => sum + safeCents(row.total_cents), 0),
  );

  for (const row of sorted) {
    const rowTotal = safeCents(row.total_cents);
    const walletPaidCents = Math.min(rowTotal, remainingWallet);
    remainingWallet -= walletPaidCents;
    if (String(row.id) === String(order.id)) {
      return {
        walletPaidCents,
        stripePaidCents: Math.max(0, rowTotal - walletPaidCents),
        totalCents: rowTotal,
      };
    }
  }

  throw createError('Order is not linked to its original payment allocation', 409);
}

function splitRefundAcrossPaymentSources(refundAmountCents, allocation) {
  const refund = safeCents(refundAmountCents);
  const total = Math.max(1, safeCents(allocation.totalCents));
  if (refund >= total) {
    return {
      walletRefundCents: safeCents(allocation.walletPaidCents),
      stripeRefundCents: safeCents(allocation.stripePaidCents),
    };
  }

  const walletRefundCents = Math.min(
    safeCents(allocation.walletPaidCents),
    Math.floor((refund * safeCents(allocation.walletPaidCents)) / total),
  );
  const stripeRefundCents = Math.min(
    safeCents(allocation.stripePaidCents),
    Math.max(0, refund - walletRefundCents),
  );
  return { walletRefundCents, stripeRefundCents };
}

async function runPostRefundSideEffects(order, audit, result, reason) {
  const { refundAmount, walletRefundCents, stripeRefundCents } = result;

  try {
    if (order.customer_id) {
      const customer = await customerModel.findById(order.customer_id);
      if (customer?.email) {
        await notificationService.sendRefundEmail(customer.email, order, refundAmount, {
          creditedToWallet: walletRefundCents > 0,
        });
      }
    }
  } catch (err) {
    // The financial state is already committed. A provider/email failure must
    // not turn a successful refund into a client-visible payment failure.
    logger.error('Refund notification failed after financial commit', {
      orderId: order.id,
      error: err.message,
    });
  }

  try {
    let organizationId = order.organization_id || null;
    if (!organizationId && order.project_ref) {
      organizationId = await organizationIdByProjectRef(order.project_ref).catch(() => null);
    }
    await writeAuditLog({
      userId: audit.userId,
      action: 'payment.refunded',
      resourceType: 'order',
      resourceId: order.id,
      details: {
        amountCents: refundAmount,
        reason,
        walletRefundCents,
        stripeRefundCents,
      },
      ip: audit.ip,
      organizationId,
    });
  } catch (err) {
    logger.error('Refund audit log failed after financial commit', {
      orderId: order.id,
      error: err.message,
    });
  }
}

async function completeRecoveredRefund(operation, current, requestedRefund) {
  if (operation?.status === 'pending') {
    await refundOperations.markCompleted(operation);
  }
  return {
    refundAmount: safeCents(current.refund_amount_cents || requestedRefund),
    walletRefundCents: null,
    stripeRefundCents: null,
    idempotent: true,
  };
}

/**
 * Refund the actual payment sources, reverse the vendor transfer, then persist
 * the refunded order state. External financial operations carry deterministic
 * idempotency keys. A durable operation row is created before the first money
 * movement, so a background worker can resume the same idempotent sequence after
 * process death instead of depending on a user/operator to repeat the request.
 */
async function executeOrderRefund(order, params, audit) {
  if (!order) throw createError('Order not found', 404);

  const orderId = audit.orderId || order.id;
  const lock = await acquireLock(`lock:refund:order:${orderId}`, REFUND_LOCK_TTL_MS);
  if (!lock) {
    throw createError('A refund for this order is already being processed', 409);
  }

  let operation = null;
  try {
    // Refresh under the lock. Callers frequently pass a row loaded before
    // acquiring the lock, which is not a safe financial concurrency token.
    const current = (await orderModel.findWithItems(orderId)) || order;
    const { amountCents, reason } = params;
    const total = safeCents(current.total_cents);
    const requestedRefund = amountCents != null && amountCents > 0
      ? Math.min(safeCents(amountCents), total)
      : total;

    if (requestedRefund <= 0) {
      throw createError('Invalid refund amount', 400);
    }

    operation = await refundOperations.findByOrderAmount(orderId, requestedRefund);

    // If the local order state committed just before a process died, close the
    // durable operation on retry without repeating external money movement.
    if (current.payment_status === 'refunded') {
      const alreadyRefunded = safeCents(current.refund_amount_cents || total);
      if (requestedRefund === total || requestedRefund === alreadyRefunded) {
        return completeRecoveredRefund(operation, current, requestedRefund);
      }
      throw createError('Order is already fully refunded', 409);
    }

    if (current.payment_status === 'partially_refunded') {
      const alreadyRefunded = safeCents(current.refund_amount_cents);
      if (alreadyRefunded === requestedRefund) {
        return completeRecoveredRefund(operation, current, requestedRefund);
      }
      if (operation?.status === 'pending') {
        await refundOperations.markManualReview(
          operation,
          `Order is already partially refunded by ${alreadyRefunded} cents; requested ${requestedRefund}`,
        );
      }
      throw createError('Order already has a partial refund; further refunds require reconciliation', 409);
    }

    if (current.payment_status !== 'paid') {
      if (operation?.status === 'pending') {
        await refundOperations.markManualReview(
          operation,
          `Order payment state is ${current.payment_status || 'unknown'}`,
        );
      }
      throw createError('Order has not been paid', 400);
    }

    if (!operation) {
      operation = await refundOperations.ensure({
        orderId,
        amountCents: requestedRefund,
        reason,
      });
    }
    operation = (await refundOperations.markAttempt(operation)) || operation;

    const isPartial = requestedRefund < total;
    const allocation = await resolveOrderPaymentAllocation(current);
    const { walletRefundCents, stripeRefundCents } = splitRefundAcrossPaymentSources(
      requestedRefund,
      allocation,
    );

    if (walletRefundCents > 0) {
      if (!current.customer_id) {
        throw createError('Cannot restore wallet funds because the order has no customer', 409);
      }
      await walletService.applyWalletDelta({
        customerId: current.customer_id,
        amountCents: walletRefundCents,
        type: 'refund_credit',
        idempotencyKey: `refund_credit:${orderId}:${requestedRefund}`,
        projectRef: current.project_ref,
        referenceType: 'order',
        referenceId: orderId,
        metadata: {
          reason: reason || null,
          isPartial,
          walletRefundCents,
          stripeRefundCents,
        },
      });
    }

    if (stripeRefundCents > 0) {
      await createRefund(current.payment_intent_id, stripeRefundCents, {
        idempotencyKey: `order_refund:${orderId}:${requestedRefund}:stripe`,
      });
    }

    const reversal = await reverseVendorTransferForOrderRefund(current, {
      refundAmountCents: requestedRefund,
    });
    if (reversal?.ok === false) {
      const err = new Error(`Vendor transfer reversal failed: ${reversal.error || 'unknown error'}`);
      err.statusCode = 502;
      throw err;
    }

    // If Stripe actually reversed an already-completed Connect transfer, persist
    // that movement before committing the local order refund. A crash after the
    // Stripe call is recoverable because both the refund and transfer reversal
    // use deterministic idempotency keys, while this ledger is unique by the
    // durable refund-operation id.
    await transferReversalLedger.recordCompletedTransferReversal({
      order: current,
      refundOperation: operation,
      reversalResult: reversal,
    });

    await orderModel.applyRefund(orderId, {
      amountCents: requestedRefund,
      reason,
      isPartial,
    });

    const result = {
      refundAmount: requestedRefund,
      walletRefundCents,
      stripeRefundCents,
      idempotent: false,
    };

    await refundOperations.markCompleted(operation);
    await runPostRefundSideEffects(current, audit, result, reason);
    return result;
  } catch (err) {
    if (operation?.status === 'pending') {
      await refundOperations.recordFailure(operation, err).catch((recordErr) => {
        logger.error('Failed to persist refund recovery error', {
          orderId,
          operationId: operation?.id || null,
          error: recordErr.message,
        });
      });
    }
    throw err;
  } finally {
    await releaseLock(lock);
  }
}

module.exports = {
  executeOrderRefund,
  resolveOrderPaymentAllocation,
  splitRefundAcrossPaymentSources,
  runPostRefundSideEffects,
  completeRecoveredRefund,
};