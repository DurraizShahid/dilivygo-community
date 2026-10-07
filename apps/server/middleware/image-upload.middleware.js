'use strict';

const multer = require('multer');
const { processImageForUpload } = require('../lib/image-processing');
const logger = require('../lib/logger');

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PNG, JPEG, WebP, and GIF images are allowed'));
  },
});

/**
 * Multer + Sharp image upload middleware.
 *
 * After Multer parses `req.file`, the buffer is run through
 * `processImageForUpload` which:
 *   • strips EXIF/ICC metadata (privacy)
 *   • auto-rotates per EXIF orientation
 *   • resizes to 1200px max (configurable per mount)
 *   • converts to WebP (unless the input is animated GIF / animated WebP)
 *
 * `req.file.buffer` and `req.file.mimetype` are mutated in place so
 * downstream controllers (which all call `uploadImage(req.file.buffer,
 * req.file.mimetype, folder)`) pick up the processed bytes without any
 * changes of their own.
 *
 * The original size is preserved on `req.file.originalSize` for logging.
 *
 * @param {string} fieldName - form field name (default 'image')
 * @param {object} [options]
 * @param {number} [options.maxDim=1200]
 * @param {number} [options.quality=82]
 * @param {boolean} [options.forceWebp=true]
 */
function imageUpload(fieldName = 'image', options = {}) {
  return function handler(req, res, next) {
    upload.single(fieldName)(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'Image must be 5 MB or smaller' });
            return;
          }
          res.status(400).json({ error: err.message });
          return;
        }
        res.status(400).json({ error: err.message || 'Upload failed' });
        return;
      }

      if (!req.file?.buffer) {
        next();
        return;
      }

      try {
        const originalSize = req.file.size;
        const originalMime = req.file.mimetype;
        const processed = await processImageForUpload(
          req.file.buffer,
          req.file.mimetype,
          options
        );
        req.file.originalSize = originalSize;
        req.file.originalMimetype = originalMime;
        req.file.buffer = processed.buffer;
        req.file.size = processed.buffer.length;
        req.file.mimetype = processed.mimetype;
        req.file.processed = !processed.skipped;
        if (!processed.skipped && logger?.debug) {
          const saved = originalSize - processed.buffer.length;
          const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;
          logger.debug(
            `image normalized: ${originalMime} ${originalSize}B → ${processed.mimetype} ${processed.buffer.length}B (${pct}% smaller)`
          );
        }
        next();
      } catch (processErr) {
        logger.error('Image processing middleware failed', { message: processErr.message });
        res.status(400).json({ error: 'Uploaded image could not be processed' });
      }
    });
  };
}

module.exports = { imageUpload };
