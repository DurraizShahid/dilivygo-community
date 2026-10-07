'use strict';

const { v4: uuidv4 } = require('uuid');
const { select, insert, update, supabaseFetch } = require('../lib/supabase');

const TABLE = 'shop_reviews';

function mapReview(row) {
  if (!row) return row;
  return {
    id: row.id,
    projectRef: row.project_ref,
    shopId: row.shop_id,
    orderId: row.order_id,
    customerId: row.customer_id,
    rating: row.rating,
    comment: row.comment || null,
    moderationStatus: row.moderation_status || 'visible',
    moderationReason: row.moderation_reason || null,
    moderatedBy: row.moderated_by || null,
    moderatedAt: row.moderated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class ShopReviewModel {
  async create({ projectRef, shopId, orderId, customerId, rating, comment }) {
    const rows = await insert(TABLE, [{
      id: uuidv4(),
      project_ref: projectRef,
      shop_id: shopId,
      order_id: orderId,
      customer_id: customerId,
      rating,
      comment: comment || null,
      moderation_status: 'visible',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]);
    const created = Array.isArray(rows) ? rows[0] : rows;
    return mapReview(created);
  }

  async findByOrderAndCustomer(orderId, customerId) {
    const rows = await select(TABLE, {
      filters: { order_id: orderId, customer_id: customerId },
      limit: 1,
    });
    return mapReview(rows?.[0] || null);
  }

  async findById(id) {
    const rows = await select(TABLE, {
      filters: { id },
      limit: 1,
    });
    return mapReview(rows?.[0] || null);
  }

  async listByShop(shopId, { includeHidden = false, limit = 50, offset = 0 } = {}) {
    const filters = { shop_id: shopId };
    if (!includeHidden) filters.moderation_status = 'visible';
    const rows = await select(TABLE, {
      filters,
      order: 'created_at.desc',
      limit,
      offset,
    });
    return (rows || []).map(mapReview);
  }

  async listForSuperadmin({ projectRef, shopId, moderationStatus, organizationId, limit = 100, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (projectRef) params.set('project_ref', `eq.${projectRef}`);
    if (shopId) params.set('shop_id', `eq.${shopId}`);
    if (moderationStatus) params.set('moderation_status', `eq.${moderationStatus}`);
    if (organizationId) params.set('organization_id', `eq.${organizationId}`);

    const rows = await supabaseFetch(`/rest/v1/${TABLE}?${params.toString()}`);
    return (rows || []).map(mapReview);
  }

  async moderate(id, { moderationStatus, moderationReason, moderatedBy }) {
    const rows = await update(TABLE, {
      moderation_status: moderationStatus,
      moderation_reason: moderationReason || null,
      moderated_by: moderatedBy || null,
      moderated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { id });
    const updated = Array.isArray(rows) ? rows[0] : rows;
    return mapReview(updated);
  }

  async getShopSummary(shopId) {
    const rows = await select(TABLE, {
      filters: { shop_id: shopId, moderation_status: 'visible' },
      select: 'rating',
      limit: 2000,
    });
    const total = rows?.length || 0;
    if (!total) return { averageRating: 0, reviewCount: 0 };
    const sum = rows.reduce((acc, row) => acc + Number(row.rating || 0), 0);
    return { averageRating: Number((sum / total).toFixed(2)), reviewCount: total };
  }

  async getProjectSummary(projectRef) {
    const rows = await select(TABLE, {
      filters: { project_ref: projectRef, moderation_status: 'visible' },
      select: 'rating',
      limit: 5000,
    });
    const total = rows?.length || 0;
    if (!total) return { averageRating: 0, reviewCount: 0 };
    const sum = rows.reduce((acc, row) => acc + Number(row.rating || 0), 0);
    return { averageRating: Number((sum / total).toFixed(2)), reviewCount: total };
  }
}

module.exports = new ShopReviewModel();
