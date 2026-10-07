'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function getStripeWebhookContext() {
  return storage.getStore() || null;
}

async function finalizeSuccessfulWebhook(context) {
  const event = context.event;
  if (
    event?.type === 'payment_intent.succeeded'
    && event.data?.object?.metadata?.checkoutBatchId
  ) {
    // The controller has completed fulfillment before it attempts the success
    // response. Mark the financial handoff complete BEFORE the Stripe success
    // ledger is committed; failure here must keep the event retryable.
    const checkoutBatchService = require('../services/checkout-batch.service');
    await checkoutBatchService.completeCheckoutBatch(
      String(event.data.object.metadata.checkoutBatchId),
    );
  }

  const stripeEventModel = require('../models/stripe-event.model');
  await stripeEventModel.commitCurrentEvent();
}

/**
 * Provides request-local state for the Stripe event claim. The controller's
 * existing `recordOnce()` call claims processing, but durable success is written
 * only when it attempts to send a successful `{ received: true }` response.
 * A failed request therefore remains retryable.
 */
function stripeWebhookLifecycle(req, res, next) {
  const context = {
    event: null,
    lock: null,
    finalized: false,
  };

  storage.run(context, () => {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      if (
        body &&
        body.received === true &&
        body.duplicate !== true &&
        context.event &&
        !context.finalized
      ) {
        return finalizeSuccessfulWebhook(context)
          .then(() => originalJson(body));
      }
      return originalJson(body);
    };

    const releaseUnfinishedClaim = () => {
      if (!context.finalized && context.lock) {
        const stripeEventModel = require('../models/stripe-event.model');
        stripeEventModel.releaseCurrentClaim().catch(() => {});
      }
    };

    res.once('close', releaseUnfinishedClaim);
    next();
  });
}

module.exports = {
  getStripeWebhookContext,
  stripeWebhookLifecycle,
  finalizeSuccessfulWebhook,
};
