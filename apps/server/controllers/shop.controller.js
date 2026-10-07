'use strict';

const shopModel = require('../models/shop.model');
const userShopModel = require('../models/user-shop.model');
const userModel = require('../models/user.model');
const logger = require('../lib/logger');
const { createError } = require('../middleware/error.middleware');
const { mapShop } = require('../lib/case');
const { normalizeShopBodyBrowseCategoryIds } = require('../lib/browse-categories');

async function listShops(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    let shops = await shopModel.findByProjectRef(req.projectRef, { includeInactive });

    // Catalog/POS require `user_shops` for vendors, but admins bypass. Historically
    // `GET /api/shops` returned every shop while vendors without rows still picked a
    // shop and saw an empty menu (catalog 403 → no data). Align listing with access,
    // and one-time backfill legacy vendor accounts that have zero assignments.
    if (req.user?.role === 'vendor' && req.user?.id) {
      let allowedIds = await userShopModel.getShopIdsForUser(req.user.id);
      if (!allowedIds.length && (shops || []).length) {
        const allInWorkspace = await shopModel.findByProjectRef(req.projectRef, {
          includeInactive: true,
        });
        for (const s of allInWorkspace || []) {
          await userShopModel.assignUser(req.user.id, s.id).catch(() => {});
        }
        allowedIds = await userShopModel.getShopIdsForUser(req.user.id);
        if (allowedIds.length) {
          logger.info('user_shops backfilled for vendor with no shop assignments', {
            userId: req.user.id,
            projectRef: req.projectRef,
            shopCount: allowedIds.length,
          });
        }
      }
      const allow = new Set(allowedIds);
      shops = (shops || []).filter((s) => allow.has(s.id));
    }

    return res.json({ shops: (shops || []).map(mapShop) });
  } catch (err) {
    next(err);
  }
}

async function getShop(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    return res.json({ shop: mapShop(shop) });
  } catch (err) {
    next(err);
  }
}

async function createShop(req, res, next) {
  try {
    const body = await normalizeShopBodyBrowseCategoryIds(req.body, { projectRef: req.projectRef });
    const shop = await shopModel.createShop(req.projectRef, body);

    // Auto-assign the creator to the new shop so they can see/manage it
    if (req.user?.id) {
      await userShopModel.assignUser(req.user.id, shop.id).catch(() => {});
    }

    // Also assign all other vendor/admin users in the workspace to the new shop
    const projectUsers = await userModel.findByProjectRef(req.projectRef);
    for (const u of (projectUsers || [])) {
      if (u.id !== req.user?.id && (u.role === 'vendor' || u.role === 'admin')) {
        await userShopModel.assignUser(u.id, shop.id).catch(() => {});
      }
    }

    return res.status(201).json({ shop: mapShop(shop) });
  } catch (err) {
    next(err);
  }
}

async function updateShop(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    const body = await normalizeShopBodyBrowseCategoryIds(req.body, { projectRef: req.projectRef });
    const updated = await shopModel.updateShop(req.params.shopId, body);
    if (!updated) return next(createError('Failed to update shop', 500));
    return res.json({ shop: mapShop(updated) });
  } catch (err) {
    next(err);
  }
}

async function deleteShop(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Access denied', 403));
    await shopModel.updateShop(req.params.shopId, { isActive: false });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function listShopUsers(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Shop not found', 404));

    const assignments = await userShopModel.findByShopId(req.params.shopId);
    const userIds = (assignments || []).map((a) => a.user_id);
    if (!userIds.length) return res.json({ users: [] });

    const users = [];
    for (const uid of userIds) {
      const u = await userModel.findById(uid);
      if (u) users.push({ id: u.id, email: u.email, role: u.role });
    }
    return res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function assignUser(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Shop not found', 404));

    const { userId } = req.body;
    const user = await userModel.findById(userId);
    if (!user) return next(createError('User not found', 404));
    if (user.project_ref !== req.projectRef) return next(createError('User does not belong to this workspace', 403));
    if (user.role !== 'vendor' && user.role !== 'admin') return next(createError('Only vendors and admins can be assigned to shops', 400));
    await userShopModel.assignUser(userId, req.params.shopId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function removeUser(req, res, next) {
  try {
    const shop = await shopModel.findById(req.params.shopId);
    if (!shop) return next(createError('Shop not found', 404));
    if (shop.project_ref !== req.projectRef) return next(createError('Shop not found', 404));

    await userShopModel.removeUser(req.params.userId, req.params.shopId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listShops,
  getShop,
  createShop,
  updateShop,
  deleteShop,
  listShopUsers,
  assignUser,
  removeUser,
};
