'use strict';

const { Router } = require('express');
const controller = require('../controllers/catalog.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody, sanitizeArrayField } = require('../middleware/sanitize.middleware');
const { requireRole } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const { requireWorkspaceSubscription } = require('../middleware/workspace-subscription.middleware');
const v = require('../validators/catalog.validator');

const router = Router();

router.use(
  attachProjectRef,
  requireProjectRef,
  requireRole('vendor', 'admin'),
  attachShopId,
  requireShopId,
  requireShopAccess,
  requireWorkspaceSubscription,
);

// Categories
router.get('/categories', controller.listCategories);
router.post('/categories', sanitizeBody('name'), validate(v.createCategorySchema), controller.createCategory);
router.patch('/categories/:id', sanitizeBody('name'), validate(v.updateCategorySchema), controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);

// Products
router.get('/products', controller.listProducts);
router.post(
  '/products/bulk',
  sanitizeArrayField('items', 'name', 'description', 'category'),
  validate(v.bulkCreateProductsSchema),
  controller.bulkCreateProducts
);
router.post('/products', sanitizeBody('name', 'description', 'category'), validate(v.createProductSchema), controller.createProduct);
router.patch('/products/:id', sanitizeBody('name', 'description', 'category'), validate(v.updateProductSchema), controller.updateProduct);
router.delete('/products/:id', controller.deleteProduct);

// Product variants
router.get('/products/:productId/variants', controller.listProductVariants);
router.post(
  '/products/:productId/variants',
  sanitizeBody('name'),
  validate(v.createProductVariantSchema),
  controller.createProductVariant
);
router.patch(
  '/product-variants/:variantId',
  sanitizeBody('name'),
  validate(v.updateProductVariantSchema),
  controller.updateProductVariant
);
router.delete('/product-variants/:variantId', controller.deleteProductVariant);

// Modifier Groups
router.get('/products/:productId/modifiers', controller.listModifierGroups);
router.post('/products/:productId/modifiers', sanitizeBody('name'), validate(v.createModifierGroupSchema), controller.createModifierGroup);
router.patch('/modifiers/groups/:groupId', sanitizeBody('name'), validate(v.updateModifierGroupSchema), controller.updateModifierGroup);
router.delete('/modifiers/groups/:groupId', controller.deleteModifierGroup);

// Modifier Options
router.post('/modifiers/groups/:groupId/options', sanitizeBody('name'), validate(v.createModifierOptionSchema), controller.createModifierOption);
router.patch('/modifiers/options/:optionId', sanitizeBody('name'), validate(v.updateModifierOptionSchema), controller.updateModifierOption);
router.delete('/modifiers/options/:optionId', controller.deleteModifierOption);

module.exports = router;
