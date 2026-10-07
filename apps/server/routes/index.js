'use strict';

/**
 * Community Edition route registry.
 *
 * This is the open-source restaurant OS: POS, vendor tools, and
 * single-restaurant ordering. Commercial route groups (rider/dispatch fleet,
 * superadmin console, SaaS control plane, app-builder, talent, AI assistant,
 * and the CX subsystem) are NOT part of this repository — they live in the
 * private Marketplace codebase and must never be re-added here.
 *
 * Defensive rule: every route file required below must exist in
 * ./routes. If you add a route, keep this list alphabetically grouped and
 * update the table in README.md.
 */

const { Router } = require('express');
const { parseSession, requireAnyAuth, requireAdmin } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { requireWorkspaceSubscription } = require('../middleware/workspace-subscription.middleware');
const { globalLimiter } = require('../middleware/rate-limit.middleware');
const { getCsrfToken } = require('../middleware/csrf.middleware');
const sentry = require('../lib/sentry');

const authRoutes            = require('./auth.routes');
const orderRoutes           = require('./order.routes');
const cartRoutes            = require('./cart.routes');
const paymentRoutes         = require('./payment.routes');
const chatRoutes            = require('./chat.routes');
const pushRoutes            = require('./push.routes');
const workspaceRoutes       = require('./workspace.routes');
const publicRoutes          = require('./public.routes');
const ratingRoutes          = require('./rating.routes');
const reviewRoutes          = require('./review.routes');
const tipRoutes             = require('./tip.routes');
const vendorSettingsRoutes  = require('./vendor-settings.routes');
const catalogRoutes         = require('./catalog.routes');
const shopRoutes            = require('./shop.routes');
const addressRoutes         = require('./address.routes');
const promoCodeRoutes       = require('./promo-code.routes');
const favoritesRoutes       = require('./favorites.routes');
const customerWalletRoutes  = require('./customer-wallet.routes');
const uploadRoutes          = require('./upload.routes');
const vendorStripeConnectRoutes = require('./vendor-stripe-connect.routes');
const posHardwareRoutes     = require('./pos-hardware.routes');
const adminSettingsRoutes   = require('./admin-settings.routes');

const router = Router();

router.use(globalLimiter);
router.get('/csrf-token', getCsrfToken);

router.use(parseSession);
router.use(attachProjectRef);
router.use(sentry.scopeTaggingMiddleware);

router.use('/auth',        authRoutes);
router.use('/orders',      orderRoutes);
router.use('/cart',        cartRoutes);
router.use('/chat',        chatRoutes);
router.use('/push',        pushRoutes);
router.use('/workspace',   workspaceRoutes);
router.use('/catalog',     catalogRoutes);
router.use('/shops',       shopRoutes);
router.use('/addresses',     addressRoutes);
router.use('/promo-codes',   promoCodeRoutes);
router.use('/favorites',     favoritesRoutes);
router.use('/customer', customerWalletRoutes);

router.use('/ratings',          requireAnyAuth, ratingRoutes);
router.use('/reviews',          requireAnyAuth, reviewRoutes);
router.use('/tips',             requireAnyAuth, tipRoutes);
router.use(
  '/vendor-settings',
  attachProjectRef,
  requireProjectRef,
  requireAdmin,
  requireWorkspaceSubscription,
  vendorSettingsRoutes,
);
router.use('/vendor/stripe-connect', vendorStripeConnectRoutes);
router.use('/pos-hardware', posHardwareRoutes);
router.use('/admin-settings',  requireAdmin, adminSettingsRoutes);

router.use('/uploads', uploadRoutes);

router.use('/', paymentRoutes);
router.use('/', publicRoutes);

module.exports = router;
