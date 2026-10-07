'use strict';

const promoCodeModel = require('../models/promo-code.model');
const promoService = require('../services/promo.service');
const shopModel = require('../models/shop.model');
const { select } = require('../lib/supabase');
const { validCurrency, getPlatformCurrency } = require('../lib/currency');
const { createError } = require('../middleware/error.middleware');

async function isPromoEnabledForProject(projectRef) {
  const rows = await select('workspaces', { filters: { project_ref: projectRef }, limit: 1 });
  const ws = rows?.[0];
  return ws?.promo_codes_enabled !== false;
}

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectRef: row.project_ref || null,
    shopId: row.shop_id || null,
    code: row.code,
    type: row.type,
    value: row.value,
    minOrderCents: row.min_order_cents ?? 0,
    maxDiscountCents: row.max_discount_cents ?? null,
    maxUses: row.max_uses ?? null,
    maxUsesPerCustomer: row.max_uses_per_customer ?? 1,
    timesUsed: row.times_used ?? 0,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSnake(body) {
  const out = {};
  if (body.code !== undefined) out.code = body.code;
  if (body.type !== undefined) out.type = body.type;
  if (body.value !== undefined) out.value = body.value;
  if (body.minOrderCents !== undefined) out.min_order_cents = body.minOrderCents;
  if (body.maxDiscountCents !== undefined) out.max_discount_cents = body.maxDiscountCents;
  if (body.maxUses !== undefined) out.max_uses = body.maxUses;
  if (body.maxUsesPerCustomer !== undefined) out.max_uses_per_customer = body.maxUsesPerCustomer;
  if (body.startsAt !== undefined) out.starts_at = body.startsAt;
  if (body.endsAt !== undefined) out.ends_at = body.endsAt;
  if (body.isActive !== undefined) out.is_active = body.isActive;
  if (body.shopId !== undefined) out.shop_id = body.shopId || null;
  if (body.projectRef !== undefined) out.project_ref = body.projectRef || null;
  return out;
}

// ─── Workspace Admin CRUD ───────────────────────────────────────────────────

async function listPromoCodes(req, res, next) {
  try {
    const enabled = await isPromoEnabledForProject(req.projectRef);
    const rows = await promoCodeModel.listByProjectRef(req.projectRef);
    return res.json({ promoCodes: (rows || []).map(toCamel), promoCodesEnabled: enabled });
  } catch (err) {
    next(err);
  }
}

async function assertShopBelongsToWorkspace(shopId, projectRef) {
  if (!shopId) return null;
  const shop = await shopModel.findById(String(shopId));
  if (!shop) return { status: 404, error: 'Shop not found' };
  if (shop.project_ref !== projectRef) {
    return { status: 404, error: 'Shop not found' };
  }
  return null;
}

async function createPromoCode(req, res, next) {
  try {
    const enabled = await isPromoEnabledForProject(req.projectRef);
    if (!enabled) return next(createError('Promo codes are disabled for this workspace', 403));
    const data = toSnake(req.body);

    if (data.shop_id) {
      const shopErr = await assertShopBelongsToWorkspace(data.shop_id, req.projectRef);
      if (shopErr) return next(createError(shopErr.error, shopErr.status));
    }

    data.project_ref = req.projectRef;
    const row = await promoCodeModel.createPromo(data);
    return res.status(201).json({ promoCode: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function updatePromoCode(req, res, next) {
  try {
    const enabled = await isPromoEnabledForProject(req.projectRef);
    if (!enabled) return next(createError('Promo codes are disabled for this workspace', 403));
    const { id } = req.params;
    const existing = await promoCodeModel.findById(id);
    if (!existing) return next(createError('Promo code not found', 404));
    if (existing.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    const data = toSnake(req.body);

    if (data.shop_id) {
      const shopErr = await assertShopBelongsToWorkspace(data.shop_id, req.projectRef);
      if (shopErr) return next(createError(shopErr.error, shopErr.status));
    }

    const row = await promoCodeModel.updatePromo(id, data);
    return res.json({ promoCode: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function deletePromoCode(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await promoCodeModel.findById(id);
    if (!existing) return next(createError('Promo code not found', 404));
    if (existing.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    await promoCodeModel.deletePromo(id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Superadmin CRUD ────────────────────────────────────────────────────────

async function saListPromoCodes(req, res, next) {
  try {
    const { projectRef } = req.query;
    const organizationId =
      typeof req.query.organizationId === 'string' && req.query.organizationId.trim()
        ? req.query.organizationId.trim()
        : undefined;
    let rows;
    if (projectRef) {
      rows = await promoCodeModel.listByProjectRef(projectRef);
      if (organizationId) {
        rows = (rows || []).filter((r) => String(r.organization_id ?? '') === String(organizationId));
      }
    } else {
      rows = await promoCodeModel.listAll({ organizationId });
    }
    return res.json({ promoCodes: (rows || []).map(toCamel) });
  } catch (err) {
    next(err);
  }
}

async function saCreatePromoCode(req, res, next) {
  try {
    const data = toSnake(req.body);
    let organizationId =
      req.saasOrganizationId ||
      (typeof req.body?.organizationId === 'string' && req.body.organizationId.trim()
        ? req.body.organizationId.trim()
        : null);
    if (!organizationId && data.project_ref) {
      const wsRows = await select('workspaces', {
        filters: { project_ref: data.project_ref },
        select: 'organization_id',
        limit: 1,
      });
      organizationId = wsRows?.[0]?.organization_id || null;
    }
    if (!organizationId) {
      const orgs = await select('organizations', { limit: 2 });
      if (orgs?.length === 1) organizationId = orgs[0].id;
    }
    if (!organizationId) {
      return res.status(400).json({
        error: 'organizationId is required when more than one SaaS organization exists',
      });
    }
    data.organization_id = organizationId;
    const row = await promoCodeModel.createPromo(data);
    return res.status(201).json({ promoCode: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function saUpdatePromoCode(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await promoCodeModel.findById(id);
    if (!existing) return next(createError('Promo code not found', 404));
    const data = toSnake(req.body);
    const row = await promoCodeModel.updatePromo(id, data);
    return res.json({ promoCode: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function saDeletePromoCode(req, res, next) {
  try {
    const { id } = req.params;
    await promoCodeModel.deletePromo(id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Customer Validation ────────────────────────────────────────────────────

async function validatePromo(req, res, next) {
  try {
    const { code, shopId, subtotalCents, deliveryFeeCents, currency } = req.body;

    // Resolve the tenant organization for this request. Preferred source is
    // `req.organizationId` (set by `attachProjectRef` from the host scope on
    // `{ref}.customer.<apex>` and custom org hostnames). Fall back to the
    // customer's own `organization_id` on the JWT/session payload so that
    // legacy workspace-host customers keep working, and finally to the
    // workspace's org when only a `projectRef` is available.
    let organizationId =
      req.organizationId ||
      req.customer?.organizationId ||
      req.customer?.organization_id ||
      null;
    if (!organizationId && req.projectRef) {
      try {
        const wsRows = await select('workspaces', {
          filters: { project_ref: req.projectRef },
          limit: 1,
          select: 'organization_id',
        });
        organizationId = wsRows?.[0]?.organization_id || null;
      } catch {
        organizationId = null;
      }
    }

    // Resolve display currency with org context so that when the client doesn't
    // send one (or sends an invalid code), we fall back to the org's configured
    // `default_currency` rather than the platform-wide default (gbp).
    const displayCurrency =
      validCurrency(currency)
      || (await getPlatformCurrency(
        organizationId ? { organizationId } : req.projectRef ? { projectRef: req.projectRef } : undefined,
      ));

    const result = await promoService.validatePromoCode(code, {
      projectRef: req.projectRef,
      shopId: shopId || null,
      customerId: req.customer?.id || null,
      subtotalCents,
      deliveryFeeCents: deliveryFeeCents || 0,
      currency: displayCurrency,
      organizationId,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  saListPromoCodes,
  saCreatePromoCode,
  saUpdatePromoCode,
  saDeletePromoCode,
  validatePromo,
};
