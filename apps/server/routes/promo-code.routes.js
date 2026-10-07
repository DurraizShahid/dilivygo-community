'use strict';

const { Router } = require('express');
const controller = require('../controllers/promo-code.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAdmin, requireAnyAuth } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const v = require('../validators/promo-code.validator');

const router = Router();

router.use(attachProjectRef, requireProjectRef);

// Customer validation (any authenticated user)
router.post('/validate', requireAnyAuth, validate(v.validatePromoSchema), controller.validatePromo);

// Admin CRUD
router.get('/',          requireAdmin, controller.listPromoCodes);
router.post('/',         requireAdmin, validate(v.createPromoCodeSchema), controller.createPromoCode);
router.patch('/:id',     requireAdmin, validate(v.updatePromoCodeSchema), controller.updatePromoCode);
router.delete('/:id',    requireAdmin, controller.deletePromoCode);

module.exports = router;
