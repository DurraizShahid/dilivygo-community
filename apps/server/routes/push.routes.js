'use strict';

const { Router } = require('express');
const pushController = require('../controllers/push.controller');
const { validate } = require('../middleware/validate.middleware');
const { parseSession, requireAnyAuth } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { pushTokenSchema } = require('../validators/payment.validator');

const router = Router();

router.use(parseSession, requireAnyAuth, attachProjectRef, requireProjectRef);

router.post('/register',   validate(pushTokenSchema), pushController.registerToken);
router.delete('/register',                            pushController.unregisterToken);

module.exports = router;
