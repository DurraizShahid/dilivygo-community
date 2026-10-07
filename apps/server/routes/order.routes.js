'use strict';

const { Router } = require('express');
const orderController = require('../controllers/order.controller');
const terminalOrderController = require('../controllers/order-terminal.controller');
const orderStatusController = require('../controllers/order-status.controller');
const orderLifecycleController = require('../controllers/order-lifecycle.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody, sanitizeArrayField } = require('../middleware/sanitize.middleware');
const { requireAnyAuth, requireAdmin, requireRole, requireCustomer } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { attachShopId, requireShopId, requireShopAccess } = require('../middleware/shop.middleware');
const { requireWorkspaceSubscription } = require('../middleware/workspace-subscription.middleware');
const v = require('../validators/order.validator');

const router = Router();

router.use(attachProjectRef, requireProjectRef, requireAnyAuth);

router.get('/', validate(v.listOrdersSchema, 'query'), orderController.listOrders);
router.get('/analytics', requireRole('vendor', 'admin'), validate(v.analyticsQuerySchema, 'query'), orderController.getVendorAnalytics);

router.post(
  '/',
  requireAdmin,
  requireWorkspaceSubscription,
  attachShopId,
  requireShopId,
  validate(v.createOrderSchema),
  orderController.createOrder,
);
router.post(
  '/pos/checkout',
  requireRole('vendor', 'admin'),
  requireWorkspaceSubscription,
  attachShopId,
  requireShopId,
  requireShopAccess,
  sanitizeBody('note'),
  sanitizeArrayField('items', 'notes', 'name'),
  validate(v.posCheckoutSchema),
  orderController.createPosOrder,
);
router.get('/:id/receipt.pdf', orderController.downloadOrderReceipt);
router.post(
  '/:id/refund-requests',
  requireCustomer,
  sanitizeBody('reason'),
  validate(v.createRefundRequestSchema),
  orderController.createRefundRequest,
);
router.get('/:id/refund-requests', requireCustomer, orderController.getRefundRequestForOrder);
router.get('/:id', orderController.getOrder);
router.post('/:id/reorder', validate(v.reorderSchema), orderController.reorderOrder);

router.patch(
  '/:id/status',
  requireRole('admin', 'vendor'),
  requireWorkspaceSubscription,
  validate(v.updateStatusSchema),
  orderStatusController.updateOrderStatus,
);

router.post(
  '/:id/refund',
  requireRole('admin', 'vendor'),
  requireWorkspaceSubscription,
  sanitizeBody('reason'),
  validate(v.refundSchema),
  orderController.refundOrder,
);

router.post(
  '/:id/cancel',
  sanitizeBody('reason'),
  validate(v.cancelSchema),
  terminalOrderController.cancelOrder,
);

router.post(
  '/:id/accept',
  requireRole('vendor', 'admin'),
  requireWorkspaceSubscription,
  validate(v.acceptSchema),
  orderLifecycleController.acceptOrder,
);
router.post(
  '/:id/reject',
  requireRole('vendor', 'admin'),
  requireWorkspaceSubscription,
  sanitizeBody('reason'),
  validate(v.rejectSchema),
  terminalOrderController.rejectOrder,
);
router.post(
  '/:id/extend-sla',
  requireRole('vendor', 'admin'),
  requireWorkspaceSubscription,
  validate(v.extendSlaSchema),
  orderController.extendSla,
);

router.post(
  '/:id/complete',
  requireRole('rider', 'admin'),
  requireWorkspaceSubscription,
  orderLifecycleController.completeOrder,
);

router.get('/:id/rider-location', orderController.getRiderLocation);

module.exports = router;
