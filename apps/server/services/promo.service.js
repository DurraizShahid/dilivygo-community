'use strict';

const promoCodeModel = require('../models/promo-code.model');
const { formatMoneyCents } = require('../lib/format-money');
const { DEFAULT_CURRENCY } = require('../lib/currency');

async function validatePromoCode(
  code,
  {
    projectRef,
    shopId,
    customerId,
    subtotalCents,
    deliveryFeeCents = 0,
    currency,
    organizationId,
  },
) {
  const displayCurrency = typeof currency === 'string' && currency.trim().length >= 3 ? currency.trim().toLowerCase() : DEFAULT_CURRENCY;
  const fail = (message) => ({
    valid: false,
    discountCents: 0,
    promoCodeId: null,
    freeDelivery: false,
    message,
  });

  if (!code || !code.trim()) return fail('No promo code provided');

  const promo = await promoCodeModel.findByCode(code.trim(), projectRef, shopId, organizationId);
  if (!promo) return fail('Invalid promo code');

  if (!promo.is_active) return fail('This promo code is no longer active');

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    return fail('This promo code is not yet valid');
  }
  if (promo.ends_at && new Date(promo.ends_at) < now) {
    return fail('This promo code has expired');
  }

  if (promo.min_order_cents && subtotalCents < promo.min_order_cents) {
    return fail(`Minimum order of ${formatMoneyCents(promo.min_order_cents, displayCurrency)} required`);
  }

  if (promo.max_uses != null && promo.times_used >= promo.max_uses) {
    return fail('This promo code has reached its usage limit');
  }

  if (customerId && promo.max_uses_per_customer) {
    const count = await promoCodeModel.countRedemptions(promo.id, customerId);
    if (count >= promo.max_uses_per_customer) {
      return fail('You have already used this promo code');
    }
  }

  let discountCents = 0;
  let freeDelivery = false;

  switch (promo.type) {
    case 'percentage': {
      discountCents = Math.round((subtotalCents * promo.value) / 100);
      if (promo.max_discount_cents && discountCents > promo.max_discount_cents) {
        discountCents = promo.max_discount_cents;
      }
      break;
    }
    case 'fixed_amount': {
      discountCents = Math.min(promo.value, subtotalCents);
      break;
    }
    case 'free_delivery': {
      discountCents = deliveryFeeCents;
      freeDelivery = true;
      break;
    }
    default:
      return fail('Unknown promo code type');
  }

  return {
    valid: true,
    discountCents,
    promoCodeId: promo.id,
    freeDelivery,
    message: freeDelivery
      ? 'Free delivery applied!'
      : `Discount of ${formatMoneyCents(discountCents, displayCurrency)} applied!`,
  };
}

module.exports = { validatePromoCode };
