'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update, remove } = require('../lib/supabase');

class PromoCodeModel extends BaseModel {
  constructor() {
    super('promo_codes');
  }

  /**
   * Resolve a promo code for redemption at checkout.
   *
   * `organizationId` is the PRIMARY tenant boundary — without it this method
   * used to scan every `promo_codes` row across every org and return the
   * first shape-compatible match, which meant one tenant's coupons were
   * redeemable at a sibling tenant's checkout. Callers on customer/rider
   * surfaces should always pass `req.organizationId` (set by
   * `attachProjectRef` from the host scope). The legacy signature
   * `(code, projectRef, shopId)` is preserved so existing tests / admin
   * tooling keep working; they just won't benefit from the tenant filter.
   *
   * Priority (within the selected tenant):
   *   shop-scoped → workspace-scoped → organization-wide.
   */
  async findByCode(code, projectRef, shopId, organizationId) {
    const upper = String(code || '').toUpperCase();
    if (!upper) return null;

    const filters = { code: upper };
    if (organizationId) filters.organization_id = organizationId;

    const candidates = await select(this.table, {
      filters,
      order: 'created_at.desc',
    });

    if (!candidates?.length) return null;

    if (shopId) {
      const shopMatch = candidates.find(
        (p) => p.shop_id === shopId && p.project_ref === projectRef,
      );
      if (shopMatch) return shopMatch;
    }
    if (projectRef) {
      const wsMatch = candidates.find(
        (p) => p.project_ref === projectRef && !p.shop_id,
      );
      if (wsMatch) return wsMatch;
    }
    const orgWideMatch = candidates.find((p) => !p.project_ref && !p.shop_id);
    if (orgWideMatch) return orgWideMatch;

    // No exact-scope match. When we have an `organizationId` filter in place
    // the remaining candidates are still tenant-safe, so returning the most
    // recent one is fine. Without `organizationId` we refuse to pick a cross-
    // tenant fallback — callers that still need this behaviour (legacy admin
    // tools) should migrate.
    if (organizationId) return candidates[0] || null;
    return null;
  }

  async listAll({ organizationId } = {}) {
    return select(this.table, {
      filters: organizationId ? { organization_id: organizationId } : {},
      order: 'created_at.desc',
    });
  }

  async listByProjectRef(projectRef) {
    return select(this.table, {
      filters: { project_ref: projectRef },
      order: 'created_at.desc',
    });
  }

  async createPromo(data) {
    return insert(this.table, {
      id: uuidv4(),
      ...data,
      code: data.code.toUpperCase(),
      times_used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async updatePromo(id, data) {
    await update(this.table, {
      ...data,
      ...(data.code ? { code: data.code.toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    }, { id });
    return this.findById(id);
  }

  async deletePromo(id) {
    return remove(this.table, { id });
  }

  async incrementUsage(id) {
    const row = await this.findById(id);
    if (!row) return;
    await update(this.table, {
      times_used: (row.times_used || 0) + 1,
      updated_at: new Date().toISOString(),
    }, { id });
  }

  async countRedemptions(promoCodeId, customerId) {
    const rows = await select('promo_redemptions', {
      filters: { promo_code_id: promoCodeId, customer_id: customerId },
    });
    return rows?.length ?? 0;
  }

  async createRedemption({ promoCodeId, orderId, customerId, discountCents }) {
    return insert('promo_redemptions', {
      id: uuidv4(),
      promo_code_id: promoCodeId,
      order_id: orderId,
      customer_id: customerId,
      discount_cents: discountCents,
      created_at: new Date().toISOString(),
    });
  }
}

module.exports = new PromoCodeModel();
