'use strict';

const orderModel = require('../models/order.model');
const notificationService = require('../services/notification.service');
// Commercial: the dispatch engine is not part of the Community Edition.
// Guarded require keeps this controller loadable; in CE the function
// is always null (no rider fleet), so ready orders simply skip dispatch.
let dispatchReadyOrderIfNeeded = null;
try {
  ({ dispatchReadyOrderIfNeeded } = require('../services/ready-order-dispatch.service'));
} catch {
  dispatchReadyOrderIfNeeded = null;
}
const wsServer = require('../websocket/ws-server');
const { writeAuditLog } = require('../lib/audit');
const { resolveAuditOrgId } = require('../lib/audit-org');
const { createError } = require('../middleware/error.middleware');
const { getCallerId } = require('../middleware/auth.middleware');
const logger = require('../lib/logger');

/**
 * Staff order-state mutation with optimistic concurrency.
 *
 * `validateTransition` gives a useful client error for the state we observed;
 * `compareAndSetStatus` then makes that observation part of the write. If a
 * competing request wins first, this endpoint returns 409 instead of
 * overwriting the newer state or surfacing a database-trigger exception as a
 * generic 500.
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await orderModel.findById(
      id,
      'id,project_ref,organization_id,customer_id,shop_id,status,pos_checkout_mode,updated_at',
    );
    if (!order) return next(createError('Order not found', 404));
    if (String(order.project_ref) !== String(req.projectRef)) {
      return next(createError('Access denied', 403));
    }

    const previousStatus = order.status;
    if (previousStatus === status) {
      return res.json({ order, idempotent: true });
    }

    try {
      orderModel.validateTransition(previousStatus, status, {
        posCheckoutMode: order.pos_checkout_mode,
      });
    } catch (err) {
      err.statusCode = 409;
      err.code = 'INVALID_ORDER_TRANSITION';
      throw err;
    }

    const updated = await orderModel.compareAndSetStatus(id, previousStatus, status);
    if (!updated) {
      return next(createError(
        'Order changed while this update was being processed. Refresh and try again.',
        409,
      ));
    }

    // Send the committed state to the caller before non-critical side effects.
    res.json({ order: updated });

    setImmediate(() => {
      Promise.resolve()
        .then(async () => {
          if (status === 'ready' && updated.pos_checkout_mode !== 'kitchen' && dispatchReadyOrderIfNeeded) {
            await dispatchReadyOrderIfNeeded(updated);
          }

          wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(
            order.project_ref,
            order.customer_id || null,
            {
              type: 'order:status_changed',
              orderId: id,
              status,
              previousStatus,
              updatedAt: updated.updated_at || new Date().toISOString(),
            },
          );

          if (order.customer_id) {
            await notificationService.notifyOrderStatusChange(updated, order.customer_id);
          }

          await writeAuditLog({
            userId: getCallerId(req),
            action: 'order.status_changed',
            resourceType: 'order',
            resourceId: id,
            details: { from: previousStatus, to: status },
            ip: req.ip,
            organizationId: await resolveAuditOrgId({
              order: updated,
              projectRef: order.project_ref,
            }),
          });
        })
        .catch((err) => {
          logger.error('Order status post-commit side effect failed', {
            orderId: id,
            from: previousStatus,
            to: status,
            error: err.message,
          });
        });
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateOrderStatus };
