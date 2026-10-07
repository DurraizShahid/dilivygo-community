'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn().mockResolvedValue(null),
  getCustomerSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(), broadcast: jest.fn(), sendToUser: jest.fn(), isUserOnline: jest.fn().mockReturnValue(false),
}));
jest.mock('../lib/route-directions', () => ({
  getPublicRouteDirections: jest.fn().mockResolvedValue(null),
}));
jest.mock('../lib/organization-context', () => ({
  resolveOrganizationContext: jest.fn().mockImplementation(async (ref) => {
    const r = String(ref || '').trim();
    if (r === 'test-ref') {
      return {
        organizationId: '00000000-0000-0000-0000-000000000001',
        organizationPublicRef: 'test-ref',
        workspace: { id: 'ws-001', project_ref: 'test-ref' },
        isLegacyMarketplace: false,
      };
    }
    if (r === '_marketplace') {
      return {
        organizationId: '00000000-0000-0000-0000-000000000001',
        organizationPublicRef: '_marketplace',
        workspace: null,
        isLegacyMarketplace: true,
      };
    }
    return null;
  }),
  organizationIdByProjectRef: jest.fn().mockResolvedValue('00000000-0000-0000-0000-000000000001'),
  organizationById: jest.fn().mockResolvedValue(null),
  invalidateOrganizationContext: jest.fn(),
}));
jest.mock('../lib/cache', () => ({
  wrap: jest.fn(async (_ns, _key, fn) => fn()),
  invalidate: jest.fn(),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const { getPublicRouteDirections } = require('../lib/route-directions');
const db = require('../lib/supabase');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

beforeEach(() => {
  db.select.mockResolvedValue([]);
  getPublicRouteDirections.mockResolvedValue(null);
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with required fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.env).toBe('test');
  });

  it('is accessible without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).not.toBe(401);
  });
});

// ─── GET /api/public/:ref/:table ──────────────────────────────────────────────

describe('GET /api/public/:ref/:table', () => {
  it('returns 403 for app_users (non-public table)', async () => {
    const res = await request(app).get('/api/public/test-ref/app_users');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not publicly accessible/i);
  });

  it('returns 403 for push_tokens (non-public table)', async () => {
    const res = await request(app).get('/api/public/test-ref/push_tokens');
    expect(res.status).toBe(403);
  });

  it('returns products for a valid ref', async () => {
    db.select.mockResolvedValue([{ id: 'prod-001', name: 'Burger', price_cents: 1200 }]);
    const res = await request(app).get('/api/public/test-ref/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Burger');
  });

  it('returns 410 for orders without orderId — legacy public read removed', async () => {
    const res = await request(app).get('/api/public/test-ref/orders');
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/no longer available/i);
    expect(res.body.code).toBe('PUBLIC_ORDER_READ_REMOVED');
  });

  it('returns 410 for orders — legacy public read removed (with orderId)', async () => {
    const res = await request(app).get('/api/public/test-ref/orders?orderId=order-001');
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/no longer available/i);
    expect(res.body.code).toBe('PUBLIC_ORDER_READ_REMOVED');
  });

  it('returns 404 for unknown public ref', async () => {
    const res = await request(app).get('/api/public/unknown-ref-xyz/products');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_PUBLIC_SCOPE');
  });
});

// ─── GET /api/route-directions ───────────────────────────────────────────────

describe('GET /api/route-directions', () => {
  it('returns 400 when query params missing', async () => {
    const res = await request(app).get('/api/route-directions');
    expect(res.status).toBe(400);
  });

  it('returns 200 with coordinates when a route exists', async () => {
    getPublicRouteDirections.mockResolvedValue({
      coordinates: [
        { lat: 51.5, lon: -0.12 },
        { lat: 51.51, lon: -0.13 },
      ],
      source: 'google',
    });
    const res = await request(app).get(
      '/api/route-directions?fromLat=51.5&fromLon=-0.12&toLat=51.51&toLon=-0.13',
    );
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('google');
    expect(res.body.coordinates).toHaveLength(2);
  });

  it('returns 404 when no route is available', async () => {
    getPublicRouteDirections.mockResolvedValue(null);
    const res = await request(app).get(
      '/api/route-directions?fromLat=51.5&fromLon=-0.12&toLat=51.51&toLon=-0.13',
    );
    expect(res.status).toBe(404);
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe('404 handler', () => {
  it('returns 404 for unknown GET route', async () => {
    const res = await request(app).get('/api/nonexistent-route-xyz');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 for unknown POST route', async () => {
    const res = await request(app).post('/api/unknown')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
    expect(res.status).toBe(404);
  });
});

// ─── Security headers (Helmet) ────────────────────────────────────────────────

describe('Security headers', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});
