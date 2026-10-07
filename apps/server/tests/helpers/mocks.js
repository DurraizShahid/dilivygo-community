'use strict';

const { faker } = require('@faker-js/faker');

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: IDS.USER,
    email: 'admin@test.com',
    password_hash: '$2b$12$testhashedpassword',
    role: 'admin',
    project_ref: 'test-project-ref',
    totp_enabled: false,
    totp_secret: null,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCustomer(overrides = {}) {
  return {
    id: IDS.CUSTOMER,
    phone: '+447700900000',
    name: 'Test Customer',
    email: 'customer@test.com',
    project_ref: 'test-project-ref',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Proper UUIDs required for Zod z.string().uuid() validation
const IDS = {
  ORDER: 'a1000000-0000-0000-0000-000000000001',
  ORDER2: 'a1000000-0000-0000-0000-000000000002',
  CUSTOMER: 'a2000000-0000-0000-0000-000000000001',
  USER: 'a3000000-0000-0000-0000-000000000001',
  ITEM: 'a4000000-0000-0000-0000-000000000001',
  PRODUCT: 'a5000000-0000-0000-0000-000000000001',
  CART_SESSION: 'a6000000-0000-0000-0000-000000000001',
  CART_ITEM: 'a7000000-0000-0000-0000-000000000001',
  DELIVERY: 'a8000000-0000-0000-0000-000000000001',
  CONVERSATION: 'a9000000-0000-0000-0000-000000000001',
  MESSAGE: 'b1000000-0000-0000-0000-000000000001',
};

function makeOrder(overrides = {}) {
  return {
    id: IDS.ORDER,
    project_ref: 'test-project-ref',
    customer_id: IDS.CUSTOMER,
    status: 'placed',
    payment_status: 'unpaid',
    payment_intent_id: null,
    total_cents: 2500,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    order_items: [],
    ...overrides,
  };
}

function makeOrderItem(overrides = {}) {
  return {
    id: IDS.ITEM,
    order_id: IDS.ORDER,
    product_id: IDS.PRODUCT,
    name: 'Burger',
    quantity: 2,
    unit_price_cents: 1000,
    ...overrides,
  };
}

function makeCartSession(overrides = {}) {
  return {
    id: IDS.CART_SESSION,
    project_ref: 'test-project-ref',
    customer_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCartItem(overrides = {}) {
  return {
    id: IDS.CART_ITEM,
    session_id: IDS.CART_SESSION,
    product_id: IDS.PRODUCT,
    name: 'Burger',
    quantity: 1,
    unit_price_cents: 1200,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDelivery(overrides = {}) {
  return {
    id: IDS.DELIVERY,
    order_id: IDS.ORDER,
    rider_id: null,
    status: 'assigned',
    zone_id: null,
    eta_minutes: 30,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeConversation(overrides = {}) {
  return {
    id: IDS.CONVERSATION,
    project_ref: 'test-project-ref',
    order_id: IDS.ORDER,
    type: 'customer_vendor',
    participant_1_id: IDS.USER,
    participant_2_id: IDS.CUSTOMER,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides = {}) {
  return {
    id: IDS.MESSAGE,
    conversation_id: IDS.CONVERSATION,
    sender_id: IDS.USER,
    sender_role: 'vendor',
    content: faker.lorem.sentence({ min: 4, max: 12 }),
    read_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Auth Session Cookie Helper ───────────────────────────────────────────────

/**
 * Create a signed admin session cookie for supertest requests.
 * Use with: .set('Cookie', adminCookie(sessionId))
 */
function adminCookie(sessionId = 'test-admin-session-id') {
  return `admin_session=${sessionId}`;
}

function customerCookie(sessionId = 'test-customer-session-id') {
  return `customer_session=${sessionId}`;
}

module.exports = {
  IDS,
  makeUser,
  makeCustomer,
  makeOrder,
  makeOrderItem,
  makeCartSession,
  makeCartItem,
  makeDelivery,
  makeConversation,
  makeMessage,
  adminCookie,
  customerCookie,
};
