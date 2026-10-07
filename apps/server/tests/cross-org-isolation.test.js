'use strict';

/**
 * Cross-organization isolation at the customer-facing checkout / auth layer.
 *
 * 1. `CROSS_ORG_CART` — `POST /api/payments/create-intent` with a
 *    `checkoutDraft` containing shops from two different organizations is
 *    rejected with HTTP 400 + `code: CROSS_ORG_CART`. This is the second
 *    line of defence (geofence + UI hide is the first).
 *
 * 2. Customer phone uniqueness is per organization, not per project_ref.
 *    `customerModel.findByPhoneInOrganization` filters on
 *    `(phone, organization_id)` and `findOrCreateInOrganization` requires an
 *    `organizationId` argument — calling it without one throws.
 */

jest.mock('../lib/host-scope', () => ({
  resolveAuthHostScope: jest.fn().mockResolvedValue(null),
  staffHostMismatchResponse: jest.fn().mockReturnValue(null),
  STAFF_SURFACES: new Set(['vendor', 'pos']),
  PLATFORM_SURFACES: new Set(['superadmin']),
  CUSTOMER_FACING_SURFACES: new Set(['customer', 'rider']),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue([]),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn().mockResolvedValue(null),
  getCustomerSession: jest.fn(),
}));

jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  constructWebhookEvent: jest.fn(),
}));

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn().mockResolvedValue('true'), // multi_shop_cart_enabled = true
  set: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(),
  broadcast: jest.fn(),
  sendToUser: jest.fn(),
  fanOrderToWorkspaceAndMarketplaceCustomer: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
}));
jest.mock('../services/notification.service', () => ({
  notifyOrderConfirmation: jest.fn(),
  notifyShopStaffNewOrder: jest.fn(),
  notifyOrderStatusChange: jest.fn().mockResolvedValue(undefined),
  notifyNewMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/user.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
  findByProjectRef: jest.fn().mockResolvedValue([]),
}));
jest.mock('../models/customer.model', () => {
  const real = jest.requireActual('../models/customer.model');
  return {
    ...real,
    findById: jest.fn().mockResolvedValue({
      id: 'cust-1',
      project_ref: null,
      organization_id: '11111111-1111-1111-1111-111111111111',
      phone: '+447700900001',
    }),
  };
});

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const sessionService = require('../services/session.service');
const customerModel = jest.requireActual('../models/customer.model');

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

const SHOP_A_ORG_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SHOP_B_ORG_A = 'aaaaaaaa-1111-4111-8111-222222222222';
const SHOP_C_ORG_B = 'bbbbbbbb-2222-4222-8222-333333333333';

const PROD_A = 'cccccccc-1111-4111-8111-111111111111';
const PROD_B = 'cccccccc-1111-4111-8111-222222222222';
const PROD_C = 'cccccccc-1111-4111-8111-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  sessionService.getCustomerSession.mockResolvedValue({
    id: 'cust-1',
    phone: '+447700900001',
    name: 'Test',
    projectRef: null,
    type: 'customer',
  });
});

describe('POST /api/payments/create-intent — cross-org cart guard', () => {
  test('rejects checkoutDraft with shops from two different organizations', async () => {
    const PRODUCTS_BY_ID = {
      [PROD_A]: { id: PROD_A, shop_id: SHOP_A_ORG_A, project_ref: 'proj-a', price_cents: 1000, available: true },
      [PROD_C]: { id: PROD_C, shop_id: SHOP_C_ORG_B, project_ref: 'proj-b', price_cents: 1500, available: true },
    };
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'shops') {
        const ids = Array.isArray(opts.filters?.id) ? opts.filters.id : [opts.filters?.id];
        return ids.map((id) => {
          if (id === SHOP_A_ORG_A || id === SHOP_B_ORG_A) {
            return { id, organization_id: ORG_A, currency: 'usd' };
          }
          if (id === SHOP_C_ORG_B) {
            return { id, organization_id: ORG_B, currency: 'usd' };
          }
          return null;
        }).filter(Boolean);
      }
      if (table === 'products') {
        return opts.filters?.id ? [PRODUCTS_BY_ID[opts.filters.id]].filter(Boolean) : [];
      }
      return [];
    });

    const draft = {
      groups: [
        {
          projectRef: 'proj-a',
          shopId: SHOP_A_ORG_A,
          subtotalCents: 1000,
          items: [{ productId: PROD_A, name: 'Burger', quantity: 1, unitPriceCents: 1000 }],
        },
        {
          projectRef: 'proj-b',
          shopId: SHOP_C_ORG_B,
          subtotalCents: 1500,
          items: [{ productId: PROD_C, name: 'Pizza', quantity: 1, unitPriceCents: 1500 }],
        },
      ],
      deliveryFeeCents: 0,
      address: '123 Test St',
    };

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', ['customer_session=test'])
      .set('x-project-ref', 'proj-a')
      .send({ amountCents: 2500, currency: 'usd', checkoutDraft: draft });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/one organization/i);
  });

  test('rejects single-shop checkout where the shop org differs from the customer org (audit finding #6)', async () => {
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'shops') {
        const ids = Array.isArray(opts.filters?.id) ? opts.filters.id : [opts.filters?.id];
        return ids.map((id) => ({ id, organization_id: ORG_B, currency: 'usd' })).filter(Boolean);
      }
      if (table === 'customers' && opts.filters?.id === 'cust-1') {
        // Customer is pinned to ORG_A.
        return [{ id: 'cust-1', organization_id: ORG_A }];
      }
      if (table === 'products') {
        return opts.filters?.id === PROD_C
          ? [{ id: PROD_C, shop_id: SHOP_C_ORG_B, project_ref: 'proj-b', price_cents: 1500, available: true }]
          : [];
      }
      return [];
    });

    const draft = {
      groups: [
        {
          projectRef: 'proj-b',
          shopId: SHOP_C_ORG_B,
          subtotalCents: 1500,
          items: [{ productId: PROD_C, name: 'Pizza', quantity: 1, unitPriceCents: 1500 }],
        },
      ],
      deliveryFeeCents: 0,
      address: '123 Test St',
    };

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', ['customer_session=test'])
      .set('x-project-ref', 'proj-a')
      .send({ amountCents: 1500, currency: 'usd', checkoutDraft: draft });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your organization|one organization/i);
  });

  test('allows single-shop checkout where the shop is in the marketplace bucket (legacy / cross-tenant inventory)', async () => {
    const MARKETPLACE_ORG = '00000000-0000-0000-0000-000000000001';
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'shops') {
        const ids = Array.isArray(opts.filters?.id) ? opts.filters.id : [opts.filters?.id];
        return ids.map((id) => ({ id, organization_id: MARKETPLACE_ORG, currency: 'usd' })).filter(Boolean);
      }
      if (table === 'customers' && opts.filters?.id === 'cust-1') {
        return [{ id: 'cust-1', organization_id: ORG_A }];
      }
      return [];
    });

    const draft = {
      groups: [
        {
          projectRef: 'proj-marketplace',
          shopId: SHOP_C_ORG_B,
          subtotalCents: 1500,
          items: [{ productId: PROD_C, name: 'Pizza', quantity: 1, unitPriceCents: 1500 }],
        },
      ],
      deliveryFeeCents: 0,
      address: '123 Test St',
    };

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', ['customer_session=test'])
      .set('x-project-ref', 'proj-marketplace')
      .send({ amountCents: 1500, currency: 'usd', checkoutDraft: draft });

    if (res.status === 400) {
      expect(res.body.error || '').not.toMatch(/your organization|one organization/i);
    }
  });

  test('allows single-shop checkout where the customer is in the marketplace bucket (cross-org browsing)', async () => {
    const MARKETPLACE_ORG = '00000000-0000-0000-0000-000000000001';
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'shops') {
        const ids = Array.isArray(opts.filters?.id) ? opts.filters.id : [opts.filters?.id];
        return ids.map((id) => ({ id, organization_id: ORG_B, currency: 'usd' })).filter(Boolean);
      }
      if (table === 'customers' && opts.filters?.id === 'cust-1') {
        return [{ id: 'cust-1', organization_id: MARKETPLACE_ORG }];
      }
      return [];
    });

    const draft = {
      groups: [
        {
          projectRef: 'proj-b',
          shopId: SHOP_C_ORG_B,
          subtotalCents: 1500,
          items: [{ productId: PROD_C, name: 'Pizza', quantity: 1, unitPriceCents: 1500 }],
        },
      ],
      deliveryFeeCents: 0,
      address: '123 Test St',
    };

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', ['customer_session=test'])
      .set('x-project-ref', 'proj-b')
      .send({ amountCents: 1500, currency: 'usd', checkoutDraft: draft });

    if (res.status === 400) {
      expect(res.body.error || '').not.toMatch(/your organization|one organization/i);
    }
  });

  test('accepts checkoutDraft with shops from a single organization (gets past CROSS_ORG_CART check)', async () => {
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'shops') {
        const ids = Array.isArray(opts.filters?.id) ? opts.filters.id : [opts.filters?.id];
        return ids.map((id) => ({ id, organization_id: ORG_A, currency: 'usd' })).filter(Boolean);
      }
      return [];
    });

    const draft = {
      groups: [
        {
          projectRef: 'proj-a',
          shopId: SHOP_A_ORG_A,
          subtotalCents: 1000,
          items: [{ productId: PROD_A, name: 'Burger', quantity: 1, unitPriceCents: 1000 }],
        },
        {
          projectRef: 'proj-a',
          shopId: SHOP_B_ORG_A,
          subtotalCents: 1500,
          items: [{ productId: PROD_B, name: 'Wings', quantity: 1, unitPriceCents: 1500 }],
        },
      ],
      deliveryFeeCents: 0,
      address: '123 Test St',
    };

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', ['customer_session=test'])
      .set('x-project-ref', 'proj-a')
      .send({ amountCents: 2500, currency: 'usd', checkoutDraft: draft });

    // The CROSS_ORG_CART check passed if we get any non-400-with-that-message
    // status. The downstream pipeline may still 400/500 because we did not
    // mock every dependency — that's fine; the guard under test is upstream.
    expect(res.body?.code).not.toBe('CROSS_ORG_CART');
    if (res.status === 400) {
      expect(res.body.error || '').not.toMatch(/one organization/i);
    }
  });
});

describe('customerModel — phone uniqueness is per organization', () => {
  test('findByPhoneInOrganization filters on (phone, organization_id)', async () => {
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'customers' && opts.filters?.phone === '+447700900001') {
        // Both orgs have a customer with this phone — must only return ours.
        if (opts.filters.organization_id === ORG_A) {
          return [{ id: 'cust-org-a', phone: '+447700900001', organization_id: ORG_A }];
        }
        if (opts.filters.organization_id === ORG_B) {
          return [{ id: 'cust-org-b', phone: '+447700900001', organization_id: ORG_B }];
        }
      }
      return [];
    });

    const a = await customerModel.findByPhoneInOrganization('+447700900001', ORG_A);
    const b = await customerModel.findByPhoneInOrganization('+447700900001', ORG_B);
    expect(a.id).toBe('cust-org-a');
    expect(b.id).toBe('cust-org-b');
    expect(a.id).not.toBe(b.id);
  });

  test('findByPhoneInOrganization returns null without an organizationId (refuses cross-org leak)', async () => {
    const result = await customerModel.findByPhoneInOrganization('+447700900001', null);
    expect(result).toBeNull();
  });

  test('findOrCreateInOrganization throws without an organizationId', async () => {
    await expect(
      customerModel.findOrCreateInOrganization({ phone: '+447700900001', organizationId: null }),
    ).rejects.toThrow(/organizationId/);
  });

  test('findOrCreateInOrganization with an existing customer in the same org returns existing', async () => {
    db.select.mockImplementation((table, opts = {}) => {
      if (table === 'customers' && opts.filters?.organization_id === ORG_A) {
        return [{ id: 'existing-a', phone: '+447700900001', organization_id: ORG_A }];
      }
      return [];
    });

    const { customer, created } = await customerModel.findOrCreateInOrganization({
      phone: '+447700900001',
      organizationId: ORG_A,
    });
    expect(created).toBe(false);
    expect(customer.id).toBe('existing-a');
    expect(customer.organization_id).toBe(ORG_A);
  });
});
