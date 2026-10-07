'use strict';

const { supabaseFetch, select } = require('../lib/supabase');
const logger = require('../lib/logger');
const { createError } = require('../middleware/error.middleware');

async function applyRpc(body) {
  const rows = await supabaseFetch('/rest/v1/rpc/customer_wallet_apply', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('wallet apply returned no row');
  return {
    newBalance: Number(row.new_balance ?? row.newBalance),
    ledgerId: String(row.ledger_id ?? row.ledgerId),
  };
}

function checkoutIdempotencySuffix(idempotencyKey) {
  const value = String(idempotencyKey || '');
  const prefix = 'checkout_debit:';
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

/**
 * A checkout fulfillment failure can compensate its wallet debit with
 * `checkout_undo:<base>`. The original debit key remains in the append-only
 * ledger, so a retry of `checkout_debit:<base>` would otherwise be treated as
 * idempotent and make no balance change, leaving the recovered checkout
 * underpaid.
 *
 * Detect that paired compensation and apply exactly one deterministic
 * `checkout_redebit:<base>` movement. Repeated retries then remain idempotent.
 */
async function replayCompensatedCheckoutDebit({
  customerId,
  amountCents,
  idempotencyKey,
  projectRef,
  referenceType,
  referenceId,
  metadata,
}) {
  const suffix = checkoutIdempotencySuffix(idempotencyKey);
  if (!suffix || amountCents >= 0) return null;

  const undoKey = `checkout_undo:${suffix}`;
  const undoRows = await select('customer_wallet_ledger', {
    select: 'id,idempotency_key',
    filters: { idempotency_key: undoKey },
    limit: 1,
  });
  if (!undoRows?.[0]) return null;

  return applyRpc({
    p_customer_id: customerId,
    p_amount_cents: amountCents,
    p_type: 'checkout_debit',
    p_idempotency_key: `checkout_redebit:${suffix}`,
    p_project_ref: projectRef ?? null,
    p_reference_type: referenceType || 'checkout_batch',
    p_reference_id: referenceId || null,
    p_metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      recoveryOf: idempotencyKey,
      compensationKey: undoKey,
    },
  });
}

/**
 * @param {object} params
 * @returns {Promise<{ newBalance: number, ledgerId: string }>}
 */
async function applyWalletDelta(params) {
  const {
    customerId,
    amountCents,
    type,
    idempotencyKey,
    projectRef,
    referenceType,
    referenceId,
    metadata,
  } = params;

  const body = {
    p_customer_id: customerId,
    p_amount_cents: amountCents,
    p_type: type,
    p_idempotency_key: idempotencyKey || null,
    p_project_ref: projectRef ?? null,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_metadata: metadata ?? null,
  };

  try {
    const result = await applyRpc(body);

    if (type === 'checkout_debit') {
      const replay = await replayCompensatedCheckoutDebit({
        customerId,
        amountCents,
        idempotencyKey,
        projectRef,
        referenceType,
        referenceId,
        metadata,
      });
      if (replay) return replay;
    }

    return result;
  } catch (err) {
    const msg = err?.body || err?.message || String(err);
    if (String(msg).includes('insufficient wallet balance')) {
      throw createError('Insufficient wallet balance', 400);
    }
    if (String(msg).includes('customer not found')) {
      throw createError('Customer not found', 404);
    }
    logger.error('customer_wallet_apply failed', { error: msg, customerId });
    throw err;
  }
}

async function getBalance(customerId) {
  const rows = await select('customers', {
    select: 'wallet_balance_cents',
    filters: { id: customerId },
    limit: 1,
  });
  const n = rows?.[0]?.wallet_balance_cents;
  return Number(n ?? 0);
}

async function listLedger(customerId, { limit = 50, offset = 0 } = {}) {
  return select('customer_wallet_ledger', {
    filters: { customer_id: customerId },
    order: 'created_at.desc',
    limit,
    offset,
  });
}

function mapLedgerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    amountCents: row.amount_cents,
    type: row.type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

module.exports = {
  applyWalletDelta,
  getBalance,
  listLedger,
  mapLedgerRow,
  replayCompensatedCheckoutDebit,
  checkoutIdempotencySuffix,
};
