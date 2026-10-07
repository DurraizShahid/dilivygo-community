'use strict';

const { Router } = require('express');
const { requireAdmin, requireRole } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const controller = require('../controllers/vendor-stripe-connect.controller');

const router = Router();

router.use(requireAdmin, requireRole('vendor', 'admin'), attachProjectRef, requireProjectRef);

router.post('/account-link', controller.postAccountLink);
router.get('/status', controller.getStatus);

module.exports = router;
