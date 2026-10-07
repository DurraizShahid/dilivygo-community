'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update } = require('../lib/supabase');
const { resolveShopTimezone } = require('../lib/shop-hours');
const cache = require('../lib/cache');

/**
 * Drop every customer-facing cache that could have surfaced this shop.
 * Called from createShop/updateShop. We flush the whole listing cache because
 * a single shop change can affect any tenant `ref` that includes it.
 */
function invalidateShopCaches(shopId) {
  cache.invalidateMany([
    { name: 'public:shops' },
    { name: 'public:shop-detail' },
    ...(shopId
      ? [
          { name: 'public:catalog:products', key: `shop:${shopId}` },
          { name: 'public:catalog:categories', key: `shop:${shopId}` },
        ]
      : []),
  ]);
}

class ShopModel extends BaseModel {
  constructor() {
    super('shops');
  }

  async findByProjectRef(projectRef, { includeInactive = false } = {}) {
    const filters = { project_ref: projectRef };
    if (!includeInactive) filters.is_active = true;
    return select(this.table, {
      filters,
      order: 'created_at.asc',
    });
  }

  async findBySlug(projectRef, slug) {
    const rows = await select(this.table, {
      filters: { project_ref: projectRef, slug },
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async createShop(projectRef, data) {
    const now = new Date().toISOString();
    const row = {
      id: uuidv4(),
      project_ref: projectRef,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      logo_url: data.logoUrl ?? null,
      banner_url: data.bannerUrl ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      delivery_geofence: data.deliveryGeofence ?? null,
      operating_hours: data.operatingHours ?? null,
      timezone: resolveShopTimezone(data.timezone),
      currency: data.currency ?? null,
      is_active: data.isActive ?? true,
      browse_category_ids: Array.isArray(data.browseCategoryIds) ? data.browseCategoryIds : [],
      created_at: now,
      updated_at: now,
    };
    const res = await insert(this.table, [row]);
    const created = Array.isArray(res) ? res[0] : res;
    invalidateShopCaches(created?.id);
    return created;
  }

  async updateShop(id, data) {
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.slug != null ? { slug: data.slug } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.logoUrl !== undefined ? { logo_url: data.logoUrl ?? null } : {}),
      ...(data.bannerUrl !== undefined ? { banner_url: data.bannerUrl ?? null } : {}),
      ...(data.address !== undefined ? { address: data.address ?? null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
      ...(data.lat !== undefined ? { lat: data.lat ?? null } : {}),
      ...(data.lon !== undefined ? { lon: data.lon ?? null } : {}),
      ...(data.deliveryGeofence !== undefined ? { delivery_geofence: data.deliveryGeofence ?? null } : {}),
      ...(data.operatingHours !== undefined ? { operating_hours: data.operatingHours ?? null } : {}),
      ...(data.timezone !== undefined ? { timezone: resolveShopTimezone(data.timezone) } : {}),
      ...(data.currency !== undefined ? { currency: data.currency ?? null } : {}),
      ...(data.isActive != null ? { is_active: data.isActive } : {}),
      ...(data.browseCategoryIds !== undefined
        ? { browse_category_ids: Array.isArray(data.browseCategoryIds) ? data.browseCategoryIds : [] }
        : {}),
      updated_at: new Date().toISOString(),
    };
    const res = await update(this.table, patch, { id });
    invalidateShopCaches(id);
    return Array.isArray(res) ? res[0] : res;
  }
}

module.exports = new ShopModel();
