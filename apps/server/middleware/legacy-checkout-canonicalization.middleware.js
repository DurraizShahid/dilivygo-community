'use strict';

const { checkoutDraftSchema } = require('../validators/payment.validator');
const { createError } = require('./error.middleware');

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw createError('Invalid cart items payload', 400);
  }
}

function lineUnitCents(item) {
  return Math.max(0, Number(item?.unitPriceCents ?? item?.unit_price_cents ?? 0) || 0);
}

function computedSubtotal(items) {
  return (items || []).reduce((sum, item) => {
    const quantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
    return sum + (quantity * lineUnitCents(item));
  }, 0);
}

function canonicalDraftFromLegacy(req, metadata, items, projectRef) {
  const raw = {
    groups: [{
      shopId: String(metadata.shopId),
      projectRef: String(projectRef),
      items,
      subtotalCents: computedSubtotal(items),
      wantsCutlery: metadata.wantsCutlery === '1'
        || String(metadata.wantsCutlery || '').toLowerCase() === 'true',
    }],
    deliveryFeeCents: Math.max(0, Number(metadata.deliveryFeeCents || 0) || 0),
    promoCode: metadata.promoCode ? String(metadata.promoCode) : undefined,
    scheduledFor: metadata.scheduledFor || null,
    address:
      metadata.address != null
        ? String(metadata.address)
        : metadata.deliveryAddress != null
          ? String(metadata.deliveryAddress)
          : '',
    notes: metadata.notes != null ? String(metadata.notes) : undefined,
  };

  const parsed = checkoutDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    const err = createError(
      first?.message
        ? `Legacy checkout payload is invalid: ${first.message}`
        : 'Legacy checkout payload is invalid',
      400,
    );
    err.code = 'LEGACY_CHECKOUT_INVALID';
    throw err;
  }
  return parsed.data;
}

/**
 * New single-shop order checkouts use the same durable batch, inventory,
 * wallet, price-snapshot and webhook recovery path as multi-shop checkout.
 *
 * Keep non-order PaymentIntents (wallet topups, etc.) and already-modern drafts
 * unchanged. The old webhook metadata branch remains only for Stripe intents
 * created before this code reaches production.
 */
function canonicalizeLegacyOrderCheckout(req, _res, next) {
  try {
    if (req.body?.checkoutDraft) return next();

    const metadata = req.body?.metadata || {};
    if (metadata.purpose) return next();
    if (!metadata.shopId || !metadata.items) return next();

    const items = parseItems(metadata.items);
    if (!items.length) {
      return next(createError('Order checkout requires at least one item', 400));
    }

    const projectRef =
      metadata.projectRef ||
      metadata.project_ref ||
      req.projectRef ||
      null;
    if (!projectRef) {
      return next(createError('Project reference is required for order checkout', 400));
    }

    const subtotalCents = computedSubtotal(items);
    if (subtotalCents <= 0) {
      return next(createError('Order subtotal must be greater than 0', 400));
    }

    req.body.checkoutDraft = canonicalDraftFromLegacy(req, metadata, items, projectRef);

    // From this point onward the controller treats the request as the canonical
    // durable flow. Do not retain client cart JSON as a second source of truth
    // in Stripe metadata.
    req.body.metadata = {
      ...metadata,
      projectRef: String(projectRef),
      items: undefined,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  canonicalizeLegacyOrderCheckout,
  canonicalDraftFromLegacy,
  parseItems,
  computedSubtotal,
};
