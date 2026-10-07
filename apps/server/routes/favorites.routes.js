'use strict';

const { Router } = require('express');
const controller = require('../controllers/favorites.controller');
const { validate } = require('../middleware/validate.middleware');
const { attachProjectRef } = require('../middleware/project-ref.middleware');
const { requireCustomer } = require('../middleware/auth.middleware');
const v = require('../validators/favorites.validator');

const router = Router();

router.use(attachProjectRef, requireCustomer);

router.get('/', controller.listFavorites);
router.post('/shops/:shopId', validate(v.favoriteShopParamsSchema, 'params'), controller.addFavoriteShop);
router.delete('/shops/:shopId', validate(v.favoriteShopParamsSchema, 'params'), controller.removeFavoriteShop);
router.post('/products/:productId', validate(v.favoriteProductParamsSchema, 'params'), controller.addFavoriteProduct);
router.delete('/products/:productId', validate(v.favoriteProductParamsSchema, 'params'), controller.removeFavoriteProduct);

module.exports = router;
