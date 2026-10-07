'use strict';

const { Router } = require('express');
const tipController = require('../controllers/tip.controller');
const { requireCustomer, requireAdmin, requireRole } = require('../middleware/auth.middleware');

const router = Router();

// Community Edition: tips are customer -> restaurant. Rider tip endpoints
// (fleet payroll) are part of the commercial Marketplace suite.
router.post('/',              requireCustomer,                            tipController.createTip);

module.exports = router;
