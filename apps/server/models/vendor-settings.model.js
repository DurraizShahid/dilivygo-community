'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update } = require('../lib/supabase');
const cache = require('../lib/cache');

const VALID_DELIVERY_MODES = ['third_party', 'vendor_rider'];

class VendorSettingsModel extends BaseModel {
  constructor() {
    super('vendor_settings');
  }

  async findByShopId(shopId) {
    if (!shopId) return null;
    return cache.wrap('vendor-settings', `shop:${shopId}`, async () => {
      const rows = await select(this.table, {
        filters: { shop_id: shopId },
        limit: 1,
      });
      return rows?.[0] || null;
    });
  }

  /** @deprecated Use findByShopId(shopId) instead */
  async findByProjectRef(projectRef) {
    if (!projectRef) return null;
    return cache.wrap('vendor-settings', `ws:${projectRef}`, async () => {
      const rows = await select(this.table, {
        filters: { project_ref: projectRef },
        limit: 1,
      });
      return rows?.[0] || null;
    });
  }

  async upsertByShopId(shopId, projectRef, settings) {
    const now = new Date().toISOString();
    const existing = await this.findByShopId(shopId);

    if (settings.delivery_mode && !VALID_DELIVERY_MODES.includes(settings.delivery_mode)) {
      throw new Error(`Invalid delivery_mode: ${settings.delivery_mode}`);
    }

    let result;
    if (existing) {
      result = await update(this.table, {
        ...settings,
        updated_at: now,
      }, { id: existing.id });
    } else {
      result = await super.create({
        id: uuidv4(),
        project_ref: projectRef,
        shop_id: shopId,
        auto_accept: settings.auto_accept ?? false,
        default_prep_time_minutes: settings.default_prep_time_minutes ?? 20,
        delivery_mode: settings.delivery_mode ?? 'third_party',
        delivery_radius_km: settings.delivery_radius_km ?? 5.0,
        minimum_order_cents: settings.minimum_order_cents ?? 0,
        cutlery_offered: settings.cutlery_offered ?? false,
        cutlery_fee_cents: settings.cutlery_fee_cents ?? 0,
        custom_dietary_tags: settings.custom_dietary_tags ?? [],
        created_at: now,
        updated_at: now,
      });
    }

    // Vendor settings affect shop listing (minimum order, delivery radius,
    // effective geofence) + shop detail + menu display. Safest to flush every
    // cache that might have surfaced this shop's settings.
    cache.invalidateMany([
      { name: 'vendor-settings', key: `shop:${shopId}` },
      { name: 'vendor-settings', key: `ws:${projectRef}` },
      { name: 'public:shops' },
      { name: 'public:shop-detail' },
      { name: 'public:catalog:products', key: `shop:${shopId}` },
    ]);

    return result;
  }

  /** @deprecated Use upsertByShopId instead */
  async upsert(projectRef, settings) {
    const now = new Date().toISOString();
    const existing = await this.findByProjectRef(projectRef);

    if (settings.delivery_mode && !VALID_DELIVERY_MODES.includes(settings.delivery_mode)) {
      throw new Error(`Invalid delivery_mode: ${settings.delivery_mode}`);
    }

    if (existing) {
      const result = await update(this.table, {
        ...settings,
        updated_at: now,
      }, { id: existing.id });
      cache.invalidateMany([
        { name: 'vendor-settings' },
        { name: 'public:shops' },
        { name: 'public:shop-detail' },
      ]);
      return result;
    }

    const result = await super.create({
      id: uuidv4(),
      project_ref: projectRef,
      auto_accept: settings.auto_accept ?? false,
      default_prep_time_minutes: settings.default_prep_time_minutes ?? 20,
      delivery_mode: settings.delivery_mode ?? 'third_party',
      delivery_radius_km: settings.delivery_radius_km ?? 5.0,
      minimum_order_cents: settings.minimum_order_cents ?? 0,
      created_at: now,
      updated_at: now,
    });
    cache.invalidateMany([
      { name: 'vendor-settings' },
      { name: 'public:shops' },
      { name: 'public:shop-detail' },
    ]);
    return result;
  }
}

module.exports = new VendorSettingsModel();
