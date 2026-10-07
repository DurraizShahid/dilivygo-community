'use strict';

const { Router } = require('express');
const cartController = require('../controllers/cart.controller');
const { validate } = require('../middleware/validate.middleware');
const { parseSession } = require('../middleware/auth.middleware');
const { attachProjectRef } = require('../middleware/project-ref.middleware');
const v = require('../validators/cart.validator');

const router = Router();

// Cart routes attach session but don't require auth (guest carts are allowed)
router.use(parseSession, attachProjectRef);

router.get('/',               cartController.getCart);
router.put('/',               validate(v.syncCartSchema),      cartController.syncCart);
router.post('/',              validate(v.addItemSchema),     cartController.addItem);
router.patch('/:itemId',      validate(v.updateItemSchema),  cartController.updateItem);
router.delete('/:itemId',                                    cartController.removeItem);
router.post('/merge',         validate(v.mergeCartSchema),   cartController.mergeCart);

module.exports = router;
