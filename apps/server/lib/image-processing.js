'use strict';

/**
 * Sharp-based image normalization pipeline for uploads.
 *
 * Goals:
 *   • Strip EXIF / ICC metadata (privacy: GPS tags, camera serial, etc.).
 *   • Auto-rotate based on the original EXIF orientation tag (because we are
 *     about to discard that tag).
 *   • Downsize to a sane max dimension (default 1200px on the longest edge,
 *     logos use a smaller `maxDim` — see `platform-logo-upload.middleware.js`).
 *   • Re-encode to WebP when possible — materially smaller bytes than JPEG
 *     at the same perceived quality, and smaller than lossless PNG.
 *
 * Animated inputs (GIF, animated WebP) are passed through unchanged so we
 * don't accidentally flatten a multi-frame asset to a single frame. SVGs and
 * any unknown mimetypes also pass through — libvips can rasterize SVG but the
 * upload pipeline's `fileFilter` only permits PNG/JPEG/WebP/GIF today.
 */

const sharp = require('sharp');
const logger = require('./logger');

const DEFAULT_MAX_DIMENSION = 1200;
const DEFAULT_WEBP_QUALITY = 82;

const STATIC_RASTER_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const PASSTHROUGH_MIMES = new Set([
  'image/gif', // animated — sharp would only keep the first frame by default
  'image/svg+xml',
]);

/**
 * Cheap animated-image detection without a full decode. Sharp's metadata
 * probe returns `pages > 1` for animated GIFs and animated WebPs.
 */
async function isAnimated(buffer) {
  try {
    const meta = await sharp(buffer, { animated: true }).metadata();
    return (meta.pages || 1) > 1;
  } catch {
    return false;
  }
}

/**
 * Normalize an uploaded image buffer.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {object} [options]
 * @param {number} [options.maxDim] - longest-edge cap in px. Default 1200.
 * @param {number} [options.quality] - WebP quality 1..100. Default 82.
 * @param {boolean} [options.forceWebp] - convert even PNG logos to WebP.
 *   Default true.
 * @returns {Promise<{ buffer: Buffer, mimetype: string, skipped: boolean, reason?: string }>}
 */
async function processImageForUpload(buffer, mimetype, options = {}) {
  const {
    maxDim = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_WEBP_QUALITY,
    forceWebp = true,
  } = options;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { buffer, mimetype, skipped: true, reason: 'empty-buffer' };
  }

  const mime = String(mimetype || '').toLowerCase();

  if (PASSTHROUGH_MIMES.has(mime)) {
    return { buffer, mimetype: mime, skipped: true, reason: `passthrough:${mime}` };
  }

  if (!STATIC_RASTER_MIMES.has(mime)) {
    // Unknown/unsupported — don't touch it, let downstream validators decide.
    return { buffer, mimetype, skipped: true, reason: `unsupported:${mime}` };
  }

  // Animated WebP uploads should survive the pipeline untouched.
  if (mime === 'image/webp' && (await isAnimated(buffer))) {
    return { buffer, mimetype, skipped: true, reason: 'animated-webp' };
  }

  try {
    const pipeline = sharp(buffer, { failOn: 'error' })
      .rotate() // honour EXIF orientation, then drop it
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (forceWebp) {
      const out = await pipeline
        .webp({ quality, effort: 4 })
        .toBuffer();
      return { buffer: out, mimetype: 'image/webp', skipped: false };
    }

    // Keep original encoding but still strip metadata + resize.
    const out = await pipeline.toBuffer();
    return { buffer: out, mimetype: mime, skipped: false };
  } catch (err) {
    logger.warn(`sharp processing failed (${mime}): ${err.message} — passing original through`);
    return { buffer, mimetype, skipped: true, reason: `sharp-error:${err.message}` };
  }
}

const ALLOWED_MOBILE_ASSET_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/**
 * Dedicated normalization pipeline for mobile app icons and splash screens.
 *
 * Rules:
 *   • Accepts static PNG, JPEG, WebP inputs.
 *   • Rejects GIF and animated WebP.
 *   • Icon: Must be square (1:1), minimum 512×512, target/cap 1024×1024.
 *   • Splash: Must be portrait (height >= width), minimum 320×480, max 3200px longest edge.
 *   • Strips metadata and auto-rotates per EXIF orientation.
 *   • Always outputs canonical `image/png` bytes.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {'icon'|'splash'} kind
 * @returns {Promise<{ buffer: Buffer, mimetype: 'image/png', width: number, height: number }>}
 */
async function processMobileAsset(buffer, mimetype, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('No image buffer provided');
    err.status = 400;
    throw err;
  }

  const mime = String(mimetype || '').toLowerCase();
  if (!ALLOWED_MOBILE_ASSET_MIMES.has(mime)) {
    const err = new Error('Only static PNG, JPEG, and WebP images are allowed for mobile assets');
    err.status = 400;
    throw err;
  }

  // Reject animated images (GIFs or multi-frame WebPs)
  if (await isAnimated(buffer)) {
    const err = new Error('Animated images are not supported for mobile assets');
    err.status = 400;
    throw err;
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (probeErr) {
    const err = new Error(`Failed to decode image: ${probeErr.message}`);
    err.status = 400;
    throw err;
  }

  const { width, height } = metadata;
  if (!width || !height) {
    const err = new Error('Unable to determine image dimensions');
    err.status = 400;
    throw err;
  }

  const normalizedKind = kind === 'splash' ? 'splash' : 'icon';

  let pipeline = sharp(buffer, { failOn: 'error' }).rotate(); // auto-rotate & strip EXIF

  if (normalizedKind === 'icon') {
    if (width !== height) {
      const err = new Error(
        `Mobile app icon must be a square image (aspect ratio 1:1). Received ${width}×${height} px.`
      );
      err.status = 400;
      throw err;
    }
    if (width < 512 || height < 512) {
      const err = new Error(
        `Mobile app icon is too small (${width}×${height} px). Minimum resolution is 512×512 px (1024×1024 px recommended).`
      );
      err.status = 400;
      throw err;
    }

    pipeline = pipeline.resize({
      width: 1024,
      height: 1024,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else {
    // Splash screen
    if (width > height) {
      const err = new Error(
        `Mobile splash image must be portrait (height >= width). Received landscape image (${width}×${height} px).`
      );
      err.status = 400;
      throw err;
    }
    if (width < 320 || height < 480) {
      const err = new Error(
        `Mobile splash image is too small (${width}×${height} px). Minimum resolution is 320×480 px (1284×2778 px recommended).`
      );
      err.status = 400;
      throw err;
    }

    // Preserve high resolution portrait artwork (up to 3200px longest edge)
    pipeline = pipeline.resize({
      width: 2000,
      height: 3200,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const outBuffer = await pipeline
    .png({ compressionLevel: 9, effort: 4 })
    .toBuffer();

  const finalMeta = await sharp(outBuffer).metadata();

  return {
    buffer: outBuffer,
    mimetype: 'image/png',
    width: finalMeta.width || width,
    height: finalMeta.height || height,
  };
}

module.exports = {
  processImageForUpload,
  processMobileAsset,
  isAnimated,
  DEFAULT_MAX_DIMENSION,
  DEFAULT_WEBP_QUALITY,
  ALLOWED_MOBILE_ASSET_MIMES,
};

