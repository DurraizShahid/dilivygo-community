'use strict';

const multer = require('multer');
const { processMobileAsset, ALLOWED_MOBILE_ASSET_MIMES } = require('../lib/image-processing');
const logger = require('../lib/logger');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MOBILE_ASSET_MIMES.has(file.mimetype?.toLowerCase())) {
      cb(null, true);
      return;
    }
    const err = new Error('Only PNG, JPEG, and WebP images are allowed for mobile assets');
    err.status = 400;
    cb(err);
  },
});

/**
 * Dedicated upload & normalization middleware for mobile app icon and splash assets.
 *
 * Enforces:
 *   • Max 5 MB payload
 *   • Allowed inputs: PNG, JPEG, WebP only (rejection of GIF/animated formats)
 *   • Icon: square 1:1, min 512×512, downscaled to max 1024×1024
 *   • Splash: portrait (height >= width), min 320×480, max 3200px
 *   • Normalizes output directly to canonical `image/png` buffer
 *
 * @param {string} fieldName - form field name (default 'image')
 */
function mobileAssetUpload(fieldName = 'image') {
  return function handler(req, res, next) {
    upload.single(fieldName)(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Image must be 5 MB or smaller' });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
      }

      if (!req.file?.buffer) {
        return next();
      }

      const surface = typeof req.body?.surface === 'string'
        ? req.body.surface.trim()
        : (typeof req.query?.surface === 'string' ? req.query.surface.trim() : '');
      const kind = typeof req.body?.kind === 'string'
        ? req.body.kind.trim()
        : (typeof req.body?.field === 'string' ? (req.body.field === 'splashUrl' ? 'splash' : 'icon') : 'icon');

      try {
        const originalSize = req.file.size;
        const originalMime = req.file.mimetype;
        const processed = await processMobileAsset(
          req.file.buffer,
          req.file.mimetype,
          kind
        );

        req.file.originalSize = originalSize;
        req.file.originalMimetype = originalMime;
        req.file.buffer = processed.buffer;
        req.file.size = processed.buffer.length;
        req.file.mimetype = processed.mimetype;
        req.file.processed = true;
        req.file.width = processed.width;
        req.file.height = processed.height;

        if (logger?.debug) {
          logger.debug(
            `mobile asset normalized (${kind}): ${originalMime} ${originalSize}B → ${processed.mimetype} ${processed.buffer.length}B (${processed.width}x${processed.height})`
          );
        }

        next();
      } catch (processErr) {
        return res.status(processErr.status || 400).json({
          error: processErr.message || 'Uploaded image could not be processed',
          code: processErr.code || 'INVALID_IMAGE',
        });
      }
    });
  };
}

module.exports = { mobileAssetUpload };
