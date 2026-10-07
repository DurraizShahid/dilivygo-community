'use strict';

const { Router } = require('express');
const controller = require('../controllers/admin-settings.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireRole } = require('../middleware/auth.middleware');
const { requireProjectRef } = require('../middleware/project-ref.middleware');
const v = require('../validators/admin-settings.validator');

const router = Router();

router.use(requireProjectRef, requireRole('admin'));
router.get('/', controller.getSettings);
router.patch('/', validate(v.updateAdminSettingsSchema), controller.updateSettings);

module.exports = router;
