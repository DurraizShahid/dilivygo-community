'use strict';

const { Router } = require('express');
const vendorSettingsController = require('../controllers/vendor-settings.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireRole } = require('../middleware/auth.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const v = require('../validators/vendor-settings.validator');

const router = Router();

// `requireShopAccess` enforces both that the shop belongs to the caller's
// workspace (`shop.project_ref === req.projectRef`) and — for vendor-role users
// — that they are assigned to it via `user_shops`. Without this guard, any
// workspace admin could read/write vendor settings of another workspace's
// shop by passing an `x-shop-id` header or `?shopId=` query param.
router.use(
  requireRole('vendor', 'admin'),
  attachShopId,
  requireShopId,
  requireShopAccess,
);

router.get('/',    vendorSettingsController.getSettings);
router.patch('/',  validate(v.updateSettingsSchema), vendorSettingsController.updateSettings);

module.exports = router;
