'use strict';

/**
 * Global test setup — runs before every test file.
 * Sets environment variables before any module is imported.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Let OS assign a free port
process.env.JOB_RUNNER = 'off'; // Never start background jobs under Jest
process.env.SESSION_SECRET = 'test-session-secret-minimum-32-chars';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars!!';
process.env.SUPABASE_URL = 'https://testprojectref.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test-service-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test-service-key';
process.env.SUPABASE_ACCESS_TOKEN = 'test-access-token';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
// Opt-in rate-limit bypass token for tests that would otherwise flake when
// test volume exceeds the `authLimiter` IP window. Tests must still send
// `X-Load-Test-Token: <token>` explicitly to bypass.
process.env.LOAD_TEST_BYPASS_TOKEN = 'test-load-bypass-token';

// Disable all optional services so tests run without credentials
delete process.env.REDIS_URL;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.SENTRY_DSN;
delete process.env.EMAIL_API_KEY;

// Deterministic fake data across all Jest files (override with FAKER_SEED=123).
const { faker } = require('@faker-js/faker');
faker.seed(parseInt(process.env.FAKER_SEED || '42', 10));
globalThis.faker = faker;
