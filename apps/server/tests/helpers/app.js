'use strict';

/**
 * Test app helper.
 *
 * Provides createTestApp() — returns a supertest agent pre-wired with
 * an authenticated admin or customer session, bypassing real session lookup.
 *
 * Usage:
 *   const { agent } = createTestApp({ role: 'admin', projectRef: 'test-ref' });
 *   await agent.get('/api/orders').expect(200);
 */

const request = require('supertest');

// Test CSRF token - used by all tests to bypass CSRF validation
const TEST_CSRF_TOKEN = 'test-csrf-token-for-unit-tests-12345';
const CSRF_COOKIE = `csrf_token=${TEST_CSRF_TOKEN}`;
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Build a supertest agent from the express app with session middleware bypassed.
 * In test environment, CSRF validation is bypassed so no token wrapping is needed.
 *
 * @param {object} [opts]
 * @param {'admin'|'vendor'|'rider'|'customer'|null} [opts.role] - Session role to inject
 * @param {string} [opts.projectRef]
 * @param {string} [opts.userId]
 */
function createTestApp(opts = {}) {
  const { role = 'admin', projectRef = 'test-project-ref', userId = 'user-uuid-001' } = opts;

  const app = require('../../app');
  const agent = request.agent(app);

  // Inject session via the parseSession middleware mock
  // The session service's getAdminSession / getCustomerSession
  // are mocked per-test — use mockAdminSession / mockCustomerSession helpers below.
  // 
  // Note: In test environment (NODE_ENV=test), CSRF validation is bypassed
  // when no CSRF token is provided, so no automatic token setup is needed.

  return { app, agent };
}

/**
 * Wrap a supertest agent to automatically include CSRF cookie and header
 * on all requests. For POST, PUT, PATCH, DELETE requests, the header is required.
 */
function wrapAgentWithCsrf(baseAgent) {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
  const mutatingMethods = ['post', 'put', 'patch', 'delete'];
  
  const wrappedAgent = {};
  
  methods.forEach(method => {
    wrappedAgent[method] = function(...args) {
      const req = baseAgent[method](...args);
      // Always set the CSRF cookie
      req.set('Cookie', CSRF_COOKIE);
      // For mutating methods, also set the header
      if (mutatingMethods.includes(method)) {
        req.set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
      }
      return req;
    };
  });
  
  return wrappedAgent;
}

/**
 * Mock an admin session in the session service for the duration of a test.
 * Call inside beforeEach or the test body.
 */
function mockAdminSession(sessionService, userData = {}) {
  const defaults = {
    id: 'user-uuid-001',
    email: 'admin@test.com',
    role: 'admin',
    projectRef: 'test-project-ref',
    type: 'admin',
  };
  sessionService.getAdminSession.mockResolvedValue({ ...defaults, ...userData });
  return defaults.id;
}

/**
 * Mock a customer session in the session service.
 */
function mockCustomerSession(sessionService, customerData = {}) {
  const defaults = {
    id: 'customer-uuid-001',
    phone: '+447700900000',
    name: 'Test Customer',
    projectRef: 'test-project-ref',
    type: 'customer',
  };
  sessionService.getCustomerSession.mockResolvedValue({ ...defaults, ...customerData });
  return defaults.id;
}

/**
 * Clear all mocked sessions (unauthenticated state).
 */
function clearSessions(sessionService) {
  sessionService.getAdminSession.mockResolvedValue(null);
  sessionService.getCustomerSession.mockResolvedValue(null);
}

module.exports = { 
  createTestApp, 
  mockAdminSession, 
  mockCustomerSession, 
  clearSessions,
  // Export CSRF helpers for tests that need manual control
  TEST_CSRF_TOKEN,
  CSRF_COOKIE,
  CSRF_HEADER_NAME,
  wrapAgentWithCsrf,
};
