'use strict';

const { v4: uuidv4 } = require('uuid');
const { select, insert, update, remove } = require('../lib/supabase');
const productModel = require('./product.model');
const cache = require('../lib/cache');

function invalidateVariantCaches(shopId) {
  if (!shopId) return;
  cache.invalidate('public:catalog:products', `shop:${shopId}`);
}

class ProductVariantModel {
  /**
   * @param {string[]} productIds
   * @returns {Promise<Record<string, object[]>>}
   */
  async listByProductIds(productIds) {
    if (!productIds?.length) return {};
    const rows = await select('product_variants', {
      filters: { product_id: productIds },
      order: 'sort_order.asc,created_at.asc',
    });
    const out = {};
    for (const r of rows || []) {
      const pid = r.product_id;
      if (!out[pid]) out[pid] = [];
      out[pid].push(r);
    }
    return out;
  }

  async listForProduct(shopId, productId) {
    const p = await productModel.get(shopId, productId);
    if (!p) return [];
    const rows = await select('product_variants', {
      filters: { product_id: productId },
      order: 'sort_order.asc,created_at.asc',
    });
    return rows || [];
  }

  /**
   * @param {string} shopId
   * @param {string} variantId
   * @returns {Promise<(object & { product?: object })|null>}
   */
  async getWithProduct(shopId, variantId) {
    const rows = await select('product_variants', { filters: { id: variantId }, limit: 1 });
    const v = rows?.[0];
    if (!v) return null;
    const p = await productModel.get(shopId, v.product_id);
    if (!p) return null;
    return { ...v, product: p };
  }

  async create(shopId, productId, data) {
    const p = await productModel.get(shopId, productId);
    if (!p) return null;
    const now = new Date().toISOString();
    const row = {
      id: uuidv4(),
      product_id: productId,
      name: data.name,
      price_cents: data.priceCents,
      sku: data.sku ?? null,
      barcode: data.barcode ?? null,
      image_url: data.imageUrl ?? null,
      stock_quantity: data.stockQuantity !== undefined ? data.stockQuantity : null,
      available: data.available !== false,
      sort_order: data.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    };
    const res = await insert('product_variants', [row]);
    invalidateVariantCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  async update(shopId, variantId, data) {
    const existing = await this.getWithProduct(shopId, variantId);
    if (!existing) return null;
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.priceCents != null ? { price_cents: data.priceCents } : {}),
      ...(data.sku !== undefined ? { sku: data.sku ?? null } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode ?? null } : {}),
      ...(data.imageUrl !== undefined ? { image_url: data.imageUrl ?? null } : {}),
      ...(data.stockQuantity !== undefined ? { stock_quantity: data.stockQuantity } : {}),
      ...(data.available != null ? { available: data.available } : {}),
      ...(data.sortOrder != null ? { sort_order: data.sortOrder } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = await update('product_variants', patch, { id: variantId });
    invalidateVariantCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  async delete(shopId, variantId) {
    const existing = await this.getWithProduct(shopId, variantId);
    if (!existing) return false;
    await remove('product_variants', { id: variantId });
    invalidateVariantCaches(shopId);
    return true;
  }
}

module.exports = new ProductVariantModel();
