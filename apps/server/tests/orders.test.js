'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
}));

jest.mock('../models/user.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
  findByProjectRef: jest.fn().mockResolvedValue([]),
}));

jest.mock('../models/customer.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn().mockResolvedValue(null),
  getCustomerSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/stripe.service', () => ({
  createRefund: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded' }),
  createPaymentIntent: jest.fn().mockResolvedValue({ clientSecret: 'pi_test_secret', paymentIntentId: 'pi_test' }),
  getPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_test', metadata: {} }),
}));
jest.mock('../services/notification.service', () => ({
  notifyNewOrder: jest.fn().mockResolvedValue(undefined),
  notifyShopStaffNewOrder: jest.fn().mockResolvedValue(undefined),
  notifyOrderStatusChange: jest.fn().mockResolvedValue(undefined),
  sendRefundEmail: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/host-scope', () => ({
  resolveAuthHostScope: jest.fn().mockResolvedValue(null),
  staffHostMismatchResponse: jest.fn().mockReturnValue(null),
  STAFF_SURFACES: new Set(['vendor', 'pos']),
  PLATFORM_SURFACES: new Set(['superadmin']),
  CUSTOMER_FACING_SURFACES: new Set(['customer', 'rider']),
}));
jest.mock('../websocket/ws-server', () => {
  const broadcast = jest.fn();
  return {
    init: jest.fn(),
    broadcast,
    fanOrderToWorkspaceAndMarketplaceCustomer: jest.fn((projectRef, _customerId, message) => {
      broadcast(projectRef, message);
      return 1;
    }),
    sendToUser: jest.fn(),
    isUserOnline: jest.fn().mockReturnValue(false),
  };
});

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const sessionService = require('../services/session.service');
const ws = require('../websocket/ws-server');
const stripeService = require('../services/stripe.service');
const { makeOrder, makeOrderItem, makeCustomer, IDS } = require('./helpers/mocks');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

const ADMIN_COOKIE = `admin_session=test-admin-sid; ${CSRF_COOKIE}`;
const PROJECT_HEADER = { 'x-project-ref': 'test-project-ref' };
const ADMIN_SESSION = { id: IDS.USER, email: 'admin@test.com', role: 'admin', projectRef: 'test-project-ref', type: 'admin' };

beforeEach(() => {
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
  db.select.mockResolvedValue([]);
  db.update.mockResolvedValue({});
});

// ─── GET /api/orders ──────────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/orders').set(PROJECT_HEADER);
    expect(res.status).toBe(401);
  });

  it('returns orders for authenticated admin', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder(), makeOrder({ id: 'order-002' })]);
    const res = await request(app).get('/api/orders').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(2);
  });

  it('filters by status', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ status: 'completed' })]);
    const res = await request(app).get('/api/orders?status=completed').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.orders[0].status).toBe('completed');
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  it('returns 404 when order not found', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([]);
    const res = await request(app).get(`/api/orders/${IDS.ORDER}`).set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(404);
  });

  it('returns 403 for different project — multi-tenant isolation', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ project_ref: 'OTHER-PROJECT' })]);
    const res = await request(app).get(`/api/orders/${IDS.ORDER}`).set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(403);
  });

  it('returns order with items', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ order_items: [makeOrderItem()] })]);
    const res = await request(app).get(`/api/orders/${IDS.ORDER}`).set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(IDS.ORDER);
  });
});

// ─── PATCH /api/orders/:id/status ────────────────────────────────────────────

describe('PATCH /api/orders/:id/status', () => {
  it('returns 400 for invalid status', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app).patch(`/api/orders/${IDS.ORDER}/status`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when order not found', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([]);
    const res = await request(app).patch(`/api/orders/${IDS.ORDER}/status`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ status: 'accepted' });
    expect(res.status).toBe(404);
  });

  it('updates status and broadcasts WS event', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const order = makeOrder({ status: 'placed' });
    const updated = { ...order, status: 'accepted', updated_at: new Date().toISOString() };
    db.select.mockResolvedValue([order]);
    db.supabaseFetch.mockResolvedValue([updated]);
    const res = await request(app).patch(`/api/orders/${IDS.ORDER}/status`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(ws.broadcast).toHaveBeenCalledWith('test-project-ref',
      expect.objectContaining({ type: 'order:status_changed', status: 'accepted' }));
  });
});

// ─── POST /api/orders/:id/refund ──────────────────────────────────────────────

describe('POST /api/orders/:id/refund', () => {
  it('returns 400 when order not paid', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ payment_status: 'unpaid' })]);
    const res = await request(app).post(`/api/orders/${IDS.ORDER}/refund`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been paid/i);
  });

  it('processes refund for paid order', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const order = makeOrder({ payment_status: 'paid', payment_intent_id: 'pi_test', total_cents: 2500 });
    // Durable refund flow: controller load → re-read under lock → payout
    // transfer lookup → org resolve.
    db.select
      .mockResolvedValueOnce([order])
      .mockResolvedValueOnce([order])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(app).post(`/api/orders/${IDS.ORDER}/refund`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ reason: 'Customer request' });
    expect(res.status).toBe(200);
    expect(stripeService.createRefund).toHaveBeenCalled();
  });
});

// ─── POST /api/orders/:id/cancel ─────────────────────────────────────────────

describe('POST /api/orders/:id/cancel', () => {
  it('returns 400 for non-cancellable status', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ status: 'completed' })]);
    const res = await request(app).post(`/api/orders/${IDS.ORDER}/cancel`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot cancel/i);
  });

  it('cancels a pending order', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select
      .mockResolvedValueOnce([makeOrder({ status: 'placed', payment_status: 'unpaid' })])
      .mockResolvedValueOnce([makeCustomer()]);
    const res = await request(app).post(`/api/orders/${IDS.ORDER}/cancel`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ reason: 'Out of stock', initiator: 'vendor' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('cleans up active delivery and notifies assigned rider when order is cancelled', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const mockOrder = makeOrder({ status: 'accepted', payment_status: 'unpaid' });
    const mockDelivery = { id: 'del-123', order_id: IDS.ORDER, rider_id: 'rider-456', status: 'assigned' };

    db.select.mockImplementation(async (table) => {
      if (table === 'orders') return [mockOrder];
      if (table === 'order_items') return [];
      if (table === 'customers') return [makeCustomer()];
      if (table === 'deliveries') return [mockDelivery];
      return [];
    });

    const wsServer = require('../websocket/ws-server');

    const res = await request(app).post(`/api/orders/${IDS.ORDER}/cancel`)
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ reason: 'Out of stock', initiator: 'vendor' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.remove).toHaveBeenCalledWith('deliveries', { id: 'del-123' });
    expect(wsServer.sendToUser).toHaveBeenCalledWith('rider-456', expect.objectContaining({
      type: 'delivery:cancelled',
      deliveryId: 'del-123',
      orderId: IDS.ORDER,
    }));
  });
});
