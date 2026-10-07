'use strict';

const request = require('supertest');
const config = require('../config');

describe('/api/docs', () => {
  if (!config.enableApiDocs) {
    it.skip('skipped — ENABLE_API_DOCS is not enabled in production', () => {});
    return;
  }

  const app = require('../app');

  it('GET /api/docs/ serves Swagger UI (200)', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(String(res.text)).toContain('swagger');
  });

  it('GET /api/docs/openapi.json returns OpenAPI document', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/api/health']).toBeDefined();
  });
});
