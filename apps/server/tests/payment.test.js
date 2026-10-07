'use strict';

/**
 * Comprehensive Payment Integration Tests for Dilivygo Platform
 * 
 * Test Categories:
 * 1. Stripe Payment Intent Creation
 * 2. Webhook Handling (Idempotency)
 * 3. Refund Processing
 * 4. Failed Payment Handling
 * 5. Payment Flow End-to-End
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
  SupabaseError: class SupabaseError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn().mockResolvedValue(null),
  getCustomerSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  getPaymentIntent: jest.fn(),
  constructWebhookEvent: jest.fn(),
  isDemoMode: jest.fn().mockResolvedValue(false),
}));

jest.mock('../services/notification.service', () => ({
  notifyNewOrder: jest.fn().mockResolvedValue(undefined),
  notifyShopStaffNewOrder: jest.fn().mockResolvedValue(undefined),
  notifyOrderStatusChange: jest.fn().mockResolvedValue(undefined),
  notifyOrderConfirmation: jest.fn().mockResolvedValue(undefined),
  notifyOrderRejected: jest.fn().mockResolvedValue(undefined),
  sendRefundEmail: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

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

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn((key) => {
    if (key === 'default_currency') return Promise.resolve('gbp');
    return Promise.resolve(null);
  }),
}));

jest.mock('../models/shop.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../models/vendor-settings.model', () => ({
  findByShopId: jest.fn().mockResolvedValue(null),
  findByProjectRef: jest.fn().mockResolvedValue(null),
}));

jest.mock('../models/stripe-event.model', () => ({
  recordOnce: jest.fn().mockResolvedValue(true),
}));

jest.mock('../models/order.model', () => ({
  findByProjectRef: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  findWithItems: jest.fn().mockResolvedValue(null),
  createWithItems: jest.fn().mockResolvedValue(null),
  updateStatus: jest.fn().mockResolvedValue({}),
  applyRefund: jest.fn().mockResolvedValue({}),
  cancel: jest.fn().mockResolvedValue({}),
  reject: jest.fn().mockResolvedValue({}),
  setSlaDeadline: jest.fn().mockResolvedValue({}),
  validateTransition: jest.fn().mockReturnValue(true),
  isCancellable: jest.fn().mockReturnValue(true),
}));

jest.mock('../models/customer.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/promo.service', () => ({
  validatePromoCode: jest.fn().mockResolvedValue({ valid: false }),
}));

jest.mock('../lib/shop-hours', () => ({
  getShopOpenState: jest.fn().mockReturnValue({ isOpen: true }),
}));

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const sessionService = require('../services/session.service');
const stripeService = require('../services/stripe.service');
const stripeEventModel = require('../models/stripe-event.model');
const orderModel = require('../models/order.model');
const shopModel = require('../models/shop.model');
const vendorSettingsModel = require('../models/vendor-settings.model');
const shopHours = require('../lib/shop-hours');
const promoService = require('../services/promo.service');
const ws = require('../websocket/ws-server');

const { makeOrder, makeCustomer, IDS } = require('./helpers/mocks');

const CUSTOMER_COOKIE = 'customer_session=test-customer-sid';
const ADMIN_COOKIE = 'admin_session=test-admin-sid';
const PROJECT_HEADER = { 'x-project-ref': 'test-project-ref' };

const CUSTOMER_SESSION = {
  id: IDS.CUSTOMER,
  phone: '+447700900000',
  name: 'Test Customer',
  projectRef: 'test-project-ref',
  type: 'customer',
};

const ADMIN_SESSION = {
  id: IDS.USER,
  email: 'admin@test.com',
  role: 'admin',
  projectRef: 'test-project-ref',
  type: 'admin',
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
  db.select.mockResolvedValue([]);
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  stripeService.isDemoMode.mockResolvedValue(false);
  stripeEventModel.recordOnce.mockResolvedValue(true);
  shopHours.getShopOpenState.mockReturnValue({ isOpen: true });
  promoService.validatePromoCode.mockResolvedValue({ valid: false });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STRIPE PAYMENT INTENT CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('1. Stripe Payment Intent Creation', () => {
  describe('POST /api/payments/create-intent', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set(PROJECT_HEADER)
        .send({ amountCents: 2500, currency: 'gbp' });
      expect(res.status).toBe(401);
    });

    it('creates payment intent with valid order data', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret_xxx',
        paymentIntentId: 'pi_test_xxx',
        isDummy: false,
      });
      // Mock shop lookup when shopId is provided
      shopModel.findById.mockResolvedValue({
        id: IDS.PRODUCT,
        project_ref: 'test-project-ref',
        is_active: true,
      });

      // Legacy metadata is canonicalized into a checkout draft; the client's
      // delivery fee is ignored and replaced by the server-authoritative fee
      // (default 250) computed from the tenant delivery-fee config, so the total
      // is 2500 subtotal + 250 fee = 2750.
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2750,
          currency: 'gbp',
          metadata: {
            customerId: IDS.CUSTOMER,
            shopId: IDS.PRODUCT,
            totalCents: '2500',
            deliveryFeeCents: '0', // tampered value — must be overridden server-side
            items: JSON.stringify([{ name: 'Burger', quantity: 1, unitPriceCents: 2500 }]),
            address: '123 Test Street',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBe('pi_test_secret_xxx');
      expect(res.body.paymentIntentId).toBe('pi_test_xxx');
      expect(res.body.isDummy).toBe(false);
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2750,
        'gbp',
        expect.objectContaining({ projectRef: 'test-project-ref' })
      );
    });

    it('returns 400 for negative amount', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: -100,
          currency: 'gbp',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for zero amount', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 0,
          currency: 'gbp',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing amountCents', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          currency: 'gbp',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid currency format', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'pounds', // Invalid - must be 3-letter code
        });

      expect(res.status).toBe(400);
    });

    it('normalizes currency to lowercase', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'GBP',
        });

      expect(res.status).toBe(200);
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2500,
        'gbp',
        expect.any(Object)
      );
    });

    it('defaults currency to platform default_currency when not provided', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
        });

      expect(res.status).toBe(200);
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2500,
        'gbp',
        expect.any(Object)
      );
    });

    it('returns 409 when shop is closed', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      shopHours.getShopOpenState.mockReturnValue({ isOpen: false });
      shopModel.findById.mockResolvedValue({
        id: IDS.PRODUCT,
        project_ref: 'test-project-ref',
        is_active: true,
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'gbp',
          metadata: {
            shopId: IDS.PRODUCT,
          },
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/closed/i);
    });

    it('returns 400 when below minimum order amount', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      shopModel.findById.mockResolvedValue({
        id: IDS.PRODUCT,
        project_ref: 'test-project-ref',
        is_active: true,
      });
      vendorSettingsModel.findByShopId.mockResolvedValue({
        minimum_order_cents: 1000,
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 500,
          currency: 'gbp',
          metadata: {
            shopId: IDS.PRODUCT,
            subtotalCents: '500',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/minimum order/i);
    });

    it('applies promo code discount to amount', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });
      promoService.validatePromoCode.mockResolvedValue({
        valid: true,
        discountCents: 500,
        promoCodeId: 'promo-001',
        freeDelivery: false,
        message: 'Discount applied',
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'gbp',
          metadata: {
            promoCode: 'SAVE10',
            subtotalCents: '2500',
          },
        });

      expect(res.status).toBe(200);
      // Should charge 2500 - 500 = 2000
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2000,
        'gbp',
        expect.objectContaining({ discountCents: '500' })
      );
      expect(res.body.promoApplied).toBeDefined();
    });

    it('does not double-discount promo amount when subtotal metadata is provided', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });
      shopModel.findById.mockResolvedValue({
        id: IDS.PRODUCT,
        project_ref: 'test-project-ref',
        is_active: true,
      });
      promoService.validatePromoCode.mockResolvedValue({
        valid: true,
        discountCents: 500,
        promoCodeId: 'promo-001',
        freeDelivery: false,
        message: 'Discount applied',
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2250, // Authoritative total: 2500 subtotal - 500 promo + 250 server fee
          currency: 'gbp',
          metadata: {
            customerId: IDS.CUSTOMER,
            shopId: IDS.PRODUCT,
            subtotalCents: '2500',
            deliveryFeeCents: '0', // tampered value — overridden by server-authoritative fee
            promoCode: 'SAVE500',
            items: JSON.stringify([{ name: 'Burger', quantity: 1, unitPriceCents: 2500 }]),
            address: '123 Test Street',
          },
        });

      expect(res.status).toBe(200);
      // Charged amount must equal validated payable total, not payable-minus-discount.
      // Discount + promo provenance now lives in the durable checkout batch, not
      // Stripe metadata (metadata only carries the batch handoff reference).
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2250,
        'gbp',
        expect.objectContaining({
          projectRef: 'test-project-ref',
          checkoutBatchId: expect.any(String),
        })
      );
      expect(db.insert).toHaveBeenCalledWith(
        'checkout_batches',
        [
          expect.objectContaining({
            payload: expect.objectContaining({
              discountCents: 500,
              promoCodeId: 'promo-001',
              deliveryFeeCents: 250,
            }),
          }),
        ]
      );
      expect(res.body.promoApplied).toBeDefined();
    });

    it('ensures minimum charge of 50 cents (Stripe minimum)', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });
      promoService.validatePromoCode.mockResolvedValue({
        valid: true,
        discountCents: 2500, // Discount equals full amount
        promoCodeId: 'promo-001',
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'gbp',
          metadata: {
            promoCode: 'HUGE_DISCOUNT',
            subtotalCents: '2500',
          },
        });

      expect(res.status).toBe(200);
      // Even with discount >= amount, should charge minimum 50
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        50,
        'gbp',
        expect.any(Object)
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. WEBHOOK HANDLING (IDEMPOTENCY)
// ═══════════════════════════════════════════════════════════════════════════════

describe('2. Webhook Handling (Idempotency)', () => {
  describe('POST /api/webhooks/stripe', () => {
    const validPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_123',
          amount: 2500,
          currency: 'gbp',
          metadata: {
            projectRef: 'test-project-ref',
            customerId: IDS.CUSTOMER,
            totalCents: '2500',
            items: JSON.stringify([{ name: 'Burger', quantity: 1, unitPriceCents: 2500 }]),
          },
        },
      },
    });

    it('rejects webhook with invalid signature', async () => {
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid_signature')
        .send(Buffer.from(validPayload));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature verification failed/i);
    });

    it('processes payment_intent.succeeded event and creates order', async () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 2500,
            currency: 'gbp',
            metadata: {
              projectRef: 'test-project-ref',
              customerId: IDS.CUSTOMER,
              totalCents: '2500',
              items: JSON.stringify([{ name: 'Burger', quantity: 1, unitPriceCents: 2500 }]),
              address: '123 Test St',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);
      orderModel.createWithItems.mockResolvedValue({
        id: IDS.ORDER,
        status: 'placed',
        created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(validPayload));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(stripeEventModel.recordOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_test_123',
          type: 'payment_intent.succeeded',
        }),
      );
      expect(orderModel.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId: 'pi_test_123',
          projectRef: 'test-project-ref',
          customerId: IDS.CUSTOMER,
          totalCents: 2500,
        })
      );
      expect(ws.broadcast).toHaveBeenCalledWith(
        'test-project-ref',
        expect.objectContaining({ type: 'order:status_changed' })
      );
    });

    it('ignores duplicate webhook event (idempotency)', async () => {
      const mockEvent = {
        id: 'evt_test_duplicate',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 2500,
            metadata: { projectRef: 'test-project-ref' },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(false); // Already processed

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.duplicate).toBe(true);
      // Order should NOT be created for duplicate
      expect(orderModel.createWithItems).not.toHaveBeenCalled();
    });

    it('handles payment_intent.payment_failed event', async () => {
      const mockEvent = {
        id: 'evt_test_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed',
            amount: 2500,
            last_payment_error: { message: 'Card declined' },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('handles charge.refunded event', async () => {
      const mockEvent = {
        id: 'evt_test_refunded',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_123',
            payment_intent: 'pi_test_123',
            amount_refunded: 2500,
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('handles unhandled event types gracefully', async () => {
      const mockEvent = {
        id: 'evt_test_unhandled',
        type: 'customer.created',
        data: { object: { id: 'cus_test' } },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('logs warning when projectRef is missing in metadata', async () => {
      const mockEvent = {
        id: 'evt_test_no_ref',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_no_ref',
            amount: 2500,
            metadata: {}, // No projectRef!
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      // Order should NOT be created without projectRef
      expect(orderModel.createWithItems).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REFUND PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('3. Refund Processing', () => {
  describe('POST /api/orders/:id/refund', () => {
    it('returns 404 when order not found', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when order is not paid', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      orderModel.findWithItems.mockResolvedValue(
        makeOrder({ payment_status: 'unpaid' })
      );

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not been paid/i);
    });

    it('returns 200 (idempotent recovery) when order is already fully refunded', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      orderModel.findWithItems.mockResolvedValue(
        makeOrder({ payment_status: 'refunded' })
      );

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Durable refunds are idempotent: recovering a committed refund must not
      // re-move money or re-write the order state for the same amount.
      expect(stripeService.createRefund).not.toHaveBeenCalled();
      expect(orderModel.applyRefund).not.toHaveBeenCalled();
    });

    it('processes full refund when amountCents not specified', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });
      db.select.mockResolvedValue([makeCustomer()]);

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.refundAmount).toBe(2500);
      // Full refund - no amount specified → refund the full Stripe charge
      // through a deterministic idempotency key for crash-safe recovery.
      expect(stripeService.createRefund).toHaveBeenCalledWith(
        'pi_test_123',
        2500,
        expect.objectContaining({
          idempotencyKey: `order_refund:${IDS.ORDER}:2500:stripe`,
        })
      );
    });

    it('processes partial refund when amountCents specified', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });
      db.select.mockResolvedValue([makeCustomer()]);

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ amountCents: 1000, reason: 'Partial refund - item out of stock' });

      expect(res.status).toBe(200);
      expect(res.body.refundAmount).toBe(1000);
      expect(stripeService.createRefund).toHaveBeenCalledWith(
        'pi_test_123',
        1000,
        expect.objectContaining({
          idempotencyKey: `order_refund:${IDS.ORDER}:1000:stripe`,
        })
      );
      expect(orderModel.applyRefund).toHaveBeenCalledWith(
        IDS.ORDER,
        expect.objectContaining({ isPartial: true, amountCents: 1000 })
      );
    });

    it('marks order as partially_refunded for partial refunds', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });
      db.select.mockResolvedValue([makeCustomer()]);

      await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ amountCents: 500, reason: 'Partial' });

      expect(orderModel.applyRefund).toHaveBeenCalledWith(
        IDS.ORDER,
        expect.objectContaining({ isPartial: true })
      );
    });

    it('marks order as refunded for full refunds', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });
      db.select.mockResolvedValue([makeCustomer()]);

      await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Full refund' });

      expect(orderModel.applyRefund).toHaveBeenCalledWith(
        IDS.ORDER,
        expect.objectContaining({ isPartial: false })
      );
    });

    it('sends refund email to customer', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
        customer_id: IDS.CUSTOMER,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });

      const customerModel = require('../models/customer.model');
      customerModel.findById.mockResolvedValue(makeCustomer({ email: 'customer@test.com' }));

      await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Customer request' });

      const notificationService = require('../services/notification.service');
      expect(notificationService.sendRefundEmail).toHaveBeenCalled();
    });

    it('writes audit log for refund', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const order = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_test_123',
        total_cents: 2500,
      });
      orderModel.findWithItems.mockResolvedValue(order);
      stripeService.createRefund.mockResolvedValue({ id: 're_test', status: 'succeeded' });
      stripeService.getPaymentIntent.mockResolvedValue({ id: 'pi_test_123', metadata: {} });
      db.select.mockResolvedValue([makeCustomer()]);

      await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ amountCents: 1000, reason: 'Test refund' });

      const { writeAuditLog } = require('../lib/audit');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment.refunded',
          resourceType: 'order',
          resourceId: IDS.ORDER,
        })
      );
    });

    it('returns 403 for different project (multi-tenant isolation)', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      orderModel.findWithItems.mockResolvedValue(
        makeOrder({ project_ref: 'OTHER-PROJECT', payment_status: 'paid' })
      );

      const res = await request(app)
        .post(`/api/orders/${IDS.ORDER}/refund`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ reason: 'Test' });

      expect(res.status).toBe(403);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FAILED PAYMENT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('4. Failed Payment Handling', () => {
  describe('Stripe test card scenarios', () => {
    // Note: These tests verify the handling of failed payment events
    // Actual Stripe test card testing would require integration tests

    it('handles declined payment (card_declined)', async () => {
      const mockEvent = {
        id: 'evt_declined',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_declined',
            amount: 2500,
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card was declined.',
              type: 'card_error',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      // Order should NOT be created for failed payment
      expect(orderModel.createWithItems).not.toHaveBeenCalled();
    });

    it('handles insufficient funds error', async () => {
      const mockEvent = {
        id: 'evt_insufficient',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_insufficient',
            amount: 2500,
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card does not have enough funds.',
              decline_code: 'insufficient_funds',
              type: 'card_error',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('handles lost card error', async () => {
      const mockEvent = {
        id: 'evt_lost_card',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_lost',
            amount: 2500,
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card has been declined. Please contact your bank.',
              decline_code: 'lost_card',
              type: 'card_error',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('handles generic payment failure', async () => {
      const mockEvent = {
        id: 'evt_generic_fail',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_generic_fail',
            amount: 2500,
            last_payment_error: {
              message: 'An unexpected error occurred.',
              type: 'api_error',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(mockEvent)));

      expect(res.status).toBe(200);
    });
  });

  describe('Order state after failed payment', () => {
    it('order should not exist after failed payment', async () => {
      // When payment fails, no order should be created
      const failedEvent = {
        id: 'evt_fail_no_order',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail_no_order',
            amount: 2500,
            metadata: { projectRef: 'test-project-ref' },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(failedEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);

      await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(failedEvent)));

      // Verify order was NOT created
      expect(orderModel.createWithItems).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PAYMENT FLOW END-TO-END
// ═══════════════════════════════════════════════════════════════════════════════

describe('5. Payment Flow End-to-End', () => {
  describe('Complete checkout flow', () => {
    it('customer checkout triggers payment intent creation', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test_secret_e2e',
        paymentIntentId: 'pi_test_e2e',
        isDummy: false,
      });

      const checkoutData = {
        amountCents: 3500,
        currency: 'gbp',
        metadata: {
          customerId: IDS.CUSTOMER,
          shopId: IDS.PRODUCT,
          totalCents: '3500',
          subtotalCents: '3250',
          deliveryFeeCents: '250',
          items: JSON.stringify([
            { name: 'Pizza', quantity: 1, unitPriceCents: 2500 },
            { name: 'Drink', quantity: 1, unitPriceCents: 750 },
          ]),
          address: '456 High Street, London',
        },
      };

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send(checkoutData);

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toEqual(expect.any(String));
      expect(res.body.clientSecret).toMatch(/^pi_/); // Payment intent format
      expect(res.body.isDummy).toBe(false);
    });

    it('payment success webhook creates order', async () => {
      const successEvent = {
        id: 'evt_e2e_success',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_e2e_success',
            amount: 3500,
            currency: 'gbp',
            metadata: {
              projectRef: 'test-project-ref',
              customerId: IDS.CUSTOMER,
              shopId: IDS.PRODUCT,
              totalCents: '3500',
              items: JSON.stringify([
                { name: 'Pizza', quantity: 1, unitPriceCents: 2500 },
                { name: 'Drink', quantity: 1, unitPriceCents: 750 },
              ]),
              address: '456 High Street, London',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(successEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);
      orderModel.createWithItems.mockResolvedValue({
        id: IDS.ORDER,
        project_ref: 'test-project-ref',
        customer_id: IDS.CUSTOMER,
        status: 'placed',
        total_cents: 3500,
        created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(successEvent)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(orderModel.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRef: 'test-project-ref',
          customerId: IDS.CUSTOMER,
          paymentIntentId: 'pi_e2e_success',
          totalCents: 3500,
        })
      );
    });

    it('order is recorded with correct payment status', async () => {
      sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
      const paidOrder = makeOrder({
        payment_status: 'paid',
        payment_intent_id: 'pi_e2e_success',
        total_cents: 3500,
      });
      orderModel.findWithItems.mockResolvedValue(paidOrder);

      const res = await request(app)
        .get(`/api/orders/${IDS.ORDER}`)
        .set('Cookie', ADMIN_COOKIE);

      expect(res.status).toBe(200);
      expect(res.body.order.payment_status).toBe('paid');
      expect(res.body.order.payment_intent_id).toBe('pi_e2e_success');
    });

    it('broadcasts WebSocket event on order creation', async () => {
      const successEvent = {
        id: 'evt_ws_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ws_test',
            amount: 2500,
            metadata: {
              projectRef: 'test-project-ref',
              totalCents: '2500',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(successEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);
      orderModel.createWithItems.mockResolvedValue({
        id: IDS.ORDER,
        status: 'placed',
        created_at: new Date().toISOString(),
      });

      await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(successEvent)));

      expect(ws.broadcast).toHaveBeenCalledWith(
        'test-project-ref',
        expect.objectContaining({
          type: 'order:status_changed',
          orderId: IDS.ORDER,
          status: 'placed',
        })
      );
    });

    it('sends order confirmation notification', async () => {
      const successEvent = {
        id: 'evt_notify_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_notify_test',
            amount: 2500,
            metadata: {
              projectRef: 'test-project-ref',
              customerId: IDS.CUSTOMER,
              totalCents: '2500',
            },
          },
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(successEvent);
      stripeEventModel.recordOnce.mockResolvedValue(true);
      orderModel.createWithItems.mockResolvedValue({
        id: IDS.ORDER,
        customer_id: IDS.CUSTOMER,
        status: 'placed',
        created_at: new Date().toISOString(),
      });

      await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_signature')
        .send(Buffer.from(JSON.stringify(successEvent)));

      const notificationService = require('../services/notification.service');
      expect(notificationService.notifyOrderConfirmation).toHaveBeenCalled();
    });
  });

  describe('Demo mode bypass', () => {
    it('creates order directly in demo mode without Stripe', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.isDemoMode.mockResolvedValue(true);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'dummy_secret_123',
        paymentIntentId: 'pi_dummy_123',
        isDummy: true,
      });
      orderModel.createWithItems.mockResolvedValue({
        id: IDS.ORDER,
        status: 'placed',
        created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Cookie', CUSTOMER_COOKIE)
        .send({
          amountCents: 2500,
          currency: 'gbp',
          metadata: {
            customerId: IDS.CUSTOMER,
            totalCents: '2500',
            items: JSON.stringify([{ name: 'Test Item', quantity: 1, unitPriceCents: 2500 }]),
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.isDummy).toBe(true);
    });
  });

  describe('Rate limiting', () => {
    // TODO: A real rate limit integration test is needed that actually triggers 429 responses.
    // The current test only verifies that requests within the limit succeed.
    // To properly test rate limiting, either:
    // 1. Configure a low rate limit for tests and send enough requests to exceed it
    // 2. Mock the rate limiter to simulate hitting the limit
    it('allows requests within rate limit', async () => {
      sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_test',
        paymentIntentId: 'pi_test',
        isDummy: false,
      });

      // Make multiple requests - should all succeed within limit
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/payments/create-intent')
          .set('Cookie', CUSTOMER_COOKIE)
          .send({ amountCents: 2500, currency: 'gbp' })
      );

      const responses = await Promise.all(requests);
      // All should succeed (within rate limit)
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases and Security', () => {
  it('rejects non-numeric amountCents', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', CUSTOMER_COOKIE)
      .send({
        amountCents: 'not-a-number',
        currency: 'gbp',
      });

    expect(res.status).toBe(400);
  });

  it('rejects float amountCents', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', CUSTOMER_COOKIE)
      .send({
        amountCents: 25.99, // Should be integer cents
        currency: 'gbp',
      });

    expect(res.status).toBe(400);
  });

  it('handles large order amounts', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    stripeService.createPaymentIntent.mockResolvedValue({
      clientSecret: 'pi_large',
      paymentIntentId: 'pi_large',
      isDummy: false,
    });

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', CUSTOMER_COOKIE)
      .send({
        amountCents: 99999999, // Large amount
        currency: 'gbp',
      });

    expect(res.status).toBe(200);
  });

  it('validates scheduled order time is in future', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    shopModel.findById.mockResolvedValue({
      id: IDS.PRODUCT,
      project_ref: 'test-project-ref',
      is_active: true,
    });

    // Scheduled time in the past (less than 30 min from now)
    const pastTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', CUSTOMER_COOKIE)
      .send({
        amountCents: 2500,
        currency: 'gbp',
        metadata: {
          shopId: IDS.PRODUCT,
          scheduledFor: pastTime,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/30 minutes/i);
  });
});
