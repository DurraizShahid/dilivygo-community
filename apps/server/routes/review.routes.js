'use strict';

const { Router } = require('express');
const controller = require('../controllers/review.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody } = require('../middleware/sanitize.middleware');
const { requireCustomer, requireRole } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const v = require('../validators/review.validator');

const router = Router();

router.post(
  '/',
  requireCustomer,
  attachProjectRef,
  requireProjectRef,
  sanitizeBody('comment'),
  validate(v.createReviewSchema),
  controller.createReview
);

router.get('/order/:orderId/me', requireCustomer, controller.getMyOrderReview);

router.get(
  '/shop',
  requireRole('admin', 'vendor'),
  attachProjectRef,
  requireProjectRef,
  attachShopId,
  requireShopId,
  requireShopAccess,
  validate(v.listShopReviewsQuerySchema, 'query'),
  controller.listVendorShopReviews
);

module.exports = router;
