'use strict';

const orderModel = require('../models/order.model');
const cartModel = require('../models/cart.model');
const deliveryModel = require('../models/delivery.model');
const userModel = require('../models/user.model');
const vendorSettingsModel = require('../models/vendor-settings.model');
const { v4: uuidv4 } = require('uuid');
const { createRefund } = require('../services/stripe.service');
// Commercial: Connect transfer reversals are not in CE (see order-refund.service.js).
let reverseVendorTransferForOrderRefund = async () => ({ ok: true, skipped: true });
try {
  ({ reverseVendorTransferForOrderRefund } = require('../services/vendor-payout.service'));
} catch {
  // commercial module absent in CE — fallback above applies
}
const { executeOrderRefund } = require('../services/order-refund.service');
const platformSettings = require('../models/platform-settings.model');
const notificationService = require('../services/notification.service');
const wsServer = require('../websocket/ws-server');
const { writeAuditLog } = require('../lib/audit');
const { resolveAuditOrgId } = require('../lib/audit-org');
const { createError } = require('../middleware/error.middleware');
const { getCallerId, getCallerRole } = require('../middleware/auth.middleware');
const { select, insert, update, remove } = require('../lib/supabase');
const {
  parseRangeDays,
  getRangeBounds,
  toDayKey,
  toHourLabel,
  buildDaySeries,
  pctChange,
  round,
} = require('../lib/analytics');
const customerModel = require('../models/customer.model');
// Commercial: the dispatch engine is not part of the Community Edition.
// Guarded require keeps this controller loadable; in CE the function
// is always null (no rider fleet), so ready orders simply skip dispatch.
let dispatchReadyOrderIfNeeded = null;
try {
  ({ dispatchReadyOrderIfNeeded } = require('../services/ready-order-dispatch.service'));
} catch {
  dispatchReadyOrderIfNeeded = null;
}
const logger = require('../lib/logger');
const receiptPdfService = require('../services/receipt-pdf.service');
const { emitRefundRequestUpdated } = require('../lib/refund-request-ws');

const SESSION_COOKIE = 'cart_session';
const COOKIE_BASE = { httpOnly: true, sameSite: 'lax', path: '/' };

/** Orders where customers may open a refund request (platform policy). */
const REFUND_REQUEST_ELIGIBLE_STATUSES = new Set(['completed', 'rejected', 'cancelled']);

function mapRefundRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectRef: row.project_ref,
    orderId: row.order_id,
    customerId: row.customer_id,
    status: row.status,
    reason: row.reason,
    requestedAmountCents: row.requested_amount_cents,
    conversationId: row.conversation_id,
    internalNote: row.internal_note,
    rejectionReason: row.rejection_reason,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getOrCreateSessionId(req, res) {
  let sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie(SESSION_COOKIE, sessionId, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  return sessionId;
}

// ─── List Orders ──────────────────────────────────────────────────────────────

async function listOrders(req, res, next) {
  try {
    const { status, customerId, limit, offset, shopId } = req.query;
    const callerRole = getCallerRole(req);
    const effectiveCustomerId = callerRole === 'customer' ? req.customer.id : customerId;

    let orders;
    if (callerRole === 'customer' && req.customer?.isMarketplaceCustomer) {
      orders = await orderModel.findByCustomerId(effectiveCustomerId, {
        status,
        shopId: shopId || null,
        limit,
        offset,
      });
    } else {
      orders = await orderModel.findByProjectRef(req.projectRef, {
        status,
        customerId: effectiveCustomerId,
        shopId: shopId || null,
        limit,
        offset,
      });
    }
    return res.json({ orders });
  } catch (err) {
    next(err);
  }
}

async function getVendorAnalytics(req, res, next) {
  try {
    const rangeDays = parseRangeDays(req.query.rangeDays);
    const { start, previousStart } = getRangeBounds(rangeDays);
    const scopedShopId = req.query.shopId || null;

    const filters = { project_ref: req.projectRef };
    if (scopedShopId) filters.shop_id = scopedShopId;

    const rows = await select('orders', {
      select: 'id,status,total_cents,prep_time_minutes,created_at,order_items(quantity,name,unit_price_cents)',
      filters,
    });

    const orders = (rows || []).filter((o) => o.created_at && new Date(o.created_at) >= previousStart);
    const currentOrders = orders.filter((o) => new Date(o.created_at) >= start);
    const previousOrders = orders.filter((o) => new Date(o.created_at) < start);

    const dailyTemplate = buildDaySeries(start, new Date(), () => ({
      orders: 0,
      revenueCents: 0,
      completed: 0,
    }));
    const dailyMap = new Map(dailyTemplate.map((d) => [d.date, d]));
    const hourMap = new Map();
    const statusMap = new Map();
    const itemMap = new Map();
    const prepSamples = [];

    for (const order of currentOrders) {
      const dayKey = toDayKey(order.created_at);
      if (dayKey && dailyMap.has(dayKey)) {
        const bucket = dailyMap.get(dayKey);
        bucket.orders += 1;
        bucket.revenueCents += Number(order.total_cents || 0);
        if (order.status === 'completed') bucket.completed += 1;
      }

      const hour = toHourLabel(order.created_at);
      if (hour) hourMap.set(hour, (hourMap.get(hour) || 0) + 1);

      const status = order.status || 'unknown';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);

      if (order.prep_time_minutes && Number(order.prep_time_minutes) > 0) {
        prepSamples.push(Number(order.prep_time_minutes));
      }

      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const key = item.name || 'Unnamed item';
        const quantity = Number(item.quantity || 0);
        const revenue = quantity * Number(item.unit_price_cents || 0);
        const existing = itemMap.get(key) || { name: key, quantity: 0, revenueCents: 0 };
        existing.quantity += quantity;
        existing.revenueCents += revenue;
        itemMap.set(key, existing);
      }
    }

    const totalOrders = currentOrders.length;
    const completedOrders = currentOrders.filter((o) => o.status === 'completed').length;
    const totalRevenueCents = currentOrders.reduce((sum, o) => sum + Number(o.total_cents || 0), 0);
    const previousRevenueCents = previousOrders.reduce((sum, o) => sum + Number(o.total_cents || 0), 0);

    // Resolve the workspace's currency (via its org's `default_currency`) so
    // the vendor dashboard renders tooltips and KPI values in the correct
    // currency — the theme-provider context can fall back to GBP when the
    // project-ref header isn't propagated (e.g. in dev).
    const currencyRaw = await platformSettings.get('default_currency', {
      projectRef: req.projectRef || null,
    });
    const currencyCode = ((currencyRaw || 'GBP').toString().trim() || 'GBP').toUpperCase();

    return res.json({
      rangeDays,
      currencyCode,
      summary: {
        totalOrders,
        completedOrders,
        completionRate: round(totalOrders ? (completedOrders / totalOrders) * 100 : 0, 1),
        totalRevenueCents,
        averageOrderValueCents: Math.round(totalOrders ? totalRevenueCents / totalOrders : 0),
        averagePrepMinutes: round(
          prepSamples.length ? prepSamples.reduce((sum, value) => sum + value, 0) / prepSamples.length : 0,
          1
        ),
        orderTrendPct: round(pctChange(totalOrders, previousOrders.length), 1),
        revenueTrendPct: round(pctChange(totalRevenueCents, previousRevenueCents), 1),
      },
      series: {
        ordersByDay: Array.from(dailyMap.values()),
        peakHours: Array.from(hourMap.entries())
          .map(([hour, ordersCount]) => ({ hour, orders: ordersCount }))
          .sort((a, b) => a.hour.localeCompare(b.hour)),
        statusBreakdown: Array.from(statusMap.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
        popularItems: Array.from(itemMap.values())
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 8),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Get Order ────────────────────────────────────────────────────────────────

async function getOrder(req, res, next) {
  try {
    const order = await orderModel.findWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const callerRole = getCallerRole(req);
    if (callerRole === 'customer') {
      if (order.customer_id !== req.customer.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (order.project_ref !== req.projectRef) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Include delivery, vendor, and shop for rating/tip UI
    const shopModel = require('../models/shop.model');
    const [delivery, vendorUsers, shop] = await Promise.all([
      deliveryModel.findByOrderId(req.params.id),
      userModel.findByProjectRef(order.project_ref, 'vendor'),
      order.shop_id ? shopModel.findById(order.shop_id) : null,
    ]);
    const { mapShop } = require('../lib/case');
    const orderResponse = { ...order };
    if (shop) {
      orderResponse.shop = mapShop(shop);
    }
    if (delivery) {
      orderResponse.delivery = {
        id: delivery.id,
        riderId: delivery.rider_id,
        status: delivery.status,
      };
    }
    if (vendorUsers?.length) {
      orderResponse.vendorId = vendorUsers[0].id;
    }

    return res.json({ order: orderResponse });
  } catch (err) {
    next(err);
  }
}

async function reorderOrder(req, res, next) {
  try {
    if (getCallerRole(req) !== 'customer' || !req.customer?.id) {
      return res.status(403).json({ error: 'Only customers can reorder' });
    }

    const order = await orderModel.findWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.customer.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
    if (!orderItems.length) return res.status(400).json({ error: 'Order has no items to reorder' });

    const sessionId = getOrCreateSessionId(req, res);
    const clearExisting = req.body.clearExisting !== false;
    const shopProjectRef = order.project_ref;
    const existingSession = (await select('cart_sessions', {
      filters: { id: sessionId },
      limit: 1,
    }))?.[0];

    if (!existingSession) {
      await insert('cart_sessions', {
        id: sessionId,
        customer_id: req.customer.id,
        project_ref: shopProjectRef,
        shop_id: order.shop_id || null,
        created_at: new Date().toISOString(),
      });
    } else {
      const scopeChanged =
        existingSession.project_ref !== shopProjectRef ||
        (order.shop_id && existingSession.shop_id !== order.shop_id);

      if (scopeChanged && !clearExisting) {
        return res.status(409).json({
          error: 'Cart contains items from another shop',
          requiresClear: true,
        });
      }

      if (scopeChanged) {
        await remove('cart_items', { session_id: sessionId });
      }

      await update('cart_sessions', {
        customer_id: req.customer.id,
        project_ref: shopProjectRef,
        shop_id: order.shop_id || existingSession.shop_id || null,
      }, { id: sessionId });
    }

    let addedItems = 0;
    for (const item of orderItems) {
      const quantity = Number(item.quantity || 0);
      const unitPriceCents = Number(item.unit_price_cents || 0);
      if (quantity <= 0 || unitPriceCents <= 0) continue;
      const rawMods = item.order_item_modifiers || item.orderItemModifiers;
      const selectedModifiers = Array.isArray(rawMods)
        ? rawMods.map((m) => ({
            modifierOptionId: m.modifier_option_id ?? m.modifierOptionId,
            groupName: m.group_name ?? m.groupName,
            optionName: m.option_name ?? m.optionName,
            priceCents: Number(m.price_cents ?? m.priceCents ?? 0),
          }))
        : undefined;
      await cartModel.addItem(sessionId, {
        productId: item.product_id || undefined,
        productVariantId: item.product_variant_id || item.productVariantId || undefined,
        name: item.name || 'Item',
        quantity,
        unitPriceCents,
        notes: item.notes || undefined,
        selectedModifiers,
        shopId: order.shop_id || undefined,
        projectRef: shopProjectRef,
        shopName: undefined,
      });
      addedItems += 1;
    }

    const cart = await cartModel.getWithItems(sessionId);
    return res.json({ ok: true, addedItems, cart });
  } catch (err) {
    next(err);
  }
}

// ─── Create Order (internal — called from Stripe webhook) ────────────────────

async function createOrder(req, res, next) {
  try {
    const { items, totalCents, paymentIntentId, scheduledFor, customerId } = req.body;
    const shopId = req.body.shopId || req.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID is required' });
    }

    const order = await orderModel.createWithItems({
      projectRef: req.projectRef,
      shopId,
      customerId,
      items,
      totalCents,
      paymentIntentId,
      scheduledFor,
    });

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(req.projectRef, customerId || null, {
      type: 'order:status_changed',
      orderId: order.id,
      status: order.status,
      previousStatus: null,
      updatedAt: order.updated_at,
    });

    // Send order confirmation to customer + notify vendor
    notificationService.notifyOrderConfirmation(order).catch((err) =>
      logger.error('Order confirmation notification failed', { orderId: order.id, error: err.message })
    );
    if (order.status === 'placed') {
      notificationService.notifyShopStaffNewOrder(order).catch((err) =>
        logger.error('Vendor new-order notification failed', { orderId: order.id, error: err.message })
      );
    }

    // Auto-accept if vendor setting enabled
    try {
      const settings = order.shop_id
        ? await vendorSettingsModel.findByShopId(order.shop_id)
        : await vendorSettingsModel.findByProjectRef(req.projectRef);
      if (settings?.auto_accept && order.status === 'placed') {
        const prepTime = settings.default_prep_time_minutes || 20;
        await orderModel.updateStatus(order.id, 'accepted');
        await orderModel.setSlaDeadline(order.id, prepTime);

        wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(req.projectRef, customerId || null, {
          type: 'order:status_changed',
          orderId: order.id,
          status: 'accepted',
          previousStatus: 'placed',
          updatedAt: new Date().toISOString(),
        });

        if (customerId) {
          const acceptedOrder = { ...order, status: 'accepted' };
          await notificationService.notifyOrderStatusChange(acceptedOrder, customerId);
        }
      }
    } catch (autoAcceptErr) {
      logger.error('Auto-accept failed', { orderId: order.id, error: autoAcceptErr.message });
    }

    return res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

async function createPosOrder(req, res, next) {
  try {
    const { items, totalCents, paymentMethod, note, checkoutMode } = req.body;
    const shopId = req.shopId || req.body.shopId;

    const { assertOrderItemsPricedForShop } = require('../services/order-line-pricing.service');
    if (shopId && items?.length) {
      await assertOrderItemsPricedForShop({
        shopId,
        projectRef: req.projectRef,
        items,
        allowUnavailable: true,
      });
    }

    const computedTotal = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPriceCents || 0),
      0
    );
    const effectiveTotalCents = Number(totalCents || computedTotal);
    if (!Number.isFinite(effectiveTotalCents) || effectiveTotalCents <= 0) {
      return res.status(400).json({ error: 'Order total must be greater than 0' });
    }
    if (totalCents && totalCents !== computedTotal) {
      return res.status(400).json({ error: 'Order total mismatch' });
    }

    const order = await orderModel.createWithItems({
      projectRef: req.projectRef,
      shopId,
      items,
      totalCents: effectiveTotalCents,
      notes: note || null,
      posCheckoutMode: checkoutMode,
    });

    await orderModel.updateById(order.id, {
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    });

    const savedOrder = await orderModel.findWithItems(order.id);

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(req.projectRef, savedOrder.customer_id || null, {
      type: 'order:status_changed',
      orderId: savedOrder.id,
      status: savedOrder.status,
      previousStatus: null,
      updatedAt: savedOrder.updated_at,
    });

    await writeAuditLog({
      userId: getCallerId(req),
      action: 'order.pos_created',
      resourceType: 'order',
      resourceId: savedOrder.id,
      details: {
        shopId,
        paymentMethod,
        checkoutMode,
        totalCents: effectiveTotalCents,
        itemCount: items.length,
      },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({ order: savedOrder, projectRef: req.projectRef }),
    });

    return res.status(201).json({ order: savedOrder });
  } catch (err) {
    next(err);
  }
}

// ─── Update Order Status ──────────────────────────────────────────────────────

async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await orderModel.findById(
      id,
      'id,project_ref,customer_id,shop_id,status,pos_checkout_mode',
    );
    if (!order) return next(createError('Order not found', 404));
    if (!(getCallerRole(req) === 'rider' && req.user?.isPlatformRider) && order.project_ref !== req.projectRef) {
      return next(createError('Access denied', 403));
    }

    const previousStatus = order.status;
    if (previousStatus === status) {
      return res.json({ order, idempotent: true });
    }
    orderModel.validateTransition(previousStatus, status, {
      posCheckoutMode: order.pos_checkout_mode,
    });
    const updatedRows = await orderModel.updateStatus(id, status);
    const updatedOrder = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    const responseOrder = updatedOrder || order;
    res.json({ order: responseOrder });

    setImmediate(() => {
      try {
        if (status === 'ready' && responseOrder && responseOrder.pos_checkout_mode !== 'kitchen' && dispatchReadyOrderIfNeeded) {
          dispatchReadyOrderIfNeeded(responseOrder).catch((err) =>
            logger.error('Ready-order dispatch failed', { orderId: id, error: err.message }),
          );
        }

        wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
          type: 'order:status_changed',
          orderId: id,
          status,
          previousStatus,
          updatedAt: responseOrder?.updated_at || new Date().toISOString(),
        });

        if (order.customer_id) {
          notificationService
            .notifyOrderStatusChange(responseOrder, order.customer_id)
            .catch((err) =>
              logger.error('Order status change notification failed', { orderId: id, error: err.message }),
            );
        }

        Promise.resolve()
          .then(async () => {
            const organizationId = await resolveAuditOrgId({ order, projectRef: req.projectRef });
            await writeAuditLog({
              userId: getCallerId(req),
              action: 'order.status_changed',
              resourceType: 'order',
              resourceId: id,
              details: { from: previousStatus, to: status },
              ip: req.ip,
              organizationId,
            });
          })
          .catch((err) =>
            logger.error('Order status change audit log failed', { orderId: id, error: err.message }),
          );
      } catch (err) {
        logger.error('Order status change post-response tasks failed', { orderId: id, error: err.message });
      }
    });
    return;
  } catch (err) {
    next(err);
  }
}

// ─── Refund ───────────────────────────────────────────────────────────────────

async function refundOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { amountCents, reason } = req.body;

    const order = await orderModel.findWithItems(id);
    if (!order) return next(createError('Order not found', 404));
    if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));

    const { refundAmount } = await executeOrderRefund(
      order,
      { amountCents, reason },
      { userId: getCallerId(req), ip: req.ip, orderId: id },
    );

    return res.json({ ok: true, refundAmount });
  } catch (err) {
    next(err);
  }
}

async function createRefundRequest(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { reason, requestedAmountCents, conversationId } = req.body;

    const order = await orderModel.findWithItems(orderId);
    if (!order) return next(createError('Order not found', 404));

    const enabled = await platformSettings.get('customer_refund_requests_enabled', {
      projectRef: order.project_ref,
    });
    if (enabled === 'false') {
      return next(createError('Refund requests are disabled', 403));
    }

    if (order.customer_id !== req.customer.id) {
      return next(createError('Access denied', 403));
    }
    if (order.payment_status !== 'paid') {
      return next(createError('Only paid orders can be refunded', 400));
    }
    if (!REFUND_REQUEST_ELIGIBLE_STATUSES.has(order.status)) {
      return next(
        createError('Refund can only be requested for completed, rejected, or cancelled orders', 400),
      );
    }

    const pending = await select('refund_requests', {
      filters: { order_id: orderId, status: 'pending' },
      limit: 1,
    });
    if (pending?.length) {
      return next(createError('A refund request is already pending for this order', 409));
    }

    const total = Math.max(0, Number(order.total_cents || 0));
    let reqAmount = requestedAmountCents != null ? Number(requestedAmountCents) : null;
    if (reqAmount != null) {
      if (!Number.isFinite(reqAmount) || reqAmount <= 0 || reqAmount > total) {
        return next(createError('Invalid requested amount', 400));
      }
    }

    let linkedConversationId = null;
    if (conversationId) {
      const convRows = await select('conversations', { filters: { id: conversationId }, limit: 1 });
      const conv = convRows?.[0];
      if (!conv) return next(createError('Conversation not found', 400));
      if (conv.type !== 'customer_support') {
        return next(createError('Invalid conversation', 400));
      }
      if (conv.participant_1_id !== req.customer.id) {
        return next(createError('Access denied', 403));
      }
      if (conv.project_ref !== order.project_ref) {
        return next(createError('Conversation does not match this order', 400));
      }
      linkedConversationId = conversationId;
    }

    const row = {
      id: uuidv4(),
      project_ref: order.project_ref,
      order_id: orderId,
      customer_id: req.customer.id,
      status: 'pending',
      reason,
      requested_amount_cents: reqAmount,
      conversation_id: linkedConversationId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await insert('refund_requests', [row]);

    await writeAuditLog({
      userId: req.customer.id,
      action: 'refund_request.created',
      resourceType: 'refund_request',
      resourceId: row.id,
      details: { orderId, reason },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({ order, projectRef: order.project_ref }),
    });

    emitRefundRequestUpdated({
      projectRef: order.project_ref,
      customerId: req.customer.id,
      orderId,
      refundRequestId: row.id,
      status: 'pending',
    });

    // Automation (Phase 24): refund requested. Org resolved from the order.
    try {
      const { handleAutomationEvent } = require('../services/cx-automation.service');
      if (order.organization_id) {
        await handleAutomationEvent(String(order.organization_id), 'refund.requested', {
          refundRequestId: row.id, orderId, customerId: req.customer.id,
          shopId: order.shop_id || null, amountCents: reqAmount,
        }, { eventKey: `refund-request:${row.id}` });
      }
    } catch {}

    return res.status(201).json({ refundRequest: mapRefundRequest(row) });
  } catch (err) {
    next(err);
  }
}

async function getRefundRequestForOrder(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const order = await orderModel.findById(orderId);
    if (!order) return next(createError('Order not found', 404));
    if (order.customer_id !== req.customer.id) {
      return next(createError('Access denied', 403));
    }
    const rows = await select('refund_requests', {
      filters: { order_id: orderId },
      order: 'created_at.desc',
      limit: 1,
    });
    return res.json({ refundRequest: mapRefundRequest(rows?.[0]) });
  } catch (err) {
    next(err);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

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
    if (order.status === 'cancelled') {
      return res.json({ ok: true, idempotent: true });
    }
    if (!orderModel.isCancellable(order)) {
      return next(createError(`Cannot cancel order with status: ${order.status}`, 400));
    }

    const effectiveInitiator = callerRole === 'customer' ? 'customer' : (initiator || callerRole || 'system');
    await orderModel.cancel(id, { reason, initiator: effectiveInitiator });

    // Auto-refund if already paid
    if (order.payment_status === 'paid' && order.payment_intent_id) {
      await createRefund(order.payment_intent_id);
      await reverseVendorTransferForOrderRefund(order, { refundAmountCents: order.total_cents }).catch(() => {});
      await orderModel.applyRefund(id, { amountCents: order.total_cents, reason: 'Order cancelled', isPartial: false });
    }

    // Notify customer
    if (order.customer_id) {
      const customer = await customerModel.findById(order.customer_id);
      if (customer?.email) {
        await notificationService.sendCancellationEmail(customer.email, order, reason);
      }
    }

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
      type: 'order:status_changed',
      orderId: id,
      status: 'cancelled',
      previousStatus: order.status,
      updatedAt: new Date().toISOString(),
    });

    // Cancel any associated active delivery to prevent orphaned delivery rows
    // and notify the assigned rider if one was already dispatched
    try {
      const activeDelivery = await deliveryModel.cancelForOrder(id);
      if (activeDelivery?.rider_id) {
        wsServer.sendToUser(activeDelivery.rider_id, {
          type: 'delivery:cancelled',
          deliveryId: activeDelivery.id,
          orderId: id,
          reason: reason || 'Order cancelled',
        });
      }
    } catch (deliveryErr) {
      logger.error('Failed to cleanup delivery on order cancel', { orderId: id, error: deliveryErr.message });
    }

    await writeAuditLog({
      userId: getCallerId(req),
      action: 'order.cancelled',
      resourceType: 'order',
      resourceId: id,
      details: { reason, initiator: effectiveInitiator },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({ order, projectRef: req.projectRef }),
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Reject Order ────────────────────────────────────────────────────────────

async function rejectOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));
    if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));

    if (order.status === 'rejected') {
      return res.json({ order, idempotent: true });
    }
    const updatedRows = await orderModel.reject(id, reason);
    const updatedOrder = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    res.json({ order: updatedOrder || order });

    setImmediate(() => {
      try {
        wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
          type: 'order:rejected',
          orderId: id,
          reason: reason || null,
          updatedAt: updatedOrder?.updated_at || new Date().toISOString(),
        });

        if (order.customer_id) {
          notificationService
            .notifyOrderRejected(updatedOrder, order.customer_id, reason)
            .catch((err) =>
              logger.error('Order rejected notification failed', { orderId: id, error: err.message }),
            );
        }

        Promise.resolve()
          .then(async () => {
            const organizationId = await resolveAuditOrgId({ order, projectRef: req.projectRef });
            await writeAuditLog({
              userId: getCallerId(req),
              action: 'order.rejected',
              resourceType: 'order',
              resourceId: id,
              details: { reason },
              ip: req.ip,
              organizationId,
            });
          })
          .catch((err) =>
            logger.error('Order rejected audit log failed', { orderId: id, error: err.message }),
          );
      } catch (err) {
        logger.error('Order rejected post-response tasks failed', { orderId: id, error: err.message });
      }
    });
    return;
  } catch (err) {
    next(err);
  }
}

// ─── Accept Order ────────────────────────────────────────────────────────────

async function acceptOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { prepTimeMinutes } = req.body;

    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));
    if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    if (order.status === 'accepted') {
      return res.json({ order, idempotent: true });
    }
    if (order.status !== 'placed') {
      return next(createError(`Cannot accept order with status: ${order.status}`, 400));
    }

    orderModel.validateTransition('placed', 'accepted');
    const settings = order.shop_id
      ? await vendorSettingsModel.findByShopId(order.shop_id)
      : await vendorSettingsModel.findByProjectRef(req.projectRef);
    const prepTime = prepTimeMinutes || settings?.default_prep_time_minutes || 20;
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + prepTime * 60_000).toISOString();

    const updatedOrder = await orderModel.updateById(id, {
      status: 'accepted',
      prep_time_minutes: prepTime,
      sla_deadline: deadline,
      sla_breached: false,
      updated_at: now,
    });

    res.json({ order: updatedOrder || order });

    setImmediate(() => {
      try {
        wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
          type: 'order:status_changed',
          orderId: id,
          status: 'accepted',
          previousStatus: 'placed',
          updatedAt: updatedOrder?.updated_at || now,
        });

        if (order.customer_id) {
          notificationService
            .notifyOrderStatusChange(updatedOrder, order.customer_id)
            .catch((err) =>
              logger.error('Order accepted notification failed', { orderId: id, error: err.message }),
            );
        }

        Promise.resolve()
          .then(async () => {
            const organizationId = await resolveAuditOrgId({ order, projectRef: req.projectRef });
            await writeAuditLog({
              userId: getCallerId(req),
              action: 'order.accepted',
              resourceType: 'order',
              resourceId: id,
              details: { prepTimeMinutes: prepTime },
              ip: req.ip,
              organizationId,
            });
          })
          .catch((err) =>
            logger.error('Order accepted audit log failed', { orderId: id, error: err.message }),
          );
      } catch (err) {
        logger.error('Order accepted post-response tasks failed', { orderId: id, error: err.message });
      }
    });
    return;
  } catch (err) {
    next(err);
  }
}

// ─── Complete Order ──────────────────────────────────────────────────────────

async function completeOrder(req, res, next) {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));

    const delivery = await deliveryModel.findByOrderId(id);
    if (!delivery) return next(createError('No delivery found for this order', 400));
    const callerRole = getCallerRole(req);
    if (callerRole === 'rider' && delivery.rider_id && delivery.rider_id !== req.user.id) {
      return next(createError('Access denied', 403));
    }
    if (!(callerRole === 'rider' && req.user?.isPlatformRider) && order.project_ref !== req.projectRef) {
      return next(createError('Access denied', 403));
    }
    if (delivery.status !== 'arrived') {
      return next(createError(`Cannot complete order — delivery status is: ${delivery.status}`, 400));
    }

    await deliveryModel.updateStatus(delivery.id, 'delivered');
    await orderModel.updateStatus(id, 'completed');

    const updatedOrder = await orderModel.findById(id);

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
      type: 'order:status_changed',
      orderId: id,
      status: 'completed',
      previousStatus: order.status,
      updatedAt: updatedOrder.updated_at,
    });

    if (order.customer_id) {
      await notificationService.notifyOrderCompleted(updatedOrder, order.customer_id);
    }

    await writeAuditLog({
      userId: getCallerId(req),
      action: 'order.completed',
      resourceType: 'order',
      resourceId: id,
      details: { deliveryId: delivery.id },
      ip: req.ip,
      organizationId: await resolveAuditOrgId({ order, projectRef: req.projectRef }),
    });

    return res.json({ order: updatedOrder });
  } catch (err) {
    next(err);
  }
}

// ─── Extend SLA Deadline ─────────────────────────────────────────────────────

async function extendSla(req, res, next) {
  try {
    const { id } = req.params;
    const { additionalMinutes } = req.body;

    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));
    if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    if (!['accepted', 'preparing'].includes(order.status)) {
      return next(createError('Can only extend SLA for accepted or preparing orders', 400));
    }

    const minutes = additionalMinutes || 10;
    const nowMs = Date.now();
    let baseMs = nowMs;
    if (order.sla_deadline) {
      const deadlineMs = new Date(order.sla_deadline).getTime();
      // If the deadline has passed (breached / overdue), extend from now so the new SLA is meaningful.
      baseMs = Math.max(deadlineMs, nowMs);
    }
    const newDeadline = new Date(baseMs + minutes * 60000).toISOString();

    const { update } = require('../lib/supabase');
    await update('orders', {
      sla_deadline: newDeadline,
      sla_breached: false,
      updated_at: new Date().toISOString(),
    }, { id });

    wsServer.fanOrderToWorkspaceAndMarketplaceCustomer(order.project_ref, order.customer_id || null, {
      type: 'order:status_changed',
      orderId: id,
      status: order.status,
      previousStatus: order.status,
      updatedAt: new Date().toISOString(),
    });

    if (order.customer_id) {
      await notificationService.notifyOrderStatusChange(order, order.customer_id);
    }

    return res.json({ ok: true, newDeadline });
  } catch (err) {
    next(err);
  }
}

// ─── Get Rider Location (customer-accessible) ───────────────────────────────

async function getRiderLocation(req, res, next) {
  try {
    const { id } = req.params;
    const order = await orderModel.findById(id);
    if (!order) return next(createError('Order not found', 404));

    const callerRole = getCallerRole(req);
    if (callerRole === 'customer') {
      if (order.customer_id !== req.customer.id) return next(createError('Access denied', 403));
    } else if (order.project_ref !== req.projectRef) {
      return next(createError('Access denied', 403));
    }

    const delivery = await deliveryModel.findByOrderId(id);
    if (!delivery || !delivery.rider_id) {
      return res.status(404).json({ error: 'No rider assigned yet' });
    }

    const sessionService = require('../services/session.service');
    const location = await sessionService.getRiderLocation(delivery.id);
    if (!location) return res.status(404).json({ error: 'Location not available' });

    return res.json({ location, deliveryId: delivery.id });
  } catch (err) {
    next(err);
  }
}

async function assertOrderReceiptAccess(req, order) {
  const callerRole = getCallerRole(req);
  if (callerRole === 'customer') {
    if (!req.customer || order.customer_id !== req.customer.id) {
      throw createError('Access denied', 403);
    }
    if (order.status !== 'completed') {
      throw createError('Receipt is available once the order is completed', 400);
    }
    return;
  }
  if (callerRole === 'rider') {
    const delivery = await deliveryModel.findByOrderId(order.id);
    if (!delivery || delivery.rider_id !== req.user?.id) {
      throw createError('Access denied', 403);
    }
    if (order.status !== 'completed') {
      throw createError('Receipt is available once the order is completed', 400);
    }
    return;
  }
  if (callerRole === 'vendor' || callerRole === 'admin') {
    return;
  }
  throw createError('Access denied', 403);
}

async function downloadOrderReceipt(req, res, next) {
  try {
    const { id } = req.params;
    const ctx = await receiptPdfService.loadOrderReceiptContext(id);
    if (!ctx) return next(createError('Order not found', 404));
    const { order } = ctx;
    const cr = getCallerRole(req);
    if (
      !(cr === 'customer' && req.customer?.isMarketplaceCustomer)
      && !(cr === 'rider' && req.user?.isPlatformRider)
    ) {
      if (order.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    }

    await assertOrderReceiptAccess(req, order);

    const pdf = await receiptPdfService.buildOrderReceiptPdfBuffer(ctx);
    const filename = `dilivygo-receipt-${String(order.id).slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrders,
  getVendorAnalytics,
  getOrder,
  reorderOrder,
  createOrder,
  createPosOrder,
  updateOrderStatus,
  refundOrder,
  createRefundRequest,
  getRefundRequestForOrder,
  cancelOrder,
  rejectOrder,
  acceptOrder,
  completeOrder,
  extendSla,
  getRiderLocation,
  downloadOrderReceipt,
};
