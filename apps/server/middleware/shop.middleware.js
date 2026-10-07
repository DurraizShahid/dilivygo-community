'use strict';

const shopModel = require('../models/shop.model');
const userShopModel = require('../models/user-shop.model');

/**
 * Extract shopId from multiple sources and attach to req.
 *
 * Priority:
 *   1. req.params.shopId
 *   2. req.body.shopId
 *   3. req.query.shopId
 *   4. req.headers['x-shop-id']
 */
function attachShopId(req, res, next) {
  req.shopId =
    req.params.shopId ||
    req.body?.shopId ||
    req.query?.shopId ||
    req.headers['x-shop-id'] ||
    null;
  next();
}

function requireShopId(req, res, next) {
  if (!req.shopId) {
    return res.status(400).json({ error: 'Shop ID is required' });
  }
  next();
}

/**
 * Verify the caller has access to the shop referenced by req.shopId.
 * - Admin users have access to all shops within their project_ref.
 * - Vendor-role users must be assigned to the shop via user_shops.
 * Also verifies the shop belongs to the caller's project_ref.
 */
function requireShopAccess(req, res, next) {
  const shopId = req.shopId;
  if (!shopId) {
    return res.status(400).json({ error: 'Shop ID is required' });
  }

  (async () => {
    const shop = await shopModel.findById(shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    if (shop.project_ref !== req.projectRef) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.shop = shop;

    if (req.user?.role === 'admin') {
      return next();
    }

    const hasAccess = await userShopModel.hasAccess(req.user.id, shopId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this shop' });
    }
    next();
  })().catch(next);
}

module.exports = { attachShopId, requireShopId, requireShopAccess };
