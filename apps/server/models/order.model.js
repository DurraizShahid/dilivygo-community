'use strict';

const BaseModel = require('./base.model');
const { DEFAULT_CURRENCY } = require('../lib/currency');
const { select, update, supabaseFetch } = require('../lib/supabase');
const logger = require('../lib/logger');
const integrationWebhookService = require('../services/integration-webhook.service');

const VALID_STATUSES = [
  'placed', 'accepted', 'rejected', 'preparing', 'ready',
  'assigned', 'picked_up', 'arrived', 'completed', 'cancelled', 'scheduled',
];

const STATUS_TRANSITIONS = {
  placed: ['accepted', 'rejected', 'cancelled'],
  scheduled: ['placed', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['arrived'],
  arrived: ['completed'],
};

const CANCELLABLE_STATUSES = ['placed', 'accepted', 'scheduled'];

function publicOrderPayload(order) {
  if (!order) return null;
  return {
    id: order.id,
    projectRef: order.project_ref,
    shopId: order.shop_id || null,
    customerId: order.customer_id || null,
    status: order.status,
    paymentStatus: order.payment_status,
    totalCents: Number(order.total_cents || 0),
    deliveryFeeCents: Number(order.delivery_fee_cents || 0),
    discountCents: Number(order.discount_cents || 0),
    refundAmountCents: order.refund_amount_cents == null ? null : Number(order.refund_amount_cents),
    currency: order.currency || DEFAULT_CURRENCY,
    scheduledFor: order.scheduled_for || null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (order.order_items || []).map((item) => ({
      id: item.id,
      productId: item.product_id || null,
      name: item.name,
      quantity: Number(item.quantity || 0),
      unitPriceCents: Number(item.unit_price_cents || 0),
    })),
  };
}

async function emitIntegrationEvent(eventType, eventId, order, extra = {}) {
  if (!order?.project_ref || !order?.id) return;
  try {
    await integrationWebhookService.enqueueEvent({
      eventId,
      eventType,
      projectRef: order.project_ref,
      payload: { ...publicOrderPayload(order), ...extra },
    });
  } catch (err) {
    logger.error('Order integration event enqueue failed', {
      orderId: order.id,
      eventType,
      error: err.message,
    });
  }
}

class OrderModel extends BaseModel {
  constructor() {
    super('orders');
  }

  async findByProjectRef(projectRef, { status, customerId, shopId, limit = 50, offset = 0 } = {}) {
    const filters = { project_ref: projectRef };
    if (status) filters.status = status;
    if (customerId) filters.customer_id = customerId;
    if (shopId) filters.shop_id = shopId;

    return select(this.table, {
      select: '*, order_items(*, order_item_modifiers(*))',
      filters,
      order: 'created_at.desc',
      limit,
      offset,
    });
  }

  async findByShopId(shopId, { status, customerId, limit = 50, offset = 0 } = {}) {
    const filters = { shop_id: shopId };
    if (status) filters.status = status;
    if (customerId) filters.customer_id = customerId;

    return select(this.table, {
      select: '*, order_items(*, order_item_modifiers(*))',
      filters,
      order: 'created_at.desc',
      limit,
      offset,
    });
  }

  async findByCustomerId(customerId, { status, shopId, limit = 50, offset = 0 } = {}) {
    const filters = { customer_id: customerId };
    if (status) filters.status = status;
    if (shopId) filters.shop_id = shopId;

    return select(this.table, {
      select: '*, order_items(*, order_item_modifiers(*))',
      filters,
      order: 'created_at.desc',
      limit,
      offset,
    });
  }

  async findWithItems(orderId) {
    const rows = await select(this.table, {
      select: '*, order_items(*, order_item_modifiers(*))',
      filters: { id: orderId },
    });
    return rows?.[0] || null;
  }

  async findByPaymentIntentAndShop(paymentIntentId, shopId) {
    if (!paymentIntentId || !shopId) return null;
    const rows = await select(this.table, {
      select: '*, order_items(*, order_item_modifiers(*))',
      filters: { payment_intent_id: paymentIntentId, shop_id: shopId },
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async createWithItems({
    projectRef,
    shopId,
    customerId,
    items,
    totalCents,
    paymentIntentId,
    scheduledFor,
    address,
    notes,
    currency,
    discountCents,
    promoCodeId,
    deliveryFeeCents,
    posCheckoutMode,
    recordPromoRedemption = true,
    cutleryRequested = false,
    cutleryFeeCents = 0,
  }) {
    if (!shopId) throw new Error('shopId is required to create an order');

    const now = new Date().toISOString();
    let status;
    if (scheduledFor) status = 'scheduled';
    else if (posCheckoutMode === 'quick') status = 'completed';
    else status = 'placed';

    const pOrder = {
      project_ref: projectRef,
      shop_id: shopId,
      customer_id: customerId || null,
      status,
      payment_status: paymentIntentId ? 'paid' : 'unpaid',
      payment_intent_id: paymentIntentId || null,
      total_cents: totalCents,
      delivery_fee_cents: deliveryFeeCents || 0,
      discount_cents: discountCents || 0,
      promo_code_id: promoCodeId || null,
      currency: currency || DEFAULT_CURRENCY,
      delivery_address: address || null,
      delivery_notes: notes || null,
      scheduled_for: scheduledFor || null,
      pos_checkout_mode: posCheckoutMode || null,
      cutlery_requested: Boolean(cutleryRequested),
      cutlery_fee_cents: Math.max(0, Number(cutleryFeeCents) || 0),
      created_at: now,
      updated_at: now,
    };

    const normalizedItems = (items || []).map((item) => ({
      productId: item.productId || null,
      productVariantId: item.productVariantId || item.product_variant_id || null,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      notes: item.notes || null,
      modifiers: (item.modifiers || []).map((mod) => ({
        modifierOptionId: mod.modifierOptionId || mod.modifier_option_id || null,
        groupName: mod.groupName || mod.group_name,
        optionName: mod.optionName || mod.option_name,
        priceCents: mod.priceCents ?? mod.price_cents ?? 0,
      })),
    }));

    const result = await supabaseFetch('/rest/v1/rpc/create_order_with_items_atomic', {
      method: 'POST',
      body: JSON.stringify({
        p_order: pOrder,
        p_items: normalizedItems,
        p_record_promo_redemption: Boolean(recordPromoRedemption),
      }),
    });

    const row = Array.isArray(result) ? result[0] : result;
    const orderId = row?.order_id || row?.orderId || (typeof row === 'string' ? row : null);
    if (!orderId) throw new Error('Atomic order fulfillment returned no order id');
    const order = await this.findWithItems(orderId);
    await emitIntegrationEvent('order.created', `order.created:${orderId}`, order);
    return order;
  }

  validateTransition(currentStatus, newStatus, ctx = {}) {
    if (currentStatus === 'ready' && newStatus === 'completed' && ctx.posCheckoutMode === 'kitchen') return true;
    const allowed = STATUS_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
    return true;
  }

  async compareAndSetStatus(orderId, expectedStatus, newStatus) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid order status: ${newStatus}`);
    const rows = await supabaseFetch('/rest/v1/rpc/compare_and_set_order_status', {
      method: 'POST',
      body: JSON.stringify({ p_order_id: orderId, p_expected_status: expectedStatus, p_new_status: newStatus }),
    });
    const result = Array.isArray(rows) ? rows[0] || null : rows || null;
    if (result) {
      const order = await this.findWithItems(orderId);
      if (order?.status === newStatus) {
        await emitIntegrationEvent('order.status_changed', `order.status_changed:${orderId}:${newStatus}:${order.updated_at || ''}`, order, { previousStatus: expectedStatus });
      }
    }
    return result;
  }

  async updateStatus(orderId, newStatus) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid order status: ${newStatus}`);
    const before = await this.findWithItems(orderId);
    const rows = await update(this.table, { status: newStatus, updated_at: new Date().toISOString() }, { id: orderId });
    const order = rows?.[0] ? await this.findWithItems(orderId) : null;
    if (order) {
      await emitIntegrationEvent('order.status_changed', `order.status_changed:${orderId}:${newStatus}:${order.updated_at || ''}`, order, { previousStatus: before?.status || null });
    }
    return rows;
  }

  async applyRefund(orderId, { amountCents, reason, isPartial }) {
    const now = new Date().toISOString();
    const rows = await update(this.table, {
      payment_status: isPartial ? 'partially_refunded' : 'refunded',
      refund_amount_cents: amountCents,
      refund_reason: reason || null,
      refunded_at: now,
      updated_at: now,
    }, { id: orderId });
    const order = rows?.[0] ? await this.findWithItems(orderId) : null;
    if (order) {
      await emitIntegrationEvent('order.refunded', `order.refunded:${orderId}:${amountCents}:${order.updated_at || ''}`, order, { refundReason: reason || null, isPartial: Boolean(isPartial) });
    }
    return rows;
  }

  async cancel(orderId, { reason, initiator, expectedStatus }) {
    const filters = { id: orderId };
    if (expectedStatus) filters.status = expectedStatus;
    const rows = await update(this.table, {
      status: 'cancelled',
      cancellation_reason: reason || null,
      cancelled_by: initiator || null,
      updated_at: new Date().toISOString(),
    }, filters);
    const order = rows?.[0] ? await this.findWithItems(orderId) : null;
    if (order) {
      await emitIntegrationEvent('order.status_changed', `order.status_changed:${orderId}:cancelled:${order.updated_at || ''}`, order, { previousStatus: expectedStatus || null, cancellationReason: reason || null });
    }
    return rows;
  }

  async reject(orderId, reason, { expectedStatus } = {}) {
    const filters = { id: orderId };
    if (expectedStatus) filters.status = expectedStatus;
    const rows = await update(this.table, { status: 'rejected', rejection_reason: reason || null, updated_at: new Date().toISOString() }, filters);
    const order = rows?.[0] ? await this.findWithItems(orderId) : null;
    if (order) {
      await emitIntegrationEvent('order.status_changed', `order.status_changed:${orderId}:rejected:${order.updated_at || ''}`, order, { previousStatus: expectedStatus || null, rejectionReason: reason || null });
    }
    return rows;
  }

  async setSlaDeadline(orderId, prepTimeMinutes) {
    const deadline = new Date(Date.now() + prepTimeMinutes * 60_000).toISOString();
    return update(this.table, { prep_time_minutes: prepTimeMinutes, sla_deadline: deadline, updated_at: new Date().toISOString() }, { id: orderId });
  }

  async markSlaBreach(orderId) {
    return update(this.table, { sla_breached: true, updated_at: new Date().toISOString() }, { id: orderId });
  }

  isCancellable(order) {
    return CANCELLABLE_STATUSES.includes(order.status);
  }

  async getScheduledDue() {
    const now = new Date().toISOString();
    return supabaseFetch(`/rest/v1/${this.table}?status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(now)}&select=*`);
  }

  async linkPaymentIntent(orderId, paymentIntentId) {
    return update(this.table, { payment_intent_id: paymentIntentId, payment_status: 'paid', updated_at: new Date().toISOString() }, { id: orderId });
  }
}

module.exports = new OrderModel();
