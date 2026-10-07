'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update, remove } = require('../lib/supabase');
const cache = require('../lib/cache');

function invalidateCategoryCaches(shopId) {
  if (!shopId) return;
  cache.invalidate('public:catalog:categories', `shop:${shopId}`);
  // Products reference categories for grouping — flush products too so a
  // rename/reorder shows up immediately.
  cache.invalidate('public:catalog:products', `shop:${shopId}`);
}

class CategoryModel extends BaseModel {
  constructor() {
    super('categories');
  }

  async list(shopId) {
    return select(this.table, {
      filters: { shop_id: shopId },
      order: 'sort_order.asc,name.asc',
    });
  }

  /** @deprecated Use list(shopId) instead */
  async listByProjectRef(projectRef) {
    return select(this.table, {
      filters: { project_ref: projectRef },
      order: 'sort_order.asc,name.asc',
    });
  }

  async createCategory(shopId, projectRef, data) {
    const now = new Date().toISOString();
    const row = {
      id: uuidv4(),
      project_ref: projectRef,
      shop_id: shopId,
      name: data.name,
      sort_order: data.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    };
    const res = await insert(this.table, [row]);
    invalidateCategoryCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  async updateCategory(shopId, id, data) {
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.sortOrder != null ? { sort_order: data.sortOrder } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = await update(this.table, patch, { id, shop_id: shopId });
    invalidateCategoryCaches(shopId);
    return Array.isArray(res) ? res[0] : res;
  }

  async deleteCategory(shopId, id) {
    const res = await remove(this.table, { id, shop_id: shopId });
    invalidateCategoryCaches(shopId);
    return res;
  }
}

module.exports = new CategoryModel();
