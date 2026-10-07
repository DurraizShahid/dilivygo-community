'use strict';

const { Router } = require('express');
const { parseSession, requireCustomer } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { validate } = require('../middleware/validate.middleware');
const controller = require('../controllers/customer-wallet.controller');
const v = require('../validators/wallet.validator');

const router = Router();

router.use(parseSession, requireCustomer, attachProjectRef, requireProjectRef);

// Paths are relative to `router.use('/customer', …)` in routes/index.js → /api/customer/wallet
router.get('/wallet', controller.getWallet);
router.post('/wallet/topup-intent', validate(v.walletTopupSchema), controller.createTopupIntent);

module.exports = router;
