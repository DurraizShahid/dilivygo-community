'use strict';

const { v4: uuidv4 } = require('uuid');
const { select, insert, update, remove } = require('../lib/supabase');
const cache = require('../lib/cache');

/**
 * Modifier mutations don't carry `shopId` on every call path (options carry
 * groupId only). Full-namespace invalidation of the products catalog is cheap
 * — a few thousand entries at most — and modifier edits are low-frequency.
 */
function invalidateModifierCaches() {
  cache.invalidate('public:catalog:products');
}

class ModifierModel {
  async listGroupsByProduct(productId) {
    const groups = await select('modifier_groups', {
      filters: { product_id: productId },
      order: 'sort_order.asc,created_at.asc',
    });
    if (!groups || groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);
    const options = await select('modifier_options', {
      filters: {},
      order: 'sort_order.asc,created_at.asc',
    });

    const optionsByGroup = {};
    for (const opt of (options || [])) {
      if (!groupIds.includes(opt.group_id)) continue;
      if (!optionsByGroup[opt.group_id]) optionsByGroup[opt.group_id] = [];
      optionsByGroup[opt.group_id].push(opt);
    }

    return groups.map((g) => ({
      ...g,
      options: optionsByGroup[g.id] || [],
    }));
  }

  async listGroupsByProducts(productIds) {
    if (!productIds.length) return {};

    const allGroups = await select('modifier_groups', {
      filters: {},
      order: 'sort_order.asc,created_at.asc',
    });
    const relevantGroups = (allGroups || []).filter((g) => productIds.includes(g.product_id));
    if (!relevantGroups.length) return {};

    const groupIds = relevantGroups.map((g) => g.id);
    const allOptions = await select('modifier_options', {
      filters: {},
      order: 'sort_order.asc,created_at.asc',
    });
    const relevantOptions = (allOptions || []).filter((o) => groupIds.includes(o.group_id));

    const optionsByGroup = {};
    for (const opt of relevantOptions) {
      if (!optionsByGroup[opt.group_id]) optionsByGroup[opt.group_id] = [];
      optionsByGroup[opt.group_id].push(opt);
    }

    const result = {};
    for (const g of relevantGroups) {
      if (!result[g.product_id]) result[g.product_id] = [];
      result[g.product_id].push({
        ...g,
        options: optionsByGroup[g.id] || [],
      });
    }
    return result;
  }

  async createGroup(productId, data) {
    const now = new Date().toISOString();
    const row = {
      id: uuidv4(),
      product_id: productId,
      name: data.name,
      required: data.required ?? false,
      min_selections: data.minSelections ?? 0,
      max_selections: data.maxSelections ?? 1,
      sort_order: data.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    };
    const res = await insert('modifier_groups', [row]);
    invalidateModifierCaches();
    return Array.isArray(res) ? res[0] : res;
  }

  async updateGroup(groupId, data) {
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.required != null ? { required: data.required } : {}),
      ...(data.minSelections != null ? { min_selections: data.minSelections } : {}),
      ...(data.maxSelections != null ? { max_selections: data.maxSelections } : {}),
      ...(data.sortOrder != null ? { sort_order: data.sortOrder } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = await update('modifier_groups', patch, { id: groupId });
    invalidateModifierCaches();
    return Array.isArray(res) ? res[0] : res;
  }

  async deleteGroup(groupId) {
    const res = await remove('modifier_groups', { id: groupId });
    invalidateModifierCaches();
    return res;
  }

  async createOption(groupId, data) {
    const row = {
      id: uuidv4(),
      group_id: groupId,
      name: data.name,
      price_cents: data.priceCents ?? 0,
      is_default: data.isDefault ?? false,
      sort_order: data.sortOrder ?? 0,
      created_at: new Date().toISOString(),
    };
    const res = await insert('modifier_options', [row]);
    invalidateModifierCaches();
    return Array.isArray(res) ? res[0] : res;
  }

  async updateOption(optionId, data) {
    const patch = {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.priceCents != null ? { price_cents: data.priceCents } : {}),
      ...(data.isDefault != null ? { is_default: data.isDefault } : {}),
      ...(data.sortOrder != null ? { sort_order: data.sortOrder } : {}),
    };
    const res = await update('modifier_options', patch, { id: optionId });
    invalidateModifierCaches();
    return Array.isArray(res) ? res[0] : res;
  }

  async deleteOption(optionId) {
    const res = await remove('modifier_options', { id: optionId });
    invalidateModifierCaches();
    return res;
  }

  async getGroupWithProduct(groupId) {
    const rows = await select('modifier_groups', { filters: { id: groupId } });
    return rows?.[0] || null;
  }

  async getOption(optionId) {
    const rows = await select('modifier_options', { filters: { id: optionId } });
    return rows?.[0] || null;
  }
}

module.exports = new ModifierModel();
