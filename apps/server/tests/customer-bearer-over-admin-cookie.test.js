'use strict';

/**
 * Regression: customer web stores JWT + calls API on :8080 while vendor/admin
 * cookie may exist on localhost. parseSession must honor Bearer customer before
 * admin_session so requireCustomer routes succeed.
 */

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

jest.mock('../websocket/ws-server', () => ({
  init: jest.fn(),
  broadcast: jest.fn(),
  sendToUser: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const config = require('../config');
const db = require('../lib/supabase');
const sessionService = require('../services/session.service');
const { makeCustomer } = require('./helpers/mocks');
const { TEST_CSRF_TOKEN, CSRF_COOKIE, CSRF_HEADER_NAME } = require('./helpers/app');

const ADMIN_COOKIE = `admin_session=test-admin-sid; ${CSRF_COOKIE}`;

beforeEach(() => {
  db.select.mockResolvedValue([]);
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
});

describe('Customer Bearer over admin cookie', () => {
  it('PATCH /api/auth/customer/profile authenticates via JWT when admin_session is also sent', async () => {
    const customer = makeCustomer({ email: 'customer@test.com', name: 'Old Name' });
    const updated = { ...customer, name: 'JWT Name', email: 'jwt@test.com' };
    sessionService.getAdminSession.mockResolvedValue({
      id: 'admin-user-id',
      role: 'admin',
      projectRef: 'other-ref',
    });
    const token = jwt.sign(
      {
        id: customer.id,
        phone: customer.phone,
        email: customer.email,
        name: customer.name,
        projectRef: customer.project_ref,
        type: 'customer',
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    // attachProjectRef calls customerModel.findById (select) before the handler body.
    db.select
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([updated]);
    db.update.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/auth/customer/profile')
      .set('Cookie', ADMIN_COOKIE)
      .set('Authorization', `Bearer ${token}`)
      .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN)
      .send({ name: 'JWT Name', email: 'jwt@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('JWT Name');
    expect(res.body.customer.email).toBe('jwt@test.com');
  });
});
