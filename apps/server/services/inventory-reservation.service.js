'use strict';

const { opaqueId } = require('../lib/opaque-id');
const { select, supabaseFetch } = require('../lib/supabase');

function aggregateFiniteVariantRequests(groups) {
  const byVariant = new Map();
  for (const group of groups || []) {
    for (const item of group?.items || []) {
      const variantId = item?.productVariantId || item?.product_variant_id || null;
      const quantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
      if (!variantId || quantity <= 0) continue;
      const key = String(variantId);
      byVariant.set(key, (byVariant.get(key) || 0) + quantity);
    }
  }
  return [...byVariant.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

async function reserveForCheckout(groups, ttlMinutes = 30) {
  const items = aggregateFiniteVariantRequests(groups);
  if (!items.length) return null;
  const reservationId = opaqueId();
  const result = await supabaseFetch('/rest/v1/rpc/reserve_checkout_inventory', {
    method: 'POST',
    body: JSON.stringify({
      p_reservation_id: reservationId,
      p_items: items,
      p_ttl_minutes: ttlMinutes,
    }),
  });
  return typeof result === 'string' ? result : reservationId;
}

async function attachPaymentIntent(reservationId, paymentIntentId) {
  if (!reservationId || !paymentIntentId) return;
  await supabaseFetch('/rest/v1/rpc/attach_inventory_reservation_payment', {
    method: 'POST',
    body: JSON.stringify({
      p_reservation_id: reservationId,
      p_payment_intent_id: paymentIntentId,
    }),
  });
}

async function consume(reservationId) {
  if (!reservationId) return;
  await supabaseFetch('/rest/v1/rpc/consume_inventory_reservation', {
    method: 'POST',
    body: JSON.stringify({ p_reservation_id: reservationId }),
  });
}

async function release(reservationId) {
  if (!reservationId) return;
  await supabaseFetch('/rest/v1/rpc/release_inventory_reservation', {
    method: 'POST',
    body: JSON.stringify({ p_reservation_id: reservationId }),
  });
}

async function listExpiredReserved(limit = 100) {
  return select('inventory_reservations', {
    filters: { status: 'reserved' },
    rawFilters: [`expires_at=lt.${new Date().toISOString()}`],
    order: 'expires_at.asc',
    limit,
  });
}

module.exports = {
  aggregateFiniteVariantRequests,
  reserveForCheckout,
  attachPaymentIntent,
  consume,
  release,
  listExpiredReserved,
};
