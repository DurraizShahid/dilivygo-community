/**
 * E2E Test Fixtures
 * Re-export all fixtures for easy importing in tests
 */

export { test, expect, clearAuthState, globalAuthSetup } from './auth';
export type { TestUser, AuthFixtures } from './auth';
export { DEFAULT_TEST_USER } from './auth';

export {
  TEST_USERS,
  OTP_CODES,
  TEST_ADDRESSES,
  STRIPE_TEST_CARDS,
  PROMO_CODES,
  TEST_RESTAURANTS,
  TIMEOUTS,
  WAIT_INTERVALS,
  ORDER_STATUSES,
  CUISINE_CATEGORIES,
  DIETARY_PREFERENCES,
  SORT_OPTIONS,
  TEST_MESSAGES,
  getScheduledDeliveryTime,
  generateTestEmail,
  generateTestPhone,
} from './test-data';
