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
jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(), broadcast: jest.fn(), sendToUser: jest.fn(), isUserOnline: jest.fn().mockReturnValue(false),
}));

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const { IDS, makeCartSession, makeCartItem } = require('./helpers/mocks');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

const PROJECT = { 'x-project-ref': 'test-project-ref' };
const CART = `cart_session=${IDS.CART_SESSION}; ${CSRF_COOKIE}`;
const OTHER_CART = `cart_session=a6000000-0000-0000-0000-000000000002; ${CSRF_COOKIE}`;

beforeEach(() => {
  db.select.mockResolvedValue([]);
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  db.remove.mockResolvedValue(null);
});

// ─── GET /api/cart ────────────────────────────────────────────────────────────

describe('GET /api/cart', () => {
  it('returns empty cart', async () => {
    db.select.mockResolvedValue([]);
    const res = await request(app).get('/api/cart').set(PROJECT).set('Cookie', CART);
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toEqual([]);
    expect(res.body.cart.totalCents).toBe(0);
  });

  it('calculates totalCents from items', async () => {
    db.select
      .mockResolvedValueOnce([makeCartSession()])
      .mockResolvedValueOnce([
        makeCartItem({ quantity: 2, unit_price_cents: 1000 }),
        makeCartItem({ id: 'item-2', quantity: 1, unit_price_cents: 500 }),
      ]);
    const res = await request(app).get('/api/cart').set(PROJECT).set('Cookie', CART);
    expect(res.status).toBe(200);
    expect(res.body.cart.totalCents).toBe(2500);
    expect(res.body.cart.items).toHaveLength(2);
  });
});

// ─── PUT /api/cart ────────────────────────────────────────────────────────────

describe('PUT /api/cart', () => {
  it('syncs cart lines even when the payload contains duplicate line ids', async () => {
    db.select.mockResolvedValueOnce([makeCartSession()]);

    const res = await request(app)
      .put('/api/cart')
      .set(PROJECT)
      .set('Cookie', CART)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({
        items: [
          {
            id: IDS.CART_ITEM,
            productId: IDS.PRODUCT,
            name: 'Burger',
            quantity: 1,
            unitPriceCents: 1200,
            notes: 'extra sauce',
          },
          {
            id: IDS.CART_ITEM,
            productId: IDS.PRODUCT,
            name: 'Burger',
            quantity: 2,
            unitPriceCents: 1200,
            notes: 'no onions',
          },
        ],
        shopId: null,
        currency: 'GBP',
      });

    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledWith(
      'cart_items',
      expect.arrayContaining([
        expect.objectContaining({
          id: IDS.CART_ITEM,
          line_project_ref: 'test-project-ref',
          notes: 'extra sauce',
        }),
        expect.objectContaining({
          line_project_ref: 'test-project-ref',
          notes: 'no onions',
        }),
      ])
    );
    const insertedRows = db.insert.mock.calls.find(([, payload]) => Array.isArray(payload))?.[1] || [];
    expect(insertedRows).toHaveLength(2);
    expect(new Set(insertedRows.map((row) => row.id)).size).toBe(2);
  });

  it('keeps product variant lines distinct during sync', async () => {
    db.select.mockResolvedValueOnce([makeCartSession()]);

    const res = await request(app)
      .put('/api/cart')
      .set(PROJECT)
      .set('Cookie', CART)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({
        items: [
          {
            id: 'a7000000-0000-0000-0000-000000000101',
            productId: IDS.PRODUCT,
            productVariantId: 'a5000000-0000-0000-0000-000000000101',
            name: 'Pizza - Small',
            quantity: 1,
            unitPriceCents: 900,
          },
          {
            id: 'a7000000-0000-0000-0000-000000000102',
            productId: IDS.PRODUCT,
            productVariantId: 'a5000000-0000-0000-0000-000000000102',
            name: 'Pizza - Large',
            quantity: 1,
            unitPriceCents: 1400,
          },
        ],
      });

    expect(res.status).toBe(200);
    const insertedRows = db.insert.mock.calls.find(([, payload]) => Array.isArray(payload))?.[1] || [];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_variant_id: 'a5000000-0000-0000-0000-000000000101',
          unit_price_cents: 900,
        }),
        expect.objectContaining({
          product_variant_id: 'a5000000-0000-0000-0000-000000000102',
          unit_price_cents: 1400,
        }),
      ])
    );
  });
});

describe('CartModel merge safeguards', () => {
  const cartModel = require('../models/cart.model');

  it('does not collapse identical products from different shops during login merge', async () => {
    db.select
      .mockResolvedValueOnce([
        makeCartItem({
          id: 'guest-line-shop-a',
          product_id: IDS.PRODUCT,
          shop_id: 'c1000000-0000-0000-0000-000000000001',
          line_project_ref: 'project-a',
          quantity: 1,
        }),
        makeCartItem({
          id: 'guest-line-shop-b',
          product_id: IDS.PRODUCT,
          shop_id: 'c1000000-0000-0000-0000-000000000002',
          line_project_ref: 'project-b',
          quantity: 2,
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await cartModel.mergeIntoSession('guest-session', 'customer-session');

    expect(db.insert).toHaveBeenCalledWith(
      'cart_items',
      expect.objectContaining({
        session_id: 'customer-session',
        product_id: IDS.PRODUCT,
        shop_id: 'c1000000-0000-0000-0000-000000000001',
        line_project_ref: 'project-a',
      })
    );
    expect(db.insert).toHaveBeenCalledWith(
      'cart_items',
      expect.objectContaining({
        session_id: 'customer-session',
        product_id: IDS.PRODUCT,
        shop_id: 'c1000000-0000-0000-0000-000000000002',
        line_project_ref: 'project-b',
      })
    );
    expect(db.update).not.toHaveBeenCalledWith(
      'cart_items',
      expect.objectContaining({ quantity: expect.any(Number) }),
      expect.anything()
    );
    expect(db.remove).toHaveBeenCalledWith('cart_items', { session_id: 'guest-session' });
  });

  it('does not clear the cart when asked to merge a session into itself', async () => {
    await cartModel.mergeIntoSession('same-session', 'same-session');

    expect(db.select).not.toHaveBeenCalled();
    expect(db.remove).not.toHaveBeenCalled();
  });
});

// ─── POST /api/cart ───────────────────────────────────────────────────────────

describe('POST /api/cart', () => {
  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/cart').set(PROJECT)
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for zero quantity', async () => {
    const res = await request(app).post('/api/cart').set(PROJECT)
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ name: 'Burger', quantity: 0, unitPriceCents: 1000 });
    expect(res.status).toBe(400);
  });

  it('adds item to cart', async () => {
    const item = makeCartItem();
    db.select.mockResolvedValueOnce([makeCartSession()]).mockResolvedValueOnce([]);
    db.insert.mockResolvedValue(item);
    const res = await request(app).post('/api/cart').set(PROJECT).set('Cookie', CART)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ name: 'Burger', quantity: 1, unitPriceCents: 1200 });
    expect(res.status).toBe(201);
    expect(res.body.item.name).toBe('Burger');
  });
});

// ─── PATCH /api/cart/:itemId ──────────────────────────────────────────────────

describe('PATCH /api/cart/:itemId', () => {
  it('returns 400 for negative quantity', async () => {
    const res = await request(app).patch('/api/cart/item-001').set(PROJECT)
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ quantity: -1 });
    expect(res.status).toBe(400);
  });

  it('updates item quantity', async () => {
    db.select.mockResolvedValueOnce([makeCartItem()]);
    db.update.mockResolvedValue(makeCartItem({ quantity: 3 }));
    const res = await request(app).patch('/api/cart/item-001').set(PROJECT)
      .set('Cookie', CART).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ quantity: 3 });
    expect(res.status).toBe(200);
  });

  it('removes item when quantity is 0', async () => {
    db.select.mockResolvedValueOnce([makeCartItem()]);
    const res = await request(app).patch('/api/cart/item-001').set(PROJECT)
      .set('Cookie', CART).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ quantity: 0 });
    expect(res.status).toBe(200);
    expect(db.remove).toHaveBeenCalledWith('cart_items', { id: 'item-001' });
  });

  it('does not update an item from another cart session', async () => {
    db.select.mockResolvedValueOnce([makeCartItem()]);
    const res = await request(app).patch('/api/cart/item-001').set(PROJECT)
      .set('Cookie', OTHER_CART).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ quantity: 3 });
    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.remove).not.toHaveBeenCalled();
  });
});

// ─── DELETE /api/cart/:itemId ─────────────────────────────────────────────────

describe('DELETE /api/cart/:itemId', () => {
  it('removes item and returns ok', async () => {
    db.select.mockResolvedValueOnce([makeCartItem()]);
    const res = await request(app).delete('/api/cart/item-001').set(PROJECT)
      .set('Cookie', CART).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('does not delete an item from another cart session', async () => {
    db.select.mockResolvedValueOnce([makeCartItem()]);
    const res = await request(app).delete('/api/cart/item-001').set(PROJECT)
      .set('Cookie', OTHER_CART).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
    expect(res.status).toBe(404);
    expect(db.remove).not.toHaveBeenCalled();
  });
});
