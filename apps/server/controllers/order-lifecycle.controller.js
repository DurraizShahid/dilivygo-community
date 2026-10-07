'use strict';

const orderModel = require('../models/order.model');
const deliveryModel = require('../models/delivery.model');
const vendorSettingsModel = require('../models/vendor-settings.model');
const notificationService = require('../services/notification.service');
// Commercial: rider earnings ledger is not part of the Community Edition.
// The guarded require keeps this controller loadable; the call site below
// additionally checks `updatedDelivery.rider_id`, which is always null in CE.
let earningsService = null;
try {
  earningsService = require('../services/rider-earnings.service');
} catch {
  earningsService = null;
}
const wsServer = require('../websocket/ws-server');
const { supabaseFetch } = require('../lib/supabase');
const { writeAuditLog } = require('../lib/audit');
const { resolveAuditOrgId } = require('../lib/audit-org');
const { createError } = require('../middleware/error.middleware');
const { getCallerId, getCallerRole } = require('../middleware/auth.middleware');
const logger = require('../lib/logger');

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function normalizedId(value) {
  return value == null || String(value).trim() === '' ? null : String(value);
}

async function rpc(name, body) {
  return supabaseFetch(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function acceptOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { prepTimeMinutes } = req.body;
    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));
    if (String(order.project_ref) !== String(req.projectRef)) {
      return next(createError('Access denied', 403));
    }
    if (order.status === 'accepted') {
      return res.json({ order, idempotent: true });
    }
    if (order.status !== 'placed') {
      return next(createError(`Cannot accept order with status: ${order.status}`, 409));
    }

    const settings = order.shop_id
      ? await vendorSettingsModel.findByShopId(order.shop_id)
      : await vendorSettingsModel.findByProjectRef(req.projectRef);
    const prepTime = Math.max(
      1,
      Math.min(1440, Number(prepTimeMinutes || settings?.default_prep_time_minutes || 20)),
    );

    const updated = firstRow(await rpc('accept_order_atomic', {
      p_order_id: id,
      p_prep_time_minutes: prepTime,
    }));
    if (!updated) {
      return next(createError('Order changed while acceptance was being processed. Refresh and try again.', 409));
    }

    res.json({ order: updated });

    setImmediate(() => {
      Promise.resolve()
        .then(async () => {
          wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(
            updated.project_ref,
            updated.customer_id || null,
            {
              type: 'order:status_changed',
              orderId: updated.id,
              status: 'accepted',
              previousStatus: 'placed',
              updatedAt: updated.updated_at || new Date().toISOString(),
            },
          );

          if (updated.customer_id) {
            await notificationService.notifyOrderStatusChange(updated, updated.customer_id);
          }

          await writeAuditLog({
            userId: getCallerId(req),
            action: 'order.accepted',
            resourceType: 'order',
            resourceId: updated.id,
            details: { prepTimeMinutes: prepTime },
            ip: req.ip,
            organizationId: await resolveAuditOrgId({
              order: updated,
              projectRef: updated.project_ref,
            }),
          });
        })
        .catch((err) => logger.error('Order accept post-commit side effect failed', {
          orderId: id,
          error: err.message,
        }));
    });
  } catch (err) {
    next(err);
  }
}

async function completeOrder(req, res, next) {
  try {
    const { id } = req.params;
    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));

    const delivery = await deliveryModel.findByOrderId(id);
    if (!delivery) return next(createError('No delivery found for this order', 400));

    const callerRole = getCallerRole(req);
    if (callerRole === 'rider') {
      if (!delivery.rider_id || String(delivery.rider_id) !== String(req.user.id)) {
        return next(createError('This delivery is not assigned to you', 403));
      }

      if (req.user?.isPlatformRider) {
        const riderOrg = normalizedId(
          req.organizationId || req.user?.organizationId || req.user?.organization_id,
        );
        const orderOrg = normalizedId(order.organization_id || order.organizationId);
        if (!riderOrg || !orderOrg || riderOrg !== orderOrg) {
          return next(createError('Access denied', 403));
        }
      } else if (String(order.project_ref) !== String(req.projectRef)) {
        return next(createError('Access denied', 403));
      }
    } else if (String(order.project_ref) !== String(req.projectRef)) {
      return next(createError('Access denied', 403));
    }

    if (delivery.status === 'delivered' && order.status === 'completed') {
      return res.json({ order, idempotent: true });
    }
    if (delivery.status !== 'arrived') {
      return next(createError(`Cannot complete order — delivery status is: ${delivery.status}`, 409));
    }

    // The delivery DB trigger changes order arrived -> completed in this SAME
    // transaction. Do not issue a second order update afterwards.
    const updatedDelivery = firstRow(await rpc('compare_and_set_delivery_status', {
      p_delivery_id: delivery.id,
      p_expected_status: 'arrived',
      p_new_status: 'delivered',
    }));
    if (!updatedDelivery) {
      return next(createError('Delivery changed while completion was being processed. Refresh and try again.', 409));
    }

    const updatedOrder = await orderModel.findById(id);
    if (!updatedOrder || updatedOrder.status !== 'completed') {
      throw createError('Order completion invariant failed', 500);
    }

    if (updatedDelivery.rider_id && earningsService) {
      earningsService.recordDeliveryFeeEarning({
        riderId: updatedDelivery.rider_id,
        projectRef: updatedOrder.project_ref,
        orderId: updatedOrder.id,
        deliveryId: updatedDelivery.id,
        deliveryFeeCents: updatedOrder.delivery_fee_cents || 0,
      }).catch((err) => logger.error('Completion earning recording failed', {
        deliveryId: updatedDelivery.id,
        error: err.message,
      }));
    }

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(
      updatedOrder.project_ref,
      updatedOrder.customer_id || null,
      {
        type: 'order:status_changed',
        orderId: updatedOrder.id,
        status: 'completed',
        previousStatus: order.status,
        updatedAt: updatedOrder.updated_at || new Date().toISOString(),
      },
    );

    if (updatedOrder.customer_id) {
      notificationService.notifyOrderCompleted(updatedOrder, updatedOrder.customer_id).catch((err) =>
        logger.error('Order completion notification failed', { orderId: id, error: err.message }),
      );
    }

    await writeAuditLog({
      userId: getCallerId(req),
      action: 'order.completed',
      resourceType: 'order',
      resourceId: id,
      details: { deliveryId: updatedDelivery.id },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({
        order: updatedOrder,
        projectRef: updatedOrder.project_ref,
      }),
    });

    return res.json({ order: updatedOrder });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptOrder, completeOrder };
