'use strict';

/**
 * POS hardware print-job & device routes.
 *
 * Mounted at `/api/pos-hardware` in `routes/index.js`.
 * Authenticated and shop-scoped via:
 *   `requireRole('vendor', 'admin')` +
 *   `attachProjectRef` + `requireProjectRef` +
 *   `attachShopId` + `requireShopId` + `requireShopAccess`
 *
 * Endpoints (all shop-scoped; `:id` cross-scope ⇒ 404):
 *   POST  /print-jobs            idempotent enqueue (scope + key ⇒ same job)
 *   GET   /print-jobs            scoped list (?status=&limit=)
 *   POST  /print-jobs/:id/cancel cancel a non-terminal job
 *   PATCH /print-jobs/:id/status report physical print execution state (sent/acked/failed)
 *   POST  /devices/heartbeat     report workstation/printer device status and heartbeat
 */

const { Router } = require('express');
const posHardwareController = require('../controllers/pos-hardware.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireRole } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const v = require('../validators/pos-hardware.validator');

const router = Router();

router.use(
  requireRole('vendor', 'admin'),
  attachProjectRef,
  requireProjectRef,
  attachShopId,
  requireShopId,
  requireShopAccess,
);

router.post('/print-jobs', validate(v.createPrintJobBody), posHardwareController.createPrintJob);
router.get('/print-jobs', validate(v.listPrintJobsQuery, 'query'), posHardwareController.listPrintJobs);
router.post(
  '/print-jobs/:id/cancel',
  validate(v.printJobParam, 'params'),
  posHardwareController.cancelPrintJob,
);
router.patch(
  '/print-jobs/:id/status',
  validate(v.printJobParam, 'params'),
  validate(v.updatePrintJobStatusBody),
  posHardwareController.updatePrintJobStatus,
);
router.post(
  '/devices/heartbeat',
  validate(v.deviceHeartbeatBody),
  posHardwareController.deviceHeartbeat,
);

module.exports = router;
