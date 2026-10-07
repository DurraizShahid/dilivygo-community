'use strict';

const checkoutBatchService = require('../services/checkout-batch.service');
const logger = require('../lib/logger');

function batchIdFromResponse(body) {
  if (body?.__checkoutBatchId) return String(body.__checkoutBatchId);
  const paymentIntentId = body?.paymentIntentId ? String(body.paymentIntentId) : '';
  if (paymentIntentId.startsWith('wallet_')) {
    return paymentIntentId.slice('wallet_'.length) || null;
  }
  return null;
}

function isImmediateCheckoutResponse(body) {
  const paymentIntentId = body?.paymentIntentId ? String(body.paymentIntentId) : '';
  return Boolean(
    body?.isWalletOnly ||
    body?.isDummy ||
    paymentIntentId.startsWith('wallet_') ||
    paymentIntentId.startsWith('pi_dummy_')
  );
}

/**
 * Wallet-only and non-production demo checkouts create their orders before the
 * HTTP response returns, so there is no later Stripe webhook to mark the durable
 * checkout handoff complete. Finalize those batches after downstream inventory
 * middleware has consumed stock but before serializing the successful response.
 *
 * A bookkeeping failure here must not turn an already-created order into a
 * client-visible checkout failure that encourages duplicate ordering. The batch
 * remains pending and the reconciliation job can repair it from order/payment
 * evidence.
 */
function checkoutBatchResponseLifecycle(_req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const finalize = async () => {
      if (res.statusCode >= 400 || !isImmediateCheckoutResponse(body)) {
        return originalJson(body);
      }

      const paymentIntentId = body?.paymentIntentId ? String(body.paymentIntentId) : null;
      const checkoutBatchId = batchIdFromResponse(body);
      if (!paymentIntentId || !checkoutBatchId) return originalJson(body);

      try {
        await checkoutBatchService.attachPaymentIntent(checkoutBatchId, paymentIntentId);
        await checkoutBatchService.completeCheckoutBatch(checkoutBatchId);
      } catch (err) {
        logger.error('Immediate checkout batch finalization failed', {
          checkoutBatchId,
          paymentIntentId,
          error: err.message,
        });
      }

      return originalJson(body);
    };

    return finalize();
  };

  next();
}

module.exports = {
  checkoutBatchResponseLifecycle,
  batchIdFromResponse,
  isImmediateCheckoutResponse,
};
