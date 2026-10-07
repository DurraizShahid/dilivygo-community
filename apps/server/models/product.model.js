'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update, remove } = require('../lib/supabase');
const cache = require('../lib/cache');

function invalidateProductCaches(shopId) {
  if (!shopId) return;
  cache.invalidate('public:catalog:products', `shop:${shopId}`);
  // Shop detail carries currency/min-order that depend on vendor-settings but
  // product availability can change what customers see in the shop card.
  cache.invalidate('public:shop-detail');
}

class ProductModel extends BaseModel {
  constructor() {
    super('products');
  }

  async list(shopId, { includeUnavailable = true } = {}) {
    const filters = { shop_id: shopId };
    if (!includeUnavailable) filters.available = true;
    return select(this.table, {
      filters,
      order: 'sort_order.asc,created_at.desc',
    });
  }

  /** @deprecated Use list(shopId) instead */
  async listByProjectRef(projectRef, { includeUnavailable = true } = {}) {
    const filters = { project_ref: projectRef };
    if (!includeUnavailable) filters.available = true;
    return select(this.table, {
      filters,
      order: 'sort_order.asc,created_at.desc',
    });
  }

  async get(shopId, id) {
    const rows = await select(this.table, { filters: { id, shop_id: shopId } });
    return rows?.[0] || null;
  }

  async createProduct(shopId, projectRef, data) {
    const now = new Date().toISOString();
    const row = {
      id: uuidv4(),
      project_ref: projectRef,
      shop_id: shopId,
      name: data.name,
      description: data.description ?? null,
      price_cents: data.priceCents,
      category: data.category ?? null,
      image_url: data.imageUrl ?? null,
      barcode: data.barcode ?? null,
      sku: data.sku ?? null,
      available: data.available ?? true,
      sort_order: data.sortOrder ?? 0,
      dietary_tags: data.dietaryTags ?? [],
      created_at: now,
      updated_at: now,
    };
    const res = await insert(this.table, [row]);
    invalidateProductCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  /** @param {object[]} items - validated product payloads (camelCase API shape) */
  async createProducts(shopId, projectRef, items) {
    if (!items?.length) return [];
    const now = new Date().toISOString();
    const rows = items.map((data, idx) => ({
      id: uuidv4(),
      project_ref: projectRef,
      shop_id: shopId,
      name: data.name,
      description: data.description ?? null,
      price_cents: data.priceCents,
      category: data.category ?? null,
      image_url: data.imageUrl ?? null,
      barcode: data.barcode ?? null,
      sku: data.sku ?? null,
      available: data.available ?? true,
      sort_order: data.sortOrder ?? idx,
      dietary_tags: data.dietaryTags ?? [],
      created_at: now,
      updated_at: now,
    }));
    const res = await insert(this.table, rows);
    invalidateProductCaches(shopId);
    return Array.isArray(res) ? res : [res];
  }

  async updateProduct(shopId, id, data) {
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.priceCents != null ? { price_cents: data.priceCents } : {}),
      ...(data.category !== undefined ? { category: data.category ?? null } : {}),
      ...(data.imageUrl !== undefined ? { image_url: data.imageUrl ?? null } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode ?? null } : {}),
      ...(data.sku !== undefined ? { sku: data.sku ?? null } : {}),
      ...(data.available != null ? { available: data.available } : {}),
      ...(data.sortOrder != null ? { sort_order: data.sortOrder } : {}),
      ...(data.dietaryTags !== undefined ? { dietary_tags: data.dietaryTags } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = await update(this.table, patch, { id, shop_id: shopId });
    invalidateProductCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  async deleteProduct(shopId, id) {
    const res = await remove(this.table, { id, shop_id: shopId });
    invalidateProductCaches(shopId);
    return res;
  }
}

module.exports = new ProductModel();
