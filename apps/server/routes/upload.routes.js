'use strict';

const { Router } = require('express');
const { requireAnyAuth, requireRole } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const { imageUpload } = require('../middleware/image-upload.middleware');
const uploadController = require('../controllers/upload.controller');

const router = Router();

router.use(attachProjectRef, requireProjectRef, requireAnyAuth);

router.post(
  '/product-image',
  imageUpload('image'),
  uploadController.uploadProductImage
);

router.post(
  '/shop-image',
  requireRole('vendor', 'admin'),
  imageUpload('image'),
  uploadController.uploadShopImage
);

router.post(
  '/workspace-logo',
  requireRole('vendor', 'admin'),
  imageUpload('logo'),
  uploadController.uploadWorkspaceLogo
);

module.exports = router;
