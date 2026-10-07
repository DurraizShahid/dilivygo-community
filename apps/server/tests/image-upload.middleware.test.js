'use strict';

const express = require('express');
const request = require('supertest');
const sharp = require('sharp');

const { imageUpload } = require('../middleware/image-upload.middleware');

function buildApp() {
  const app = express();
  app.post('/upload', imageUpload('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'no file' });
    }
    return res.json({
      mimetype: req.file.mimetype,
      originalMimetype: req.file.originalMimetype,
      size: req.file.size,
      originalSize: req.file.originalSize,
      processed: req.file.processed === true,
      fingerprint: req.file.buffer?.slice(0, 4).toString('hex') || null,
    });
  });
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

async function makeLargeJpeg() {
  return sharp({
    create: {
      width: 1800,
      height: 1800,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('imageUpload middleware + sharp pipeline', () => {
  it('converts a large JPEG to WebP and mutates req.file', async () => {
    const app = buildApp();
    const jpeg = await makeLargeJpeg();

    const res = await request(app)
      .post('/upload')
      .attach('image', jpeg, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(true);
    expect(res.body.mimetype).toBe('image/webp');
    expect(res.body.originalMimetype).toBe('image/jpeg');
    expect(res.body.size).toBeLessThan(res.body.originalSize);
    // WebP riff magic: "RIFF" then 4 size bytes then "WEBP" — first 4 chars are "RIFF".
    expect(res.body.fingerprint.slice(0, 8)).toBe('52494646');
  });

  it('rejects disallowed mimetypes at the Multer fileFilter', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/upload')
      .attach('image', Buffer.from('hello'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG|JPEG|WebP|GIF/);
  });

  it('returns 400 when the image buffer is too large', async () => {
    const app = buildApp();
    const oversize = Buffer.alloc(6 * 1024 * 1024, 0xff);
    const res = await request(app)
      .post('/upload')
      .attach('image', oversize, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 MB/);
  });
});
