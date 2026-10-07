'use strict';

const { select, update, supabaseFetch } = require('../lib/supabase');

async function findByOrderAmount(orderId, amountCents) {
  if (!orderId || !amountCents) return null;
  const rows = await select('order_refund_operations', {
    filters: {
      order_id: orderId,
      requested_amount_cents: amountCents,
    },
    limit: 1,
  });
  return rows?.[0] || null;
}

async function ensure({ orderId, amountCents, reason }) {
  const rows = await supabaseFetch('/rest/v1/rpc/ensure_order_refund_operation', {
    method: 'POST',
    body: JSON.stringify({
      p_order_id: orderId,
      p_amount_cents: amountCents,
      p_reason: reason || null,
    }),
  });
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

async function markAttempt(operation) {
  if (!operation?.id) return operation;
  const attempts = Math.max(0, Number(operation.attempts) || 0) + 1;
  const rows = await update('order_refund_operations', {
    attempts,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { id: operation.id, status: 'pending' });
  return Array.isArray(rows) ? rows[0] || { ...operation, attempts } : rows || { ...operation, attempts };
}

async function recordFailure(operation, error) {
  if (!operation?.id) return;
  const message = String(error?.message || error || 'refund operation failed').slice(0, 4000);
  await update('order_refund_operations', {
    last_error: message,
    updated_at: new Date().toISOString(),
  }, { id: operation.id, status: 'pending' });
}

async function markCompleted(operation) {
  if (!operation?.id) return;
  const now = new Date().toISOString();
  await update('order_refund_operations', {
    status: 'completed',
    last_error: null,
    completed_at: now,
    updated_at: now,
  }, { id: operation.id });
}

async function markManualReview(operation, reason) {
  if (!operation?.id) return;
  await update('order_refund_operations', {
    status: 'manual_review',
    last_error: String(reason || 'manual review required').slice(0, 4000),
    updated_at: new Date().toISOString(),
  }, { id: operation.id });
}

async function listPending({ limit = 100, minAgeMs = 60_000 } = {}) {
  const olderThan = new Date(Date.now() - Math.max(0, Number(minAgeMs) || 0)).toISOString();
  return select('order_refund_operations', {
    filters: { status: 'pending' },
    rawFilters: [`updated_at=lt.${olderThan}`],
    order: 'updated_at.asc',
    limit,
  });
}

module.exports = {
  findByOrderAmount,
  ensure,
  markAttempt,
  recordFailure,
  markCompleted,
  markManualReview,
  listPending,
};
