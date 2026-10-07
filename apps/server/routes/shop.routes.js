'use strict';

const { Router } = require('express');
const controller = require('../controllers/shop.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody } = require('../middleware/sanitize.middleware');
const { requireRole, requireAdmin } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const { requireWorkspaceSubscription } = require('../middleware/workspace-subscription.middleware');
const v = require('../validators/shop.validator');

const router = Router();

router.use(attachProjectRef, requireProjectRef, requireRole('vendor', 'admin'), requireWorkspaceSubscription);

router.get('/', controller.listShops);
router.post('/', requireAdmin, sanitizeBody('name', 'description', 'address'), validate(v.createShopSchema), controller.createShop);
router.get('/:shopId', attachShopId, requireShopId, requireShopAccess, controller.getShop);
router.patch('/:shopId', requireAdmin, sanitizeBody('name', 'description', 'address'), validate(v.updateShopSchema), controller.updateShop);
router.delete('/:shopId', requireAdmin, controller.deleteShop);

router.get('/:shopId/users', requireAdmin, controller.listShopUsers);
router.post('/:shopId/users', requireAdmin, validate(v.assignUserSchema), controller.assignUser);
router.delete('/:shopId/users/:userId', requireAdmin, controller.removeUser);

module.exports = router;
