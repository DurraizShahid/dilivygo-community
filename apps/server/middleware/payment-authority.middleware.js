'use strict';

const { getAuthoritativeDeliveryFee } = require('../services/delivery-fee.service');

function subtotalFromCheckoutDraft(draft) {
  return (draft?.groups || []).reduce((sum, group) => {
    const n = Number(group?.subtotalCents);
    return sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  }, 0);
}

function subtotalFromLegacyMetadata(metadata) {
  if (metadata?.subtotalCents != null && String(metadata.subtotalCents).trim() !== '') {
    const n = Number(metadata.subtotalCents);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  if (!metadata?.items) return 0;
  try {
    const items = typeof metadata.items === 'string' ? JSON.parse(metadata.items) : metadata.items;
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const quantity = Number(item?.quantity);
      const unit = Number(item?.unitPriceCents ?? item?.unit_price_cents);
      if (!Number.isFinite(quantity) || !Number.isFinite(unit)) return sum;
      return sum + Math.max(0, Math.floor(quantity)) * Math.max(0, Math.floor(unit));
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Monetary configuration sent by the browser is never authoritative.
 * Recompute the organization's delivery fee before the controller validates
 * the final charge. A tampered amount will therefore fail the controller's
 * existing expected-total check instead of becoming a cheaper Stripe charge.
 */
async function enforceAuthoritativeDeliveryFee(req, _res, next) {
  try {
    const draft = req.body?.checkoutDraft;
    const metadata = req.body?.metadata;
    const projectRef =
      draft?.groups?.[0]?.projectRef ||
      req.projectRef ||
      metadata?.projectRef ||
      null;
    const organizationId =
      req.organizationId ||
      req.customer?.organizationId ||
      req.customer?.organization_id ||
      null;

    if (draft) {
      const subtotalCents = subtotalFromCheckoutDraft(draft);
      draft.deliveryFeeCents = await getAuthoritativeDeliveryFee({
        subtotalCents,
        projectRef,
        organizationId,
      });
      return next();
    }

    if (metadata && metadata.shopId) {
      const subtotalCents = subtotalFromLegacyMetadata(metadata);
      const fee = await getAuthoritativeDeliveryFee({
        subtotalCents,
        projectRef,
        organizationId,
      });
      metadata.deliveryFeeCents = String(fee);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  enforceAuthoritativeDeliveryFee,
  subtotalFromCheckoutDraft,
  subtotalFromLegacyMetadata,
};
