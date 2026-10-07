'use strict';

const { Router } = require('express');
const paymentController = require('../controllers/payment.controller');
const { validate } = require('../middleware/validate.middleware');
const { parseSession, requireAnyAuth } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { canonicalizeLegacyOrderCheckout } = require('../middleware/legacy-checkout-canonicalization.middleware');
const { enforceAuthoritativeCurrency } = require('../middleware/currency-authority.middleware');
const { enforceAuthoritativeDeliveryFee } = require('../middleware/payment-authority.middleware');
const { snapshotCheckoutCutlery } = require('../middleware/cutlery-snapshot.middleware');
const { checkoutBatchResponseLifecycle } = require('../middleware/checkout-batch-response.middleware');
const { reserveCheckoutInventory } = require('../middleware/inventory-reservation.middleware');
const { paymentLimiter } = require('../middleware/rate-limit.middleware');
const { createIntentSchema } = require('../validators/payment.validator');

const router = Router();

// Stripe webhook is mounted directly in app.js before express.json() so the
// signature verifier receives Stripe's exact raw bytes.

router.post(
  '/payments/create-intent',
  parseSession,
  requireAnyAuth,
  attachProjectRef,
  requireProjectRef,
  paymentLimiter,
  validate(createIntentSchema),
  canonicalizeLegacyOrderCheckout,
  enforceAuthoritativeCurrency,
  enforceAuthoritativeDeliveryFee,
  snapshotCheckoutCutlery,
  // Install the batch response wrapper BEFORE inventory installs its wrapper.
  // Inventory therefore consumes immediate stock first, then calls through to
  // batch finalization, and only then is the success body serialized.
  checkoutBatchResponseLifecycle,
  reserveCheckoutInventory,
  paymentController.createIntent
);

module.exports = router;
