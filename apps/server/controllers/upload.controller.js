'use strict';

const { uploadImage } = require('../lib/storage');

async function uploadProductImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const url = await uploadImage(req.file.buffer, req.file.mimetype, 'products');
    return res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

async function uploadShopImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const url = await uploadImage(req.file.buffer, req.file.mimetype, 'shops');
    return res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

async function uploadWorkspaceLogo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    const url = await uploadImage(req.file.buffer, req.file.mimetype, 'workspace-logos');
    return res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadProductImage, uploadShopImage, uploadWorkspaceLogo };
