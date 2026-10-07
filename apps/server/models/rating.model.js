'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, supabaseFetch } = require('../lib/supabase');

const VALID_ROLES = ['vendor', 'rider'];

class RatingModel extends BaseModel {
  constructor() {
    super('ratings');
  }

  async create({ orderId, fromUserId, toUserId, toRole, rating, comment }) {
    if (!VALID_ROLES.includes(toRole)) {
      throw new Error(`Invalid rating target role: ${toRole}`);
    }
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('Rating must be an integer between 1 and 5');
    }

    return super.create({
      id: uuidv4(),
      order_id: orderId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      to_role: toRole,
      rating,
      comment: comment || null,
      created_at: new Date().toISOString(),
    });
  }

  async findByOrder(orderId) {
    return select(this.table, {
      filters: { order_id: orderId },
      order: 'created_at.desc',
    });
  }

  async findByUser(userId) {
    return select(this.table, {
      filters: { to_user_id: userId },
      order: 'created_at.desc',
    });
  }

  async averageForUser(userId) {
    const rows = await supabaseFetch(
      `/rest/v1/${this.table}?to_user_id=eq.${encodeURIComponent(userId)}&select=rating`
    );
    if (!rows || rows.length === 0) return null;
    const sum = rows.reduce((acc, r) => acc + r.rating, 0);
    return sum / rows.length;
  }
}

module.exports = new RatingModel();
