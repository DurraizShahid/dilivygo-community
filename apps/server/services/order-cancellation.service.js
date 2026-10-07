'use strict';

const orderModel = require('../models/order.model');
const customerModel = require('../models/customer.model');
const deliveryModel = require('../models/delivery.model');
const notificationService = require('./notification.service');
const { executeOrderRefund } = require('./order-refund.service');
const wsServer = require('../websocket/ws-server');
const { writeAuditLog } = require('../lib/audit');
const { resolveAuditOrgId } = require('../lib/audit-org');
const { createError } = require('../middleware/error.middleware');
const logger = require('../lib/logger');

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

/**
 * Reconciles the refund for a cancelled paid order.
 *
 * Calls canonical executeOrderRefund (handles Stripe, internal wallet, mixed allocation,
 * vendor transfer reversals, and durable recovery).
 *
 * If the refund fails, logs the error and throws an operational error indicating
 * that the order is cancelled, but refund reconciliation failed and will resume on retry.
 */
async function reconcileCancellationRefund(order, options = {}) {
  if (order.payment_status !== 'paid' || !order.payment_intent_id) {
    return { refunded: false, order };
  }

  try {
    const refundResult = await executeOrderRefund(
      order,
      { amountCents: null, reason: options.reason || 'Order cancelled' },
      { userId: options.userId, ip: options.ip, orderId: order.id },
    );
    const refreshed = (await orderModel.findWithItems(order.id)) || {
      ...order,
      payment_status: 'refunded',
    };
    return { refunded: true, refundResult, order: refreshed };
  } catch (refundErr) {
    logger.error('Cancellation refund reconciliation failed', {
      orderId: order.id,
      error: refundErr.message,
      code: refundErr.code,
    });
    const err = createError(
      `Order cancelled, but refund reconciliation failed: ${refundErr.message || 'Payment provider error'}. Retry to resume refund.`,
      refundErr.statusCode || 502,
    );
    err.code = refundErr.code || 'REFUND_FAILED';
    err.orderCancelled = true;
    err.orderId = order.id;
    err.originalError = refundErr;
    throw err;
  }
}

/**
 * Performs operational fulfillment cancellation and notifications.
 *
 * Sequence:
 *   1. Terminate active delivery row
 *   2. Notify assigned rider if applicable
 *   3. Broadcast order cancellation state to customer and workspace via WS
 *   4. Record cancellation audit log
 *   5. Best-effort customer cancellation email
 *
 * Each operation is isolated so a failure in one (e.g. email or WS) does NOT
 * prevent fulfillment termination, audit logging, or subsequent refund reconciliation.
 */
async function performOperationalCancellationSideEffects(order, options = {}) {
  const { previousStatus, reason, initiator, userId, ip, auditAction, organizationId } = options;

  // 1. Terminate active delivery and notify assigned rider
  try {
    const activeDelivery = await deliveryModel.cancelForOrder(order.id);
    if (activeDelivery?.rider_id) {
      try {
        wsServer.sendToUser(activeDelivery.rider_id, {
          type: 'delivery:cancelled',
          deliveryId: activeDelivery.id,
          orderId: order.id,
          reason: reason || 'Order cancelled',
        });
      } catch (wsErr) {
        logger.error('Failed to notify rider of cancelled delivery', {
          orderId: order.id,
          deliveryId: activeDelivery.id,
          error: wsErr.message,
        });
      }
    }
  } catch (deliveryErr) {
    logger.error('Failed to cleanup delivery on order cancel', {
      orderId: order.id,
      error: deliveryErr.message,
    });
  }

  // 2. Broadcast order status change to workspace and customer
  try {
    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(
      order.project_ref,
      order.customer_id || null,
      {
        type: 'order:status_changed',
        orderId: order.id,
        status: 'cancelled',
        previousStatus: previousStatus || 'unknown',
        updatedAt: order.updated_at || new Date().toISOString(),
      },
    );
  } catch (wsErr) {
    logger.error('Failed to broadcast cancellation WS event', {
      orderId: order.id,
      error: wsErr.message,
    });
  }

  // 3. Write cancellation audit log (distinct business event from refund audit)
  try {
    const auditOrgId =
      organizationId ||
      (await resolveAuditOrgId({
        order,
        projectRef: order.project_ref,
      }));

    await writeAuditLog({
      userId: userId || null,
      action: auditAction || 'order.cancelled',
      resourceType: 'order',
      resourceId: order.id,
      details: {
        reason: reason || null,
        previousStatus: previousStatus || null,
        initiator: initiator || 'system',
      },
      ip,
      organizationId: auditOrgId,
    });
  } catch (auditErr) {
    logger.error('Failed to write cancellation audit log', {
      orderId: order.id,
      error: auditErr.message,
    });
  }

  // 4. Best-effort customer cancellation email
  if (order.customer_id) {
    try {
      const customer = await customerModel.findById(order.customer_id);
      if (customer?.email) {
        notificationService
          .sendCancellationEmail(customer.email, order, reason)
          .catch((err) =>
            logger.error('Cancellation email failed', { orderId: order.id, error: err.message }),
          );
      }
    } catch (notifyErr) {
      logger.error('Failed to notify customer on cancel', {
        orderId: order.id,
        error: notifyErr.message,
      });
    }
  }
}

/**
 * Backward-compatible helper for callers or tests expecting attemptOrderRefund.
 */
async function attemptOrderRefund(order, { reason, userId, ip }) {
  if (order.payment_status !== 'paid' || !order.payment_intent_id) return null;
  return executeOrderRefund(
    order,
    { amountCents: null, reason },
    { userId, ip, orderId: order.id },
  );
}

/**
 * Canonical Order Cancellation Lifecycle
 *
 * Coordinates the full cancellation business transaction:
 *   1. Verifies order exists
 *   2. Handles already-cancelled idempotency and resumes incomplete refunds / repairs missing cleanup
 *   3. Enforces authoritative status transition model
 *   4. Performs optimistic concurrency update using expectedStatus (409 if modified)
 *   5. Executes operational cancellation side effects (delivery cleanup, rider WS, customer WS, audit, email)
 *   6. Reconciles payment refund via executeOrderRefund
 *   7. Returns refreshed order
 */
async function cancelOrderLifecycle(orderId, options = {}) {
  let currentOrder = options.order || (await orderModel.findWithItems(orderId));
  if (!currentOrder) {
    throw createError('Order not found', 404);
  }

  // ─── Already Cancelled (Idempotent / Recovery Path) ──────────────────────
  if (currentOrder.status === 'cancelled') {
    // 1. Repair any missing delivery cleanup idempotently (e.g. if a prior crash
    //    interrupted delivery cleanup after the DB status commit).
    try {
      const activeDelivery = await deliveryModel.cancelForOrder(orderId);
      if (activeDelivery?.rider_id) {
        try {
          wsServer.sendToUser(activeDelivery.rider_id, {
            type: 'delivery:cancelled',
            deliveryId: activeDelivery.id,
            orderId,
            reason: options.reason || currentOrder.cancellation_reason || 'Order cancelled',
          });
        } catch (wsErr) {
          logger.error('Failed to notify rider of cancelled delivery on retry', {
            orderId,
            deliveryId: activeDelivery.id,
            error: wsErr.message,
          });
        }
      }
    } catch (deliveryErr) {
      logger.error('Failed to cleanup delivery on cancel retry', {
        orderId,
        error: deliveryErr.message,
      });
    }

    // 2. Resume incomplete refund reconciliation if order is paid
    const refundOutcome = await reconcileCancellationRefund(currentOrder, {
      ...options,
      reason: options.reason || currentOrder.cancellation_reason || 'Order cancelled',
    });
    const finalOrder = refundOutcome.order || (await orderModel.findWithItems(orderId)) || currentOrder;

    return { ok: true, idempotent: true, order: finalOrder };
  }

  // ─── Status Transition Validation ─────────────────────────────────────────
  if (typeof options.validate === 'function') {
    options.validate(currentOrder);
  } else {
    try {
      orderModel.validateTransition(currentOrder.status, 'cancelled');
    } catch (e) {
      throw createError(`Cannot cancel order with status: ${currentOrder.status}`, 400);
    }
  }

  // ─── Optimistic Concurrency Update ────────────────────────────────────────
  const effectiveInitiator = options.initiator || options.userId || 'system';
  const cancelledRows = await orderModel.cancel(orderId, {
    reason: options.reason,
    initiator: effectiveInitiator,
    expectedStatus: currentOrder.status,
  });
  const cancelled = firstRow(cancelledRows);
  if (!cancelled) {
    throw createError(
      'Order changed while cancellation was being processed. Refresh and try again.',
      409,
    );
  }

  let cancelledOrder = (await orderModel.findWithItems(orderId)) || {
    ...currentOrder,
    ...cancelled,
    status: 'cancelled',
  };

  // ─── Operational Cancellation Side Effects ────────────────────────────────
  // Run fulfillment termination, delivery cleanup, rider notification, WS broadcast,
  // cancellation audit log, and best-effort customer email INDEPENDENTLY of refund success.
  await performOperationalCancellationSideEffects(cancelledOrder, {
    previousStatus: currentOrder.status,
    reason: options.reason,
    initiator: effectiveInitiator,
    userId: options.userId,
    ip: options.ip,
    auditAction: options.auditAction,
    organizationId: options.organizationId,
  });

  // ─── Payment Refund Reconciliation ────────────────────────────────────────
  // If order was paid, execute full refund. If it fails, surfaces clear error
  // indicating that cancellation committed, but refund reconciliation failed and will resume on retry.
  const refundOutcome = await reconcileCancellationRefund(cancelledOrder, options);
  if (refundOutcome.order) {
    cancelledOrder = refundOutcome.order;
  }

  return { ok: true, order: cancelledOrder };
}

module.exports = {
  cancelOrderLifecycle,
  performOperationalCancellationSideEffects,
  reconcileCancellationRefund,
  attemptOrderRefund,
};
