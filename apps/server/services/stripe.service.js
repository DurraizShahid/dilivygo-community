'use strict';

const config = require('../config');
const logger = require('../lib/logger');
const platformSettings = require('../models/platform-settings.model');
const { DEFAULT_CURRENCY } = require('../lib/currency');

let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;
  if (!config.stripe.enabled) return null;
  _stripe = require('stripe')(config.stripe.secretKey);
  return _stripe;
}

function dummyIntent(amountCents) {
  return {
    clientSecret: `dummy_secret_${Date.now()}`,
    paymentIntentId: `pi_dummy_${Date.now()}`,
    isDummy: true,
  };
}

async function isDemoMode() {
  if (config.isProd) return false;
  try {
    const val = await platformSettings.get('demo_mode');
    return val === 'true';
  } catch {
    return false;
  }
}

function requireStripe(operation) {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error(`Stripe is not configured; cannot ${operation}`);
    err.statusCode = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  return stripe;
}

function exposeInternalCheckoutBatchId(result, checkoutBatchId) {
  if (!result || !checkoutBatchId) return result;
  Object.defineProperty(result, '__checkoutBatchId', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: String(checkoutBatchId),
  });
  return result;
}

async function attachCheckoutBatchBeforeReturn(checkoutBatchId, paymentIntentId, stripe = null) {
  if (!checkoutBatchId || !paymentIntentId) return;
  const checkoutBatchService = require('./checkout-batch.service');
  try {
    await checkoutBatchService.attachPaymentIntent(checkoutBatchId, paymentIntentId);
  } catch (err) {
    // A real PaymentIntent has not been exposed to the caller yet, so make a
    // best-effort cancellation before failing the request. Even if cancellation
    // itself fails, the secret never left this function and cannot be confirmed
    // by the customer from this response.
    if (stripe && String(paymentIntentId).startsWith('pi_')) {
      try {
        await stripe.paymentIntents.cancel(
          paymentIntentId,
          {},
          { idempotencyKey: `checkout_batch_link_failed:${paymentIntentId}` },
        );
      } catch (cancelErr) {
        logger.error('Failed to cancel PaymentIntent after checkout batch link failure', {
          checkoutBatchId,
          paymentIntentId,
          error: cancelErr.message,
        });
      }
    }
    err.statusCode = err.statusCode || 503;
    err.code = err.code || 'CHECKOUT_BATCH_PAYMENT_LINK_FAILED';
    throw err;
  }
}

async function createPaymentIntent(amountCents, currency = DEFAULT_CURRENCY, metadata = {}, options = {}) {
  const checkoutBatchId = metadata?.checkoutBatchId || null;

  if (await isDemoMode()) {
    logger.info('[DEMO MODE] Dummy PaymentIntent created', { amountCents });
    const result = dummyIntent(amountCents);
    await attachCheckoutBatchBeforeReturn(checkoutBatchId, result.paymentIntentId, null);
    return exposeInternalCheckoutBatchId(result, checkoutBatchId);
  }

  const stripe = requireStripe('create a PaymentIntent');
  // Phase 03 (payment capability): forward a caller-supplied idempotency key so
  // retries of the same Dilivygo operation can never double-charge. Existing
  // 3-arg callers are unaffected (no key => Stripe generates request scoping).
  const requestOptions = options?.idempotencyKey
    ? { idempotencyKey: options.idempotencyKey }
    : undefined;
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  }, requestOptions);

  await attachCheckoutBatchBeforeReturn(checkoutBatchId, intent.id, stripe);

  return exposeInternalCheckoutBatchId({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    isDummy: false,
  }, checkoutBatchId);
}

/**
 * Capture a previously-authorized (manual-capture) PaymentIntent.
 * Phase 03 (payment capability): called only by services/payment-provider.js.
 * All money movement stays integer cents; callers pass a stable Dilivygo
 * idempotency key so capture retries are safe.
 */
async function capturePaymentIntent(paymentIntentId, options = {}) {
  if (!paymentIntentId) return null;
  const stripe = requireStripe('capture a PaymentIntent');
  const requestOptions = options.idempotencyKey
    ? { idempotencyKey: options.idempotencyKey }
    : undefined;
  return stripe.paymentIntents.capture(paymentIntentId, {}, requestOptions);
}

/**
 * Cancel an unpaid PaymentIntent before releasing inventory that was reserved
 * for it. Stripe rejects cancellation once an intent can no longer be safely
 * cancelled (for example after it succeeds); callers MUST treat that failure as
 * a signal to keep the reservation rather than returning stock to sale.
 */
async function cancelPaymentIntent(paymentIntentId, options = {}) {
  if (!paymentIntentId) return null;
  const stripe = requireStripe('cancel a PaymentIntent');
  const requestOptions = options.idempotencyKey
    ? { idempotencyKey: options.idempotencyKey }
    : undefined;
  return stripe.paymentIntents.cancel(paymentIntentId, {}, requestOptions);
}

async function createConnectExpressAccount({ metadata = {}, country = 'GB', email = undefined }) {
  const stripe = requireStripe('create a Connect account');
  const params = {
    type: 'express',
    country,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata,
  };
  if (email) params.email = email;
  return stripe.accounts.create(params);
}

async function createConnectAccountLink({ accountId, refreshUrl, returnUrl }) {
  const stripe = requireStripe('create an account link');
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

async function retrieveConnectAccount(accountId) {
  const stripe = getStripe();
  if (!stripe) return null;
  return stripe.accounts.retrieve(accountId);
}

/**
 * Full refunds use a deterministic idempotency key by default. This makes a
 * retry after a process crash safe even when the caller did not explicitly
 * supply a key. Partial refunds remain caller-keyed because multiple legitimate
 * partial refunds of the same PaymentIntent may exist.
 */
async function createRefund(paymentIntentId, amountCents, options = {}) {
  const stripe = requireStripe('create a refund');
  const params = { payment_intent: paymentIntentId };
  if (amountCents) params.amount = amountCents;
  if (options.reverseTransfer === true) params.reverse_transfer = true;
  if (options.refundApplicationFee === true) params.refund_application_fee = true;

  const idempotencyKey =
    options.idempotencyKey ||
    (amountCents == null ? `full_refund:${paymentIntentId}` : null);
  const requestOptions = idempotencyKey ? { idempotencyKey } : undefined;
  return stripe.refunds.create(params, requestOptions);
}

async function getPaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) return null;
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = requireStripe('verify a webhook');
  if (!config.stripe.webhookSecret) {
    const err = new Error('Stripe webhook verification is not configured');
    err.statusCode = 503;
    err.code = 'STRIPE_WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

module.exports = {
  getStripe,
  createPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  createRefund,
  getPaymentIntent,
  constructWebhookEvent,
  isDemoMode,
  createConnectExpressAccount,
  createConnectAccountLink,
  retrieveConnectAccount,
};
