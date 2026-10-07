'use strict';

/**
 * Canonical payment capability — Stripe reference implementation (Phase 03).
 *
 * Business code (including the future Keenu provider) must program against
 * THIS interface, never against `stripe.service.js` or the Stripe SDK
 * directly. Keenu will implement the same function shapes with
 * `provider: 'keenu'` operation rows.
 *
 * Normalized statuses: 'pending' | 'requires_action' | 'succeeded' |
 *   'failed' | 'cancelled' | 'refunded' | 'unknown'
 *
 * Idempotency-key derivation (stable Dilivygo operation IDs, `${id}:${purpose}`
 * style). An explicit `idempotencyKey` argument always wins; otherwise:
 *   - create : `${orderId}:payment_create`
 *   - capture: `${providerPaymentId}:payment_capture`
 *   - cancel : `${providerPaymentId}:payment_cancel`
 *   - refund : `${providerPaymentId}:payment_refund_full` (full) or
 *              `${providerPaymentId}:payment_refund:${amountCents}` (partial)
 * `orderId` here is the stable Dilivygo operation id for the payment attempt
 * (real order UUID when known, otherwise the checkout-batch id or wallet
 * top-up key). Retrying with the same ids reuses the same Stripe
 * idempotency key, so a process crash between the Stripe call and our
 * response can never double-charge.
 *
 * 3DS/SCA (async confirmation path): Stripe may return a PaymentIntent with
 * status `requires_action` (customer must complete 3DS in the browser/app via
 * the returned clientSecret). The adapter surfaces that state verbatim —
 * callers must NOT treat the payment as settled until a later `queryPayment`
 * (or the `payment_intent.succeeded` webhook) reports `succeeded`.
 *
 * Money: integer cents everywhere. Non-integer, negative, or zero create
 * amounts throw `PAYMENT_INVALID_AMOUNT`. No floats, no `toFixed`.
 *
 * Secrets: `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` stay server-only
 * inside `stripe.service.js`. This adapter never logs client secrets,
 * signatures, or raw credential material — only ids, statuses, integer
 * amounts, currency codes, and organization ids.
 *
 * Operation records: every adapter write best-effort inserts/updates a
 * `payment_operations` row (migration 113) correlating Dilivygo ids ↔ Stripe
 * ids ↔ idempotency keys ↔ webhook event ids. Ledger writes never fail the
 * payment itself — they log and continue.
 */

const stripeService = require('./stripe.service');
const logger = require('../lib/logger');
const { validCurrency, DEFAULT_CURRENCY } = require('../lib/currency');

const PROVIDER = 'stripe';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function providerError(message, { statusCode = 502, code = 'PAYMENT_PROVIDER_ERROR' } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** Ensure every thrown error carries `{ statusCode, code }`. */
function normalizeError(err, fallbackCode = 'PAYMENT_PROVIDER_ERROR') {
  if (err && typeof err.statusCode === 'number' && typeof err.code === 'string') return err;
  const wrapped = new Error((err && err.message) || 'Payment provider call failed');
  wrapped.statusCode = (err && err.statusCode) || 502;
  wrapped.code = (err && err.code) || fallbackCode;
  if (err && err.stack) wrapped.stack = err.stack;
  return wrapped;
}

function assertAmountCents(amountCents, { allowZero = false } = {}) {
  if (!Number.isInteger(amountCents) || amountCents < 0 || (!allowZero && amountCents <= 0)) {
    throw providerError(`Invalid amountCents: expected a positive integer number of cents, got ${String(amountCents)}`, {
      statusCode: 400,
      code: 'PAYMENT_INVALID_AMOUNT',
    });
  }
  return amountCents;
}

function assertOrderId(orderId) {
  if (typeof orderId !== 'string' || !orderId.trim()) {
    throw providerError('Invalid orderId: expected a non-empty stable Dilivygo operation id', {
      statusCode: 400,
      code: 'PAYMENT_INVALID_ORDER',
    });
  }
  return orderId.trim();
}

function assertProviderPaymentId(providerPaymentId) {
  if (typeof providerPaymentId !== 'string' || !providerPaymentId.trim()) {
    throw providerError('Invalid providerPaymentId: expected a non-empty provider payment id', {
      statusCode: 400,
      code: 'PAYMENT_INVALID_ID',
    });
  }
  return providerPaymentId.trim();
}

function resolveCurrency(currency) {
  if (currency == null || String(currency).trim() === '') return DEFAULT_CURRENCY;
  const canonical = validCurrency(currency);
  if (!canonical) {
    throw providerError(`Invalid currency: ${String(currency)}`, {
      statusCode: 400,
      code: 'PAYMENT_INVALID_CURRENCY',
    });
  }
  return canonical;
}

function asOrderUuid(orderId) {
  return UUID_RE.test(String(orderId)) ? String(orderId) : null;
}

/**
 * Map a Stripe payment-ish status string onto the canonical normalized set.
 * Unknown / unrecognized values map to 'unknown' (never throw on new Stripe
 * states — flag them, don't crash on them).
 */
function normalizePaymentStatus(stripeStatus) {
  if (stripeStatus == null) return 'unknown';
  const s = String(stripeStatus).trim().toLowerCase();
  switch (s) {
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_capture':
    case 'processing':
    case 'pending':
      return 'pending';
    case 'requires_action':
      return 'requires_action';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    default:
      return 'unknown';
  }
}

function isSyntheticPaymentId(providerPaymentId) {
  const id = String(providerPaymentId || '');
  return id.startsWith('wallet_') || id.startsWith('pi_dummy_');
}

/** Best-effort ledger write. Never throws — payments must not fail on it. */
async function recordOperation({
  organizationId = null,
  orderId = null,
  purpose,
  providerPaymentId = null,
  idempotencyKey = null,
  status = 'pending',
  rawStatus = null,
  webhookEventId = null,
  amountCents = null,
  currency = null,
}) {
  try {
    const { insert } = require('../lib/supabase');
    await insert('payment_operations', [{
      organization_id: organizationId || null,
      order_id: orderId ? asOrderUuid(orderId) : null,
      dilivygo_reference: orderId ? String(orderId) : null,
      purpose,
      provider: PROVIDER,
      provider_payment_id: providerPaymentId ? String(providerPaymentId) : null,
      idempotency_key: idempotencyKey ? String(idempotencyKey) : null,
      status,
      raw_status: rawStatus ? String(rawStatus) : null,
      webhook_event_id: webhookEventId ? String(webhookEventId) : null,
      amount_cents: Number.isInteger(amountCents) ? amountCents : null,
      currency: currency ? String(currency) : null,
    }]);
  } catch (err) {
    const conflict = err && (err.status === 409 || err.statusCode === 409);
    const level = conflict ? 'info' : 'warn';
    logger[level](conflict ? 'payment_operations duplicate ignored (retry-safe)' : 'payment_operations record failed (non-blocking)', {
      purpose,
      providerPaymentId: providerPaymentId || null,
      idempotencyKey: idempotencyKey || null,
      error: err && err.message ? err.message : String(err),
    });
  }
}

/**
 * Best-effort status update of the canonical `order_payment` row for a Stripe
 * PaymentIntent. Used by webhook handlers and the reconciliation job.
 * Never throws.
 */
async function updatePaymentOperation({ providerPaymentId, status, rawStatus = null, webhookEventId = null }) {
  try {
    if (!providerPaymentId || !status) return false;
    const { update } = require('../lib/supabase');
    await update(
      'payment_operations',
      {
        status,
        raw_status: rawStatus ? String(rawStatus) : null,
        ...(webhookEventId ? { webhook_event_id: String(webhookEventId) } : {}),
        updated_at: new Date().toISOString(),
      },
      { provider_payment_id: String(providerPaymentId), purpose: 'order_payment' },
    );
    return true;
  } catch (err) {
    logger.warn('payment_operations update failed (non-blocking)', {
      providerPaymentId: providerPaymentId || null,
      status: status || null,
      error: err && err.message ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Create a Stripe PaymentIntent for a Dilivygo payment attempt.
 * @returns {Promise<{ providerPaymentId: string, status: string, raw: object }>}
 */
async function createPayment({ organizationId = null, orderId, amountCents, currency, idempotencyKey = null, method = null } = {}) {
  try {
    const stableOrderId = assertOrderId(orderId);
    assertAmountCents(amountCents);
    const canonicalCurrency = resolveCurrency(currency);
    const key = (typeof idempotencyKey === 'string' && idempotencyKey.trim())
      ? idempotencyKey.trim()
      : `${stableOrderId}:payment_create`;

    const metadata = { dilivygo_order_id: stableOrderId };
    if (organizationId) metadata.organization_id = String(organizationId);
    if (method != null && String(method).trim() !== '') {
      metadata.payment_method_hint = String(method).trim().slice(0, 120);
    }

    const result = await stripeService.createPaymentIntent(
      amountCents,
      canonicalCurrency,
      metadata,
      { idempotencyKey: key },
    );

    // Demo-mode dummy intents bypass Stripe; the caller (checkout flow)
    // fulfills immediately, so report them as succeeded with an explicit
    // `isDummy` marker. Never reachable in production (`isDemoMode` is
    // false when `NODE_ENV=production`).
    const status = result && result.isDummy ? 'succeeded' : 'pending';

    logger.info('payment created', {
      organizationId: organizationId || null,
      orderId: stableOrderId,
      providerPaymentId: result && result.paymentIntentId ? result.paymentIntentId : null,
      amountCents,
      currency: canonicalCurrency,
    });

    await recordOperation({
      organizationId,
      orderId: stableOrderId,
      purpose: 'order_payment',
      providerPaymentId: result ? result.paymentIntentId : null,
      idempotencyKey: key,
      status,
      rawStatus: result && result.isDummy ? 'dummy' : 'requires_payment_method',
      amountCents,
      currency: canonicalCurrency,
    });

    return {
      providerPaymentId: result.paymentIntentId,
      status,
      raw: result,
    };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Retrieve authoritative Stripe state for a payment.
 * @returns {Promise<{ status: string, raw: object }>}
 */
async function queryPayment({ organizationId = null, providerPaymentId } = {}) {
  try {
    const pid = assertProviderPaymentId(providerPaymentId);

    if (isSyntheticPaymentId(pid)) {
      // `wallet_*` (wallet-only checkout, no Stripe money) and `pi_dummy_*`
      // (demo bypass) never touch Stripe — report settled without a call.
      return { status: 'succeeded', raw: { id: pid, synthetic: true } };
    }

    const intent = await stripeService.getPaymentIntent(pid);
    if (!intent) {
      throw providerError('Payment provider is not configured; cannot query payment', {
        statusCode: 503,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      });
    }
    logger.info('payment queried', {
      organizationId: organizationId || null,
      providerPaymentId: pid,
      stripeStatus: intent.status || null,
    });
    return { status: normalizePaymentStatus(intent.status), raw: intent };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Capture a previously-authorized (manual-capture) PaymentIntent.
 * @returns {Promise<{ providerPaymentId: string, status: string, raw: object }>}
 */
async function capturePayment({ organizationId = null, providerPaymentId, idempotencyKey = null } = {}) {
  try {
    const pid = assertProviderPaymentId(providerPaymentId);
    if (isSyntheticPaymentId(pid)) {
      return { providerPaymentId: pid, status: 'succeeded', raw: { id: pid, synthetic: true } };
    }
    const key = (typeof idempotencyKey === 'string' && idempotencyKey.trim())
      ? idempotencyKey.trim()
      : `${pid}:payment_capture`;
    const captured = await stripeService.capturePaymentIntent(pid, { idempotencyKey: key });
    const status = normalizePaymentStatus(captured && captured.status);
    logger.info('payment captured', {
      organizationId: organizationId || null,
      providerPaymentId: pid,
      stripeStatus: captured && captured.status ? captured.status : null,
    });
    await recordOperation({
      organizationId,
      purpose: 'order_payment_capture',
      providerPaymentId: pid,
      idempotencyKey: key,
      status,
      rawStatus: captured && captured.status ? String(captured.status) : null,
    });
    return { providerPaymentId: pid, status, raw: captured };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Cancel an uncaptured PaymentIntent.
 * @returns {Promise<{ providerPaymentId: string, status: string, raw: object }>}
 */
async function cancelPayment({ organizationId = null, providerPaymentId, idempotencyKey = null } = {}) {
  try {
    const pid = assertProviderPaymentId(providerPaymentId);
    if (isSyntheticPaymentId(pid)) {
      return { providerPaymentId: pid, status: 'cancelled', raw: { id: pid, synthetic: true } };
    }
    const key = (typeof idempotencyKey === 'string' && idempotencyKey.trim())
      ? idempotencyKey.trim()
      : `${pid}:payment_cancel`;
    const canceled = await stripeService.cancelPaymentIntent(pid, { idempotencyKey: key });
    const status = normalizePaymentStatus(canceled && canceled.status);
    logger.info('payment cancelled', {
      organizationId: organizationId || null,
      providerPaymentId: pid,
      stripeStatus: canceled && canceled.status ? canceled.status : null,
    });
    await updatePaymentOperation({
      providerPaymentId: pid,
      status: 'cancelled',
      rawStatus: canceled && canceled.status ? String(canceled.status) : 'canceled',
    });
    return { providerPaymentId: pid, status, raw: canceled };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Refund a PaymentIntent (full when `amountCents` is null/undefined).
 * Synthetic (wallet/dummy) ids are never refunded via Stripe — wallet
 * refunds flow through `wallet.service` instead.
 * @returns {Promise<{ providerPaymentId: string, status: string, raw: object }>}
 */
async function refundPayment({ organizationId = null, providerPaymentId, amountCents = null, idempotencyKey = null } = {}) {
  try {
    const pid = assertProviderPaymentId(providerPaymentId);
    if (isSyntheticPaymentId(pid)) {
      throw providerError('Synthetic payments carry no Stripe funds; refund via the wallet ledger instead', {
        statusCode: 409,
        code: 'PAYMENT_NOT_REFUNDABLE_VIA_PROVIDER',
      });
    }
    let amountOrNull = null;
    if (amountCents != null) {
      assertAmountCents(amountCents);
      amountOrNull = amountCents;
    }
    const key = (typeof idempotencyKey === 'string' && idempotencyKey.trim())
      ? idempotencyKey.trim()
      : (amountOrNull == null
        ? `${pid}:payment_refund_full`
        : `${pid}:payment_refund:${amountOrNull}`);

    const refund = await stripeService.createRefund(pid, amountOrNull, { idempotencyKey: key });
    // A succeeded Stripe refund means funds were returned: normalize to
    // 'refunded' (not 'succeeded', which describes payment capture).
    const rawStatus = refund && refund.status ? String(refund.status) : null;
    const status = rawStatus && rawStatus.toLowerCase() === 'succeeded'
      ? 'refunded'
      : normalizePaymentStatus(rawStatus);
    logger.info('payment refund issued', {
      organizationId: organizationId || null,
      providerPaymentId: pid,
      refundId: refund && refund.id ? refund.id : null,
      amountCents: amountOrNull,
    });
    await recordOperation({
      organizationId,
      purpose: 'order_refund',
      providerPaymentId: refund && refund.id ? refund.id : pid,
      idempotencyKey: key,
      status,
      rawStatus,
      amountCents: amountOrNull,
      currency: refund && refund.currency ? String(refund.currency) : null,
    });
    return { providerPaymentId: refund && refund.id ? refund.id : pid, status, raw: refund };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Verify a Stripe webhook signature. Boolean only — never throws, never logs
 * the signature itself.
 */
function verifyWebhookSignature(rawBody, signature) {
  try {
    if (!rawBody || !signature) return false;
    stripeService.constructWebhookEvent(rawBody, signature);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  PROVIDER,
  normalizePaymentStatus,
  createPayment,
  queryPayment,
  capturePayment,
  cancelPayment,
  refundPayment,
  verifyWebhookSignature,
  updatePaymentOperation,
};
