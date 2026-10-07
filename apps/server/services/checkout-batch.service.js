'use strict';

const { opaqueId } = require('../lib/opaque-id');
const { select, insert, update, supabaseFetch } = require('../lib/supabase');
const {
  markCheckoutBatchTrusted,
  isTrustedCutlerySnapshot,
} = require('../lib/trusted-checkout-snapshot');

const TTL_DAYS = 7;

function assertPersistableCheckoutBatch(payload) {
  for (const group of payload?.groups || []) {
    const cutlery = group?.wantsCutlery;
    if (cutlery && typeof cutlery === 'object' && !Array.isArray(cutlery)) {
      if (!isTrustedCutlerySnapshot(cutlery)) {
        const err = new Error('Checkout contains an untrusted cutlery fee snapshot');
        err.statusCode = 400;
        throw err;
      }
    }
  }
}

async function saveCheckoutBatch(payload) {
  assertPersistableCheckoutBatch(payload);
  const id = opaqueId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await insert('checkout_batches', [{
    id,
    payload,
    status: 'pending',
    expires_at: expiresAt,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }]);
  return id;
}

async function getCheckoutBatch(id) {
  if (!id || typeof id !== 'string') return null;
  const rows = await select('checkout_batches', {
    filters: { id },
    limit: 1,
  });
  const row = rows?.[0];
  if (!row?.payload) return null;
  return markCheckoutBatchTrusted({
    ...row.payload,
    __checkoutBatchId: row.id,
    __checkoutBatchStatus: row.status || 'pending',
    __paymentIntentId: row.payment_intent_id || null,
  });
}

/**
 * Bind one durable checkout handoff to exactly one payment identifier.
 * The database RPC row-locks the batch and rejects attempts to relink it to a
 * different PaymentIntent; calling this repeatedly with the same id is safe.
 */
async function attachPaymentIntent(id, paymentIntentId) {
  if (!id || !paymentIntentId) return null;
  const rows = await supabaseFetch('/rest/v1/rpc/attach_checkout_batch_payment', {
    method: 'POST',
    body: JSON.stringify({
      p_batch_id: String(id),
      p_payment_intent_id: String(paymentIntentId),
    }),
  });
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

/**
 * Financial fulfillment lookup. Unlike the read helper, a referenced batch may
 * not disappear silently: Stripe should receive a 5xx and retry while operators
 * recover the durable handoff, rather than acknowledging a paid event with no
 * order creation.
 */
async function takeCheckoutBatch(id) {
  const batch = await getCheckoutBatch(id);
  if (batch) return batch;
  const err = new Error('Durable checkout batch is unavailable');
  err.statusCode = 503;
  err.code = 'CHECKOUT_BATCH_MISSING';
  throw err;
}

async function completeCheckoutBatch(id) {
  if (!id || typeof id !== 'string') return;
  const now = new Date().toISOString();
  await update('checkout_batches', {
    status: 'completed',
    completed_at: now,
    updated_at: now,
  }, { id });
}

async function listExpiredPending(limit = 100) {
  return select('checkout_batches', {
    filters: { status: 'pending' },
    rawFilters: [`expires_at=lt.${new Date().toISOString()}`],
    order: 'expires_at.asc',
    limit,
  });
}

async function deleteCheckoutBatch(id) {
  if (!id) return;
  await supabaseFetch(`/rest/v1/checkout_batches?id=eq.${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

module.exports = {
  saveCheckoutBatch,
  getCheckoutBatch,
  takeCheckoutBatch,
  attachPaymentIntent,
  completeCheckoutBatch,
  listExpiredPending,
  deleteCheckoutBatch,
  assertPersistableCheckoutBatch,
};
