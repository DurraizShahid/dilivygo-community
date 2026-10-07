'use strict';

const orderModel = require('../models/order.model');
const customerModel = require('../models/customer.model');
const deliveryModel = require('../models/delivery.model');
const notificationService = require('../services/notification.service');
const { executeOrderRefund } = require('../services/order-refund.service');
const wsServer = require('../websocket/ws-server');
const { writeAuditLog } = require('../lib/audit');
const { resolveAuditOrgId } = require('../lib/audit-org');
const { createError } = require('../middleware/error.middleware');
const { getCallerId, getCallerRole } = require('../middleware/auth.middleware');
const { cancelOrderLifecycle } = require('../services/order-cancellation.service');
const logger = require('../lib/logger');

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

async function refundTerminalPaidOrder(order, req, reason) {
  if (order.payment_status !== 'paid' || !order.payment_intent_id) return null;
  return executeOrderRefund(
    order,
    { amountCents: null, reason },
    { userId: getCallerId(req), ip: req.ip, orderId: order.id },
  );
}

async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason, initiator } = req.body;
    const order = await orderModel.findWithItems(id);
    if (!order) return next(createError('Order not found', 404));

    const callerRole = getCallerRole(req);
    if (callerRole === 'customer') {
      if (order.customer_id !== req.customer.id) return next(createError('Access denied', 403));
    } else if (order.project_ref !== req.projectRef) {
      return next(createError('Access denied', 403));
    }

    const effectiveInitiator = callerRole === 'customer'
      ? 'customer'
      : (initiator || callerRole || 'system');

    const result = await cancelOrderLifecycle(id, {
      order,
      reason,
      initiator: effectiveInitiator,
      userId: getCallerId(req),
      ip: req.ip,
      auditAction: 'order.cancelled',
      validate: (ord) => {
        if (!orderModel.isCancellable(ord)) {
          throw createError(`Cannot cancel order with status: ${ord.status}`, 400);
        }
      },
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function rejectOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    let order = await orderModel.findWithItems(id);
    if (!order) return next(createError('Order not found', 404));
    if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));

    if (order.status === 'rejected') {
      if (order.payment_status === 'paid') {
        await refundTerminalPaidOrder(order, req, reason || order.rejection_reason || 'Order rejected');
        order = await orderModel.findWithItems(id);
      }
      return res.json({ order, idempotent: true });
    }

    if (order.status !== 'placed') {
      return next(createError(`Cannot reject order with status: ${order.status}`, 400));
    }

    const rejected = firstRow(await orderModel.reject(id, reason, { expectedStatus: 'placed' }));
    if (!rejected) {
      return next(createError('Order changed while rejection was being processed. Refresh and try again.', 409));
    }

    const rejectedOrder = (await orderModel.findWithItems(id)) || { ...order, ...rejected, status: 'rejected' };
    await refundTerminalPaidOrder(rejectedOrder, req, reason || 'Order rejected');

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(
      rejectedOrder.project_ref,
      rejectedOrder.customer_id || null,
      {
        type: 'order:rejected',
        orderId: id,
        reason: reason || null,
        updatedAt: rejectedOrder.updated_at || new Date().toISOString(),
      },
    );

    if (rejectedOrder.customer_id) {
      notificationService
        .notifyOrderRejected(rejectedOrder, rejectedOrder.customer_id, reason)
        .catch((err) => logger.error('Order rejected notification failed', { orderId: id, error: err.message }));
    }

    await writeAuditLog({
      userId: getCallerId(req),
      action: 'order.rejected',
      resourceType: 'order',
      resourceId: id,
      details: { reason },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({ order: rejectedOrder, projectRef: rejectedOrder.project_ref }),
    });

    return res.json({ order: await orderModel.findWithItems(id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { cancelOrder, rejectOrder };
