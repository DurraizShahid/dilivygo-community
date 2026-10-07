'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, remove } = require('../lib/supabase');

class UserShopModel extends BaseModel {
  constructor() {
    super('user_shops');
  }

  async findByUserId(userId) {
    return select(this.table, {
      filters: { user_id: userId },
      order: 'created_at.asc',
    });
  }

  async findByShopId(shopId) {
    return select(this.table, {
      filters: { shop_id: shopId },
      order: 'created_at.asc',
    });
  }

  async hasAccess(userId, shopId) {
    const rows = await select(this.table, {
      filters: { user_id: userId, shop_id: shopId },
      limit: 1,
    });
    return rows?.length > 0;
  }

  async assignUser(userId, shopId) {
    const existing = await this.hasAccess(userId, shopId);
    if (existing) return null;
    const row = {
      id: uuidv4(),
      user_id: userId,
      shop_id: shopId,
      created_at: new Date().toISOString(),
    };
    const res = await insert(this.table, [row]);
    return Array.isArray(res) ? res[0] : res;
  }

  async removeUser(userId, shopId) {
    return remove(this.table, { user_id: userId, shop_id: shopId });
  }

  async getShopIdsForUser(userId) {
    const rows = await this.findByUserId(userId);
    return (rows || []).map((r) => r.shop_id);
  }
}

module.exports = new UserShopModel();
