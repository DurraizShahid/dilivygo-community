'use strict';

const { Router } = require('express');
const controller = require('../controllers/address.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody } = require('../middleware/sanitize.middleware');
const { requireCustomer } = require('../middleware/auth.middleware');
const v = require('../validators/address.validator');

const router = Router();

router.use(requireCustomer);

router.get('/',          controller.listAddresses);
router.post('/',         sanitizeBody('label', 'addressLine1', 'addressLine2', 'city'), validate(v.createAddressSchema),   controller.createAddress);
router.patch('/:id',     sanitizeBody('label', 'addressLine1', 'addressLine2', 'city'), validate(v.updateAddressSchema),   controller.updateAddress);
router.post('/:id/default',                                 controller.setDefault);
router.delete('/:id',                                       controller.deleteAddress);

module.exports = router;
