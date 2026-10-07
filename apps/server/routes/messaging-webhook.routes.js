'use strict';

/**
 * Messaging delivery-callback routes (Phase 06).
 *
 * Mounted ONLY via the explicit `express.raw` snippet documented in
 * `controllers/messaging-webhook.controller.js` (raw body is required for
 * Svix signature verification). Not wired into `routes/index.js` on purpose:
 * this receiver must sit in `app.js` ahead of the JSON body parser, next to
 * the Clerk/Stripe/Nango signed webhooks.
 */

const { Router } = require('express');
const controller = require('../controllers/messaging-webhook.controller');

const router = Router();

router.post(['/resend', '/api/webhooks/resend', '/'], controller.resendWebhook);
router.post(['/twilio/status', '/status'], controller.twilioStatusCallback);

module.exports = router;
