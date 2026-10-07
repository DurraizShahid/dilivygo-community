'use strict';

const sharp = require('sharp');
const {
  processImageForUpload,
  isAnimated,
} = require('../lib/image-processing');

/** Build a 2000x2000 red JPEG with a forged EXIF GPS tag in the metadata. */
async function makeBigJpeg() {
  return sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: {
          Make: 'DilivygoTestCam',
          Model: 'Unit Test 9000',
        },
      },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function makeTinyPng() {
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function makeSimpleGif() {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  })
    .gif()
    .toBuffer();
}

describe('lib/image-processing', () => {
  test('downsizes a huge JPEG, converts to WebP, and shrinks bytes', async () => {
    const input = await makeBigJpeg();
    const result = await processImageForUpload(input, 'image/jpeg');

    expect(result.skipped).toBe(false);
    expect(result.mimetype).toBe('image/webp');
    expect(result.buffer.length).toBeLessThan(input.length);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1200);
  });

  test('does not upscale a small PNG (withoutEnlargement)', async () => {
    const input = await makeTinyPng();
    const result = await processImageForUpload(input, 'image/png');

    expect(result.skipped).toBe(false);
    expect(result.mimetype).toBe('image/webp');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  test('strips EXIF metadata after processing', async () => {
    const input = await makeBigJpeg();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();

    const result = await processImageForUpload(input, 'image/jpeg');
    const after = await sharp(result.buffer).metadata();
    expect(after.exif).toBeUndefined();
  });

  test('respects custom maxDim + quality for logo-sized outputs', async () => {
    const input = await makeBigJpeg();
    const result = await processImageForUpload(input, 'image/jpeg', {
      maxDim: 256,
      quality: 88,
    });
    const meta = await sharp(result.buffer).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(256);
  });

  test('passes GIFs through untouched (regardless of animated or not)', async () => {
    const input = await makeSimpleGif();
    const result = await processImageForUpload(input, 'image/gif');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('passthrough:image/gif');
    expect(result.buffer).toBe(input);
    expect(result.mimetype).toBe('image/gif');
  });

  test('isAnimated() returns false for static single-frame images', async () => {
    const png = await makeTinyPng();
    expect(await isAnimated(png)).toBe(false);
    const jpg = await makeBigJpeg();
    expect(await isAnimated(jpg)).toBe(false);
  });

  test('passes unsupported mimetypes through', async () => {
    const input = Buffer.from('not-an-image');
    const result = await processImageForUpload(input, 'application/octet-stream');
    expect(result.skipped).toBe(true);
    expect(result.mimetype).toBe('application/octet-stream');
  });

  test('gracefully passes through corrupt input', async () => {
    const garbage = Buffer.from('this is definitely not a jpeg');
    const result = await processImageForUpload(garbage, 'image/jpeg');
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/^sharp-error:/);
  });

  test('can opt out of WebP conversion with forceWebp=false', async () => {
    const input = await makeBigJpeg();
    const result = await processImageForUpload(input, 'image/jpeg', {
      forceWebp: false,
    });
    expect(result.mimetype).toBe('image/jpeg');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1200);
  });
});
