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

jest.mock('../models/user-shop.model', () => ({
  findByShopId: jest.fn().mockResolvedValue([]),
}));

jest.mock('../models/customer.model', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn().mockResolvedValue(null),
  getCustomerSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/notification.service', () => ({
  notifyNewMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/host-scope', () => ({
  resolveAuthHostScope: jest.fn().mockResolvedValue(null),
  staffHostMismatchResponse: jest.fn().mockReturnValue(null),
  STAFF_SURFACES: new Set(['vendor', 'pos']),
  PLATFORM_SURFACES: new Set(['superadmin']),
  CUSTOMER_FACING_SURFACES: new Set(['customer', 'rider']),
}));
jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(),
  broadcast: jest.fn(),
  broadcastSupportChat: jest.fn(),
  sendToUser: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
}));

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const userModel = require('../models/user.model');
const customerModel = require('../models/customer.model');
const sessionService = require('../services/session.service');
const ws = require('../websocket/ws-server');
const {
  makeOrder,
  makeConversation,
  makeMessage,
  IDS,
  customerCookie,
} = require('./helpers/mocks');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

const PLATFORM_SUPPORT_PARTICIPANT_ID = '00000000-0000-0000-0000-0000000000fb';

const ADMIN_COOKIE = `admin_session=test-admin-sid; ${CSRF_COOKIE}`;
const ADMIN_SESSION = { id: IDS.USER, email: 'admin@test.com', role: 'admin', projectRef: 'test-project-ref', type: 'admin' };
const CUSTOMER_COOKIE = `${customerCookie()}; ${CSRF_COOKIE}`;
const BOTH_AUTH_COOKIES = `admin_session=test-admin-sid; customer_session=test-customer-session-id; ${CSRF_COOKIE}`;
const CUSTOMER_SESSION = {
  id: IDS.CUSTOMER,
  phone: '+10000000000',
  name: 'Test Customer',
  projectRef: 'test-project-ref',
  type: 'customer',
};

beforeEach(() => {
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
  userModel.findById.mockReset();
  userModel.findById.mockResolvedValue(null);
  userModel.findByProjectRef.mockReset();
  userModel.findByProjectRef.mockResolvedValue([]);
  customerModel.findById.mockReset();
  customerModel.findById.mockResolvedValue(null);
  db.select.mockReset();
  db.select.mockResolvedValue([]);
  db.insert.mockReset();
  db.insert.mockResolvedValue({});
  db.update.mockReset();
  db.update.mockResolvedValue({});
  db.supabaseFetch.mockClear();
});

// ─── POST /api/chat/conversations ────────────────────────────────────────────

describe('POST /api/chat/conversations', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/chat/conversations')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: 'order-uuid-001', type: 'customer_vendor' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid type', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app).post('/api/chat/conversations').set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: 'order-uuid-001', type: 'invalid_type' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when order not found', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([]);
    const res = await request(app).post('/api/chat/conversations').set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_vendor' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for different project — multi-tenant isolation', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeOrder({ project_ref: 'ATTACKER-PROJECT' })]);
    const res = await request(app).post('/api/chat/conversations').set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_vendor' });
    expect(res.status).toBe(403);
  });

  it('creates a new conversation (201)', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValueOnce([makeOrder()]).mockResolvedValueOnce([]);
    db.insert.mockResolvedValue(makeConversation());
    const res = await request(app).post('/api/chat/conversations').set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_vendor' });
    expect(res.status).toBe(201);
    expect(res.body.conversation).toMatchObject({
      id: expect.any(String),
    });
  });

  it('returns existing conversation as 200 — idempotent', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const conv = makeConversation();
    db.select.mockResolvedValueOnce([makeOrder()]).mockResolvedValueOnce([conv]);
    const res = await request(app).post('/api/chat/conversations').set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_vendor' });
    expect(res.status).toBe(200);
    expect(res.body.conversation.id).toBe(conv.id);
  });

  it('customer_vendor pairs customer with vendor staff when customer creates', async () => {
    const vendorStaffId = 'b3000000-0000-0000-0000-000000000001';
    userModel.findByProjectRef.mockResolvedValueOnce([
      { id: vendorStaffId, role: 'vendor', project_ref: 'test-project-ref' },
    ]);
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    const orderRow = makeOrder({ customer_id: IDS.CUSTOMER });
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'orders') return [orderRow];
      if (table === 'conversations') return [];
      return [];
    });
    db.insert.mockResolvedValue(
      makeConversation({
        participant_1_id: IDS.CUSTOMER,
        participant_2_id: vendorStaffId,
      })
    );
    const res = await request(app).post('/api/chat/conversations').set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_vendor' });
    expect(res.status).toBe(201);
    expect(res.body.conversation.participant1Id).toBe(IDS.CUSTOMER);
    expect(res.body.conversation.participant2Id).toBe(vendorStaffId);
  });

  it('returns 400 when customer uses vendor_rider (use customer_rider)', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const riderId = 'b4000000-0000-0000-0000-000000000001';
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    const orderRow = makeOrder({ customer_id: IDS.CUSTOMER });
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'orders') return [orderRow];
      if (table === 'deliveries') return [{ rider_id: riderId, order_id: IDS.ORDER }];
      return [];
    });
    const res = await request(app).post('/api/chat/conversations').set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'vendor_rider' });
    expect(res.status).toBe(400);
  });

  it('creates customer_rider for customer with assigned rider', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const riderId = 'b4000000-0000-0000-0000-000000000001';
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    const orderRow = makeOrder({ customer_id: IDS.CUSTOMER });
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'orders') return [orderRow];
      if (table === 'deliveries') return [{ rider_id: riderId, order_id: IDS.ORDER }];
      if (table === 'conversations') return [];
      return [];
    });
    db.insert.mockResolvedValue(
      makeConversation({
        type: 'customer_rider',
        participant_1_id: IDS.CUSTOMER,
        participant_2_id: riderId,
      })
    );
    const res = await request(app).post('/api/chat/conversations').set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ orderId: IDS.ORDER, type: 'customer_rider' });
    expect(res.status).toBe(201);
    expect(res.body.conversation.type).toBe('customer_rider');
    expect(res.body.conversation.participant2Id).toBe(riderId);
  });
});

// ─── POST /api/chat/support-tickets ───────────────────────────────────────────

describe('POST /api/chat/support-tickets', () => {
  it('persists organization_id for org-marketplace customer support tickets', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      projectRef: null,
      organizationId,
      isMarketplaceCustomer: true,
    });
    const custRow = { id: IDS.CUSTOMER, project_ref: null };
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [custRow];
      return [];
    });
    db.insert.mockResolvedValueOnce({
      id: IDS.CONVERSATION,
      project_ref: '__marketplace_customer__',
      organization_id: organizationId,
      type: 'customer_support',
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: 'Need help',
      created_at: '2025-06-01T12:00:00.000Z',
      updated_at: '2025-06-01T12:00:00.000Z',
    });
    db.insert.mockResolvedValueOnce(makeMessage());
    db.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/chat/support-tickets')
      .set('Host', 'brand-a.customer.test')
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ subject: 'Need help', message: 'Support please' });

    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenNthCalledWith(
      1,
      'conversations',
      expect.objectContaining({
        project_ref: '__marketplace_customer__',
        organization_id: organizationId,
      })
    );
    expect(ws.broadcastSupportChat).toHaveBeenCalledWith(
      '__marketplace_customer__',
      expect.objectContaining({
        type: 'chat:message',
        conversationId: IDS.CONVERSATION,
      }),
      organizationId
    );
  });

  it('uses customers.organization_id when session omits organizationId (attachProjectRef merge)', async () => {
    const organizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      projectRef: null,
      isMarketplaceCustomer: true,
    });
    customerModel.findById.mockResolvedValue({
      id: IDS.CUSTOMER,
      project_ref: null,
      organization_id: organizationId,
    });
    db.insert.mockResolvedValueOnce({
      id: IDS.CONVERSATION,
      project_ref: '__marketplace_customer__',
      organization_id: organizationId,
      type: 'customer_support',
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: 'Help',
      created_at: '2025-06-01T12:00:00.000Z',
      updated_at: '2025-06-01T12:00:00.000Z',
    });
    db.insert.mockResolvedValueOnce(makeMessage());
    db.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/chat/support-tickets')
      .set('Host', 'brand-a.customer.test')
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ subject: 'Help', message: 'Please advise' });

    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenNthCalledWith(
      1,
      'conversations',
      expect.objectContaining({
        organization_id: organizationId,
      })
    );
  });

  it('returns 400 when marketplace customer has no organization context for support', async () => {
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      projectRef: null,
      isMarketplaceCustomer: true,
    });
    customerModel.findById.mockResolvedValue({
      id: IDS.CUSTOMER,
      project_ref: null,
      organization_id: null,
    });

    const res = await request(app)
      .post('/api/chat/support-tickets')
      .set('Host', 'brand-a.customer.test')
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ subject: 'Help', message: 'Please advise' });

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ─── POST /api/chat/conversations/:id/messages ───────────────────────────────

describe('POST /api/chat/conversations/:id/messages', () => {
  it('returns 400 for empty content', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app).post('/api/chat/conversations/conv-001/messages')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for content over 2000 chars', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app).post('/api/chat/conversations/conv-001/messages')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ content: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('returns 403 for different project — multi-tenant isolation', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeConversation({ project_ref: 'ATTACKER-PROJECT' })]);
    const res = await request(app).post('/api/chat/conversations/conv-001/messages')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ content: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('sends message and broadcasts chat:message WS event', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeConversation()]);
    db.insert.mockResolvedValue(makeMessage());
    const res = await request(app).post('/api/chat/conversations/conv-001/messages')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ content: 'Ready!' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBeDefined();
    expect(ws.broadcast).toHaveBeenCalledWith('test-project-ref',
      expect.objectContaining({ type: 'chat:message', conversationId: 'conv-001' }));
  });

  it('uses the customer identity when mixed cookies send to a support thread', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      organizationId,
    });
    const supportConversation = makeConversation({
      id: 'conv-001',
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      organization_id: organizationId,
    });
    db.select.mockResolvedValueOnce([supportConversation]);
    db.insert.mockResolvedValue(
      makeMessage({
        sender_id: IDS.CUSTOMER,
        sender_role: 'customer',
      })
    );

    const res = await request(app)
      .post('/api/chat/conversations/conv-001/messages')
      .set('Cookie', BOTH_AUTH_COOKIES)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ content: 'Customer reply' });

    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalledWith(
      'messages',
      expect.objectContaining({
        conversation_id: 'conv-001',
        sender_id: IDS.CUSTOMER,
        sender_role: 'customer',
        content: 'Customer reply',
      })
    );
    expect(ws.broadcastSupportChat).toHaveBeenCalledWith(
      'test-project-ref',
      expect.objectContaining({
        type: 'chat:message',
        conversationId: 'conv-001',
      }),
      organizationId
    );
  });
});

// ─── GET /api/chat/conversations/:id/messages ────────────────────────────────

describe('GET /api/chat/conversations/:id/messages', () => {
  it('returns 403 for different project — multi-tenant isolation', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValue([makeConversation({ project_ref: 'ATTACKER-PROJECT' })]);
    const res = await request(app).get('/api/chat/conversations/conv-001/messages').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(403);
  });

  it('returns paginated messages', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    db.select.mockResolvedValueOnce([makeConversation()]).mockResolvedValueOnce([makeMessage(), makeMessage({ id: 'msg-002' })]);
    const res = await request(app).get('/api/chat/conversations/conv-001/messages?page=1').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.page).toBe(1);
  });

  it('falls back to the customer session for support threads when both auth cookies exist', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const supportConversation = makeConversation({
      id: 'conv-001',
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    db.select
      .mockResolvedValueOnce([supportConversation])
      .mockResolvedValueOnce([makeMessage({ sender_id: IDS.CUSTOMER, sender_role: 'customer' })]);

    const res = await request(app)
      .get('/api/chat/conversations/conv-001/messages?page=1')
      .set('Cookie', BOTH_AUTH_COOKIES);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });
});

// ─── PATCH /api/chat/conversations/:id/read ──────────────────────────────────

describe('PATCH /api/chat/conversations/:id/read', () => {
  it('marks support messages read as the customer when mixed auth cookies exist', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    sessionService.getCustomerSession.mockResolvedValue({
      ...CUSTOMER_SESSION,
      organizationId,
    });
    const supportConversation = makeConversation({
      id: 'conv-001',
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      organization_id: organizationId,
    });
    db.select.mockResolvedValueOnce([supportConversation]);

    const res = await request(app)
      .patch('/api/chat/conversations/conv-001/read')
      .set('Cookie', BOTH_AUTH_COOKIES)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);

    expect(res.status).toBe(200);
    expect(db.supabaseFetch).toHaveBeenCalledWith(
      expect.stringContaining(`sender_id=neq.${encodeURIComponent(IDS.CUSTOMER)}`),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(ws.broadcastSupportChat).toHaveBeenCalledWith(
      'test-project-ref',
      expect.objectContaining({
        type: 'chat:read',
        conversationId: 'conv-001',
        userId: IDS.CUSTOMER,
      }),
      organizationId
    );
  });
});

// ─── PATCH /api/chat/conversations/:id/support-status ─────────────────────────

describe('PATCH /api/chat/conversations/:id/support-status', () => {
  it('returns 403 when not a customer', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app)
      .patch(`/api/chat/conversations/${IDS.CONVERSATION}/support-status`)
      .set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ closed: true });
    expect(res.status).toBe(403);
  });

  it('closes support chat and broadcasts chat:support_status', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const supportConv = makeConversation({
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
    });
    const closedConv = {
      ...supportConv,
      support_closed_at: '2025-06-01T12:00:00.000Z',
    };
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'conversations') return [supportConv];
      return [];
    });
    db.update.mockResolvedValue([closedConv]);

    const res = await request(app)
      .patch(`/api/chat/conversations/${IDS.CONVERSATION}/support-status`)
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ closed: true });

    expect(res.status).toBe(200);
    expect(res.body.conversation.supportClosedAt).toBe('2025-06-01T12:00:00.000Z');
    expect(ws.broadcastSupportChat).toHaveBeenCalledWith(
      'test-project-ref',
      expect.objectContaining({
        type: 'chat:support_status',
        conversationId: IDS.CONVERSATION,
        supportClosedAt: '2025-06-01T12:00:00.000Z',
      }),
      undefined
    );
  });
});

// ─── Closed support chat cannot send ─────────────────────────────────────────

describe('PUT /api/chat/conversations/:id/support-rating', () => {
  it('returns 403 when not a customer', async () => {
    sessionService.getAdminSession.mockResolvedValue(ADMIN_SESSION);
    const res = await request(app)
      .put(`/api/chat/conversations/${IDS.CONVERSATION}/support-rating`)
      .set('Cookie', ADMIN_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ stars: 5 });
    expect(res.status).toBe(403);
  });

  it('saves a support ticket rating (200)', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const supportConv = makeConversation({
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: 'Need help',
    });
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'conversations') return [supportConv];
      if (table === 'support_ticket_ratings') return [];
      return [];
    });
    const ratingRow = {
      id: 'rating-uuid-1',
      conversation_id: IDS.CONVERSATION,
      project_ref: 'test-project-ref',
      customer_id: IDS.CUSTOMER,
      ticket_subject: 'Need help',
      stars: 5,
      comment: 'Great',
      created_at: '2025-06-01T12:00:00.000Z',
      updated_at: '2025-06-01T12:00:00.000Z',
    };
    db.insert.mockResolvedValue([ratingRow]);

    const res = await request(app)
      .put(`/api/chat/conversations/${IDS.CONVERSATION}/support-rating`)
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ stars: 5, comment: 'Great' });

    expect(res.status).toBe(200);
    expect(res.body.rating.stars).toBe(5);
    expect(res.body.rating.comment).toBe('Great');
  });

  it('returns 403 when rating already exists', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const supportConv = makeConversation({
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: 'Need help',
    });
    const existingRating = {
      id: 'rating-existing',
      conversation_id: IDS.CONVERSATION,
      stars: 4,
    };
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'conversations') return [supportConv];
      if (table === 'support_ticket_ratings') return [existingRating];
      return [];
    });

    const res = await request(app)
      .put(`/api/chat/conversations/${IDS.CONVERSATION}/support-rating`)
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ stars: 5 });

    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat/conversations/:id/messages — support closed', () => {
  it('returns 403 when customer_support is closed', async () => {
    sessionService.getCustomerSession.mockResolvedValue(CUSTOMER_SESSION);
    const customerRow = { id: IDS.CUSTOMER, project_ref: 'test-project-ref' };
    const closedSupport = makeConversation({
      type: 'customer_support',
      order_id: null,
      participant_1_id: IDS.CUSTOMER,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_closed_at: '2025-06-01T12:00:00.000Z',
    });
    db.select.mockImplementation(async (table) => {
      if (table === 'customers') return [customerRow];
      if (table === 'conversations') return [closedSupport];
      return [];
    });
    const res = await request(app)
      .post(`/api/chat/conversations/${IDS.CONVERSATION}/messages`)
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ content: 'Hello' });
    expect(res.status).toBe(403);
  });
});
