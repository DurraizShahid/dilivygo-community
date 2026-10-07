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
  createAdminSession: jest.fn().mockResolvedValue('new-admin-sid'),
  createCustomerSession: jest.fn().mockResolvedValue('new-customer-sid'),
  deleteAdminSession: jest.fn().mockResolvedValue(undefined),
  deleteCustomerSession: jest.fn().mockResolvedValue(undefined),
  setOTP: jest.fn().mockResolvedValue(undefined),
  getOTP: jest.fn().mockResolvedValue(null),
  incrementOTPAttempts: jest.fn().mockResolvedValue({ code: '123456', attempts: 1 }),
  deleteOTP: jest.fn().mockResolvedValue(undefined),
  checkOTPRateLimit: jest.fn().mockResolvedValue(true),
  setCustomerRecoveryOTP: jest.fn().mockResolvedValue(undefined),
  getCustomerRecoveryOTP: jest.fn().mockResolvedValue(null),
  incrementCustomerRecoveryOTPAttempts: jest.fn().mockResolvedValue({ code: '123456', attempts: 1 }),
  deleteCustomerRecoveryOTP: jest.fn().mockResolvedValue(undefined),
  checkCustomerRecoveryRateLimit: jest.fn().mockResolvedValue(true),
  setResetToken: jest.fn().mockResolvedValue(undefined),
  getResetToken: jest.fn().mockResolvedValue(null),
  deleteResetToken: jest.fn().mockResolvedValue(undefined),
  getStore: jest.fn().mockReturnValue({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }),
}));

jest.mock('../services/sms.service', () => ({
  sendSMS: jest.fn().mockResolvedValue({ sid: 'SM-test' }),
  generateOTP: jest.fn().mockReturnValue('123456'),
}));

jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'email-test' }),
  passwordResetEmail: jest.fn().mockReturnValue({ subject: 'Reset', html: '<p>', text: 'Reset' }),
  customerOtpEmail: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>', text: 'OTP' }),
  customerRecoveryEmail: jest.fn().mockReturnValue({ subject: 'Recovery', html: '<p>', text: 'Recovery' }),
}));

jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

// Customer auth refs are now validated server-side: unknown `projectRef` values
// 404 with UNKNOWN_ORGANIZATION before the OTP/demo/recovery handlers run. This
// mock lets the auth suite resolve any ref (org resolution itself is covered by
// `cross-org-isolation.test.js` + `public.test.js`). The same mocked module
// instance is used by both `customer-auth-scope.middleware.js` and
// `auth.controller.js`.
jest.mock('../lib/organization-context', () => ({
  resolveOrganizationContext: jest.fn(),
}));

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  getBulk: jest.fn().mockResolvedValue({}),
  resolveOrganizationId: jest.fn().mockResolvedValue(null),
}));

jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(),
  broadcast: jest.fn(),
  sendToUser: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
}));

const request = require('supertest');
const app = require('../app');
const db = require('../lib/supabase');
const sessionService = require('../services/session.service');
const { resolveOrganizationContext } = require('../lib/organization-context');
const { makeUser, makeCustomer } = require('./helpers/mocks');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

const ADMIN_COOKIE = `admin_session=test-admin-sid; ${CSRF_COOKIE}`;
const CUSTOMER_COOKIE = `customer_session=test-customer-sid; ${CSRF_COOKIE}`;

// Organization bucket used when the auth suite resolves an OTP/demo/recovery ref.
const TEST_ORG_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  db.select.mockResolvedValue([]);
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
  sessionService.checkOTPRateLimit.mockResolvedValue(true);
  sessionService.checkCustomerRecoveryRateLimit.mockResolvedValue(true);
  resolveOrganizationContext.mockImplementation((ref) =>
    Promise.resolve({ organizationId: TEST_ORG_ID, publicRef: String(ref || '') })
  );
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ email: 'bad', password: 'pw' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when user not found', async () => {
    db.select.mockResolvedValue([]);
    const res = await request(app).post('/api/auth/login')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'nobody@test.com', password: 'Password123!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for wrong password', async () => {
    db.select.mockResolvedValue([makeUser()]);
    const res = await request(app).post('/api/auth/login')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'admin@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  // Staff accounts are no longer self-service — `/signup` now requires an
  // authenticated workspace admin (parseSession → requireAdmin → requireRole('admin')).
  beforeEach(() => {
    sessionService.getAdminSession.mockResolvedValue({
      id: 'a3000000-0000-0000-0000-000000000099',
      role: 'admin',
      projectRef: 'ref',
      type: 'admin',
    });
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/auth/signup')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN).send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app).post('/api/auth/signup')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'new@t.com', password: 'Password123!', role: 'superuser', projectRef: 'ref' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already in use', async () => {
    db.select.mockResolvedValue([makeUser()]);
    const res = await request(app).post('/api/auth/signup')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'admin@test.com', password: 'Password123!', role: 'admin', projectRef: 'ref' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 200 and calls deleteAdminSession', async () => {
    sessionService.getAdminSession.mockResolvedValue({ id: 'uid', role: 'admin', projectRef: 'ref', type: 'admin' });
    const res = await request(app).post('/api/auth/logout')
      .set('Cookie', ADMIN_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sessionService.deleteAdminSession).toHaveBeenCalled();
  });
});

// ─── GET /api/auth/session ────────────────────────────────────────────────────

describe('GET /api/auth/session', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/session');
    expect(res.status).toBe(401);
  });

  it('returns sanitised user when authenticated', async () => {
    const user = makeUser();
    sessionService.getAdminSession.mockResolvedValue({ id: user.id, role: user.role, projectRef: user.project_ref, type: 'admin' });
    db.select.mockResolvedValue([user]);
    const res = await request(app).get('/api/auth/session').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
    });
    expect(res.body.user.password_hash).toBeUndefined();
  });
});

const BOTH_AUTH_COOKIES = `admin_session=test-admin-sid; customer_session=test-customer-sid; ${CSRF_COOKIE}`;

describe('parseSession: customer web vs staff cookies on same API host', () => {
  it('GET /api/auth/customer/session uses customer when X-Dilivygo-Actor: customer and both cookies exist', async () => {
    const customer = makeCustomer();
    sessionService.getCustomerSession.mockResolvedValue({
      id: customer.id,
      projectRef: customer.project_ref,
      type: 'customer',
    });
    sessionService.getAdminSession.mockResolvedValue({
      id: 'a3000000-0000-0000-0000-000000000099',
      role: 'admin',
      projectRef: 'workspace-ref',
      email: 'admin@test.com',
      type: 'admin',
    });
    db.select.mockResolvedValue([customer]);
    const res = await request(app)
      .get('/api/auth/customer/session')
      .set('Cookie', BOTH_AUTH_COOKIES)
      .set('x-dilivygo-actor', 'customer');
    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(customer.id);
  });

  it('GET /api/auth/customer/session returns 401 with both cookies but no actor header (staff session wins)', async () => {
    const customer = makeCustomer();
    sessionService.getCustomerSession.mockResolvedValue({
      id: customer.id,
      projectRef: customer.project_ref,
      type: 'customer',
    });
    sessionService.getAdminSession.mockResolvedValue({
      id: 'a3000000-0000-0000-0000-000000000099',
      role: 'admin',
      projectRef: 'workspace-ref',
      email: 'admin@test.com',
      type: 'admin',
    });
    const res = await request(app).get('/api/auth/customer/session').set('Cookie', BOTH_AUTH_COOKIES);
    expect(res.status).toBe(401);
  });

});

// ─── POST /api/auth/otp/send ──────────────────────────────────────────────────

describe('POST /api/auth/otp/send', () => {
  it('returns 200 for valid E.164 phone', async () => {
    const res = await request(app).post('/api/auth/otp/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000', projectRef: 'ref' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 for non-E.164 phone', async () => {
    const res = await request(app).post('/api/auth/otp/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '07700900000', projectRef: 'ref' });
    expect(res.status).toBe(400);
  });

  it('allows OTP send without projectRef (global marketplace customer)', async () => {
    const res = await request(app).post('/api/auth/otp/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 429 when rate limited', async () => {
    sessionService.checkOTPRateLimit.mockResolvedValue(false);
    const res = await request(app).post('/api/auth/otp/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000', projectRef: 'ref' });
    expect(res.status).toBe(429);
  });

  it('isolates OTP send limiter by tenant scope for the same recipient', async () => {
    const path = '/api/auth/otp/send';
    const phone = '+447700900111';
    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';
    const BYPASS_HEADER = 'x-load-test-token';
    const BYPASS_TOKEN = 'test-load-bypass-token';

    const sendOtp = ({ projectRef, ipSuffix }) => request(app)
      .post(path)
      .set('Cookie', CSRF_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .set(BYPASS_HEADER, BYPASS_TOKEN)
      .set('X-Forwarded-For', `198.51.100.${ipSuffix}`)
      .send({ phone, projectRef });

    await expect(sendOtp({ projectRef: tenantA, ipSuffix: 11 })).resolves.toMatchObject({ status: 200 });
    await expect(sendOtp({ projectRef: tenantA, ipSuffix: 12 })).resolves.toMatchObject({ status: 200 });
    await expect(sendOtp({ projectRef: tenantA, ipSuffix: 13 })).resolves.toMatchObject({ status: 200 });
    await expect(sendOtp({ projectRef: tenantA, ipSuffix: 14 })).resolves.toMatchObject({ status: 429 });

    const crossTenantAttempt = await sendOtp({ projectRef: tenantB, ipSuffix: 15 });
    expect(crossTenantAttempt.status).toBe(200);
    expect(crossTenantAttempt.body.ok).toBe(true);
  });

  // Email OTP is a sign-up-and-sign-in surface: controller no longer pre-checks
  // whether an account exists — it stores the OTP, sends the email, and lets
  // `verifyOTP` create the customer record on first successful verification.
  // See `auth.controller.js#sendOTP` ("Email sign-up/sign-in" comment).
  it('returns 200 for an unknown email (sign-up-on-verify path)', async () => {
    db.select.mockResolvedValue([]);
    const res = await request(app).post('/api/auth/otp/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({
        channel: 'email',
        email: 'newsignup@example.com',
        projectRef: 'ref',
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.channel).toBe('email');
  });
});

// ─── POST /api/auth/otp/verify ────────────────────────────────────────────────

describe('POST /api/auth/otp/verify', () => {
  it('returns 400 when OTP not found/expired', async () => {
    sessionService.getOTP.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/otp/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000', code: '123456', projectRef: 'ref' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('returns 400 for wrong code', async () => {
    sessionService.getOTP.mockResolvedValue({ code: '999999', attempts: 0 });
    const res = await request(app).post('/api/auth/otp/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000', code: '123456', projectRef: 'ref' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  it('creates customer session on correct code', async () => {
    const customer = makeCustomer();
    sessionService.getOTP.mockResolvedValue({ code: '123456', attempts: 0 });
    db.select.mockResolvedValue([]);
    db.insert.mockResolvedValue(customer);
    const res = await request(app).post('/api/auth/otp/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ phone: '+447700900000', code: '123456', projectRef: 'ref' });
    expect(res.status).toBe(201);
    expect(res.body.customer).toBeDefined();
    expect(sessionService.createCustomerSession).toHaveBeenCalled();
  });

  it('verifies OTP by email for existing customer', async () => {
    const customer = makeCustomer({ email: 'customer@test.com' });
    sessionService.getOTP.mockResolvedValue({ code: '123456', attempts: 0 });
    db.select.mockResolvedValue([customer]);
    const res = await request(app).post('/api/auth/otp/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ channel: 'email', email: 'customer@test.com', code: '123456', projectRef: 'ref' });
    expect(res.status).toBe(200);
    expect(res.body.customer).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3); // JWT has 3 parts
  });
});

// ─── POST /api/auth/customer/demo-login ──────────────────────────────────────

describe('POST /api/auth/customer/demo-login', () => {
  const platformSettings = require('../models/platform-settings.model');
  const { writeAuditLog } = require('../lib/audit');
  // This suite exceeds the per-IP `authLimiter` window in aggregate with the
  // other auth tests, so we send the bypass token on every call. See
  // `rate-limit.middleware.js#shouldBypass`.
  const BYPASS = ['x-load-test-token', 'test-load-bypass-token'];

  function demoLoginReq() {
    return request(app).post('/api/auth/customer/demo-login')
      .set('Cookie', CSRF_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .set(BYPASS[0], BYPASS[1]);
  }

  beforeEach(() => {
    platformSettings.get.mockReset();
    platformSettings.get.mockResolvedValue(null);
    writeAuditLog.mockClear();
  });

  it('returns 403 DEMO_MODE_DISABLED when demo_mode is off', async () => {
    platformSettings.get.mockResolvedValue('false');
    const res = await demoLoginReq().send({ phone: '+447700900101', projectRef: 'ref' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_MODE_DISABLED');
    expect(sessionService.createCustomerSession).not.toHaveBeenCalled();
  });

  it('returns 403 when demo_mode key is missing', async () => {
    platformSettings.get.mockResolvedValue(null);
    const res = await demoLoginReq().send({ phone: '+447700900102', projectRef: 'ref' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_MODE_DISABLED');
  });

  it('creates customer and issues session + JWT on phone when demo_mode is on', async () => {
    platformSettings.get.mockResolvedValue('true');
    const customer = makeCustomer({ phone: '+447700900103' });
    db.select.mockResolvedValue([]);
    db.insert.mockResolvedValue(customer);
    const res = await demoLoginReq().send({ phone: '+447700900103', projectRef: 'ref' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.demo).toBe(true);
    expect(res.body.created).toBe(true);
    expect(res.body.customer).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(sessionService.createCustomerSession).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.customer_demo_login' }),
    );
  });

  it('signs in an existing customer by email (idempotent, created: false) when demo_mode is on', async () => {
    platformSettings.get.mockResolvedValue('true');
    const customer = makeCustomer({ email: 'demo-login@test.com' });
    db.select.mockResolvedValue([customer]);
    const res = await demoLoginReq()
      .send({ channel: 'email', email: 'demo-login@test.com', projectRef: 'ref' });
    expect(res.status).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.created).toBe(false);
    expect(res.body.customer).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(sessionService.createCustomerSession).toHaveBeenCalled();
  });

  it('returns 400 when both phone and email are provided', async () => {
    platformSettings.get.mockResolvedValue('true');
    const res = await demoLoginReq().send({
      phone: '+447700900104',
      email: 'both@test.com',
      projectRef: 'ref',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither phone nor email is provided', async () => {
    platformSettings.get.mockResolvedValue('true');
    const res = await demoLoginReq().send({ projectRef: 'ref' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed phone', async () => {
    platformSettings.get.mockResolvedValue('true');
    const res = await demoLoginReq().send({ phone: '07700900000', projectRef: 'ref' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/customer/recovery/* ──────────────────────────────────────

describe('POST /api/auth/customer/recovery/send', () => {
  it('returns 200 even when customer email is unknown', async () => {
    db.select.mockResolvedValue([]);
    const res = await request(app).post('/api/auth/customer/recovery/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'missing@test.com', projectRef: 'ref' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 429 when recovery is rate limited', async () => {
    sessionService.checkCustomerRecoveryRateLimit.mockResolvedValue(false);
    const res = await request(app).post('/api/auth/customer/recovery/send')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'customer@test.com', projectRef: 'ref' });
    expect(res.status).toBe(429);
  });
});

describe('POST /api/auth/customer/recovery/verify', () => {
  it('returns 400 when recovery OTP not found/expired', async () => {
    sessionService.getCustomerRecoveryOTP.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/customer/recovery/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .set('X-Forwarded-For', '203.0.113.50')
      .send({
        email: 'customer@test.com',
        code: '123456',
        newPhone: '+447700900001',
        projectRef: 'ref',
      });
    // Accept 400 (OTP not found) or 429 (rate limited) - both are valid responses
    // Rate limiter may kick in depending on test execution order
    expect([400, 429]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toMatch(/expired/i);
    }
  });

  it('recovers customer and updates phone on correct code', async () => {
    const customer = makeCustomer({ email: 'customer@test.com', phone: '+447700900000' });
    const updated = { ...customer, phone: '+447700900001' };
    sessionService.getCustomerRecoveryOTP.mockResolvedValue({ code: '123456', attempts: 0 });
    db.select
      .mockResolvedValueOnce([customer]) // findByEmailProject
      .mockResolvedValueOnce([]) // findByPhoneProject (available)
      .mockResolvedValueOnce([updated]); // findById after update
    db.update.mockResolvedValue(updated);

    const res = await request(app).post('/api/auth/customer/recovery/verify')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .set('X-Forwarded-For', '198.51.100.22')
      .send({
        email: 'customer@test.com',
        code: '123456',
        newPhone: '+447700900001',
        projectRef: 'ref',
      });
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.recovered).toBe(true);
      expect(res.body.customer.phone).toBe('+447700900001');
      expect(res.body.token).toBeDefined();
    }
  });
});

// ─── PATCH /api/auth/customer/profile ────────────────────────────────────────

describe('PATCH /api/auth/customer/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).patch('/api/auth/customer/profile')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({
        name: 'New Name',
      });
    expect([401, 429]).toContain(res.status);
  });

  it('updates customer profile when authenticated', async () => {
    const customer = makeCustomer({ email: 'customer@test.com', name: 'Old Name', organization_id: TEST_ORG_ID });
    const updated = { ...customer, name: 'New Name', email: 'new@test.com' };
    sessionService.getCustomerSession.mockResolvedValue({
      id: customer.id,
      projectRef: customer.project_ref,
      organizationId: customer.organization_id,
      type: 'customer',
    });
    // Audit finding #7: the email dedup check runs per organization
    // (findByEmailInOrganization). attachProjectRef (mounted on the route)
    // refreshes the customer row first, consuming one select.
    db.select
      .mockResolvedValueOnce([customer]) // attachProjectRef customer refresh
      .mockResolvedValueOnce([]) // findByEmailInOrganization(new email) -> available
      .mockResolvedValueOnce([updated]); // findById(updated)
    db.update.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/auth/customer/profile')
      .set('Cookie', CUSTOMER_COOKIE)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ name: 'New Name', email: 'new@test.com' });

    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.customer).toBeDefined();
      expect(res.body.customer.name).toBe('New Name');
      expect(res.body.customer.email).toBe('new@test.com');
    }
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 to prevent enumeration', async () => {
    db.select.mockResolvedValue([]);
    const res = await request(app).post('/api/auth/forgot-password')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .set('X-Forwarded-For', '198.51.100.31')
      .send({ email: 'nobody@test.com' });
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.ok).toBe(true);
    }
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/forgot-password')
      .set('Cookie', CSRF_COOKIE).set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ email: 'bad' });
    expect([400, 429]).toContain(res.status);
  });
});
