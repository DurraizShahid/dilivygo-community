'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update } = require('../lib/supabase');

const VALID_STATUSES = ['pending', 'assigned', 'picked_up', 'arrived', 'delivered'];

class DeliveryModel extends BaseModel {
  constructor() {
    super('deliveries');
  }

  async findByOrderId(orderId) {
    const rows = await select(this.table, { filters: { order_id: orderId } });
    return rows?.[0] || null;
  }

  async findForRider(riderId, zoneId, status, { limit, offset } = {}) {
    const filters = { rider_id: riderId };
    if (zoneId) filters.zone_id = zoneId;
    if (status === 'delivered') filters.status = 'delivered';
    else if (status === 'assigned') {
      filters.status = ['assigned', 'picked_up', 'arrived'];
    }
    return this.findMany(filters, { order: 'created_at.desc', limit, offset });
  }

  /**
   * Pending rider pool, scoped by workspace or organization before deliveries
   * are fetched. There is no deployment-wide fallback.
   *
   * Reassignment deliberately changes delivery assigned -> pending WITHOUT
   * rewinding the customer-facing order from assigned -> ready. Therefore both
   * ready and assigned orders may legitimately own a pending claimable delivery.
   */
  async findAvailable(projectRef, organizationId = null) {
    const scopeFilters = {};
    if (projectRef != null && String(projectRef).trim() !== '') {
      scopeFilters.project_ref = String(projectRef);
    } else if (organizationId != null && String(organizationId).trim() !== '') {
      scopeFilters.organization_id = String(organizationId);
    } else {
      return [];
    }

    const scopedOrders = await select('orders', {
      select:
        'id,shop_id,total_cents,delivery_fee_cents,delivery_address,delivery_notes,status,scheduled_for,prep_time_minutes,project_ref,organization_id',
      filters: {
        ...scopeFilters,
        status: ['ready', 'assigned'],
      },
      order: 'created_at.asc',
      limit: 1000,
    });
    if (!scopedOrders?.length) return [];

    const orderIds = [...new Set(scopedOrders.map((o) => o.id).filter(Boolean))];
    if (!orderIds.length) return [];

    const rows = await select(this.table, {
      select: '*',
      filters: {
        order_id: orderIds,
        rider_id: null,
        status: 'pending',
      },
      order: 'created_at.asc',
      limit: 1000,
    });
    if (!rows?.length) return [];

    const orderMap = new Map((scopedOrders || []).map((o) => [o.id, o]));
    const shopIds = [...new Set(scopedOrders.map((o) => o.shop_id).filter(Boolean))];
    let shopsById = new Map();
    if (shopIds.length) {
      const shops = await select('shops', {
        select: 'id,name,address',
        filters: { id: shopIds },
      });
      shopsById = new Map((shops || []).map((s) => [s.id, s]));
    }

    const visibleOrderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
    const items = visibleOrderIds.length
      ? await select('order_items', {
          select: 'order_id',
          filters: { order_id: visibleOrderIds },
        })
      : [];
    const itemCountByOrder = new Map();
    for (const it of items || []) {
      const oid = it.order_id;
      itemCountByOrder.set(oid, (itemCountByOrder.get(oid) || 0) + 1);
    }

    const buildOrderSummary = (orderId) => {
      const o = orderMap.get(orderId);
      if (!o) return null;
      const shop = o.shop_id ? shopsById.get(o.shop_id) : null;
      return {
        shopName: shop?.name ?? null,
        shopAddress: shop?.address ?? null,
        deliveryAddress: o.delivery_address ?? null,
        deliveryNotes: o.delivery_notes ?? null,
        totalCents: Number(o.total_cents) || 0,
        deliveryFeeCents: o.delivery_fee_cents != null ? Number(o.delivery_fee_cents) : null,
        itemCount: itemCountByOrder.get(o.id) ?? 0,
        orderStatus: o.status ?? '',
        scheduledFor: o.scheduled_for ?? null,
        prepTimeMinutes: o.prep_time_minutes != null ? Number(o.prep_time_minutes) : null,
      };
    };

    return rows.map((d) => ({
      ...d,
      orderSummary: buildOrderSummary(d.order_id),
    }));
  }

  async create({ orderId, etaMinutes, zoneId }) {
    return super.create({
      id: uuidv4(),
      order_id: orderId,
      rider_id: null,
      status: 'pending',
      zone_id: zoneId || null,
      eta_minutes: etaMinutes || null,
      created_at: new Date().toISOString(),
    });
  }

  async claim(deliveryId, riderId) {
    const rows = await update(this.table, {
      rider_id: riderId,
      claimed_at: new Date().toISOString(),
    }, { id: deliveryId, rider_id: null });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async updateStatus(deliveryId, newStatus) {
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new Error(`Invalid delivery status: ${newStatus}`);
    }
    const rows = await update(this.table, {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }, { id: deliveryId });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAvailableInRadius(lat, lon, radiusKm) {
    return this.findMany({ status: 'pending' }, { order: 'created_at.desc' });
  }

  async reassign(deliveryId) {
    const rows = await update(this.table, {
      rider_id: null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    }, { id: deliveryId });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async logLocation(deliveryId, riderId, { lat, lon, heading, speed }) {
    return insert('rider_locations', {
      id: uuidv4(),
      delivery_id: deliveryId,
      rider_id: riderId,
      lat,
      lon,
      heading: heading || null,
      speed: speed || null,
      recorded_at: new Date().toISOString(),
    });
  }

  async cancelForOrder(orderId) {
    const delivery = await this.findByOrderId(orderId);
    if (!delivery) return null;
    if (delivery.status !== 'delivered') {
      await this.deleteById(delivery.id);
      return delivery;
    }
    return null;
  }
}

module.exports = new DeliveryModel();
