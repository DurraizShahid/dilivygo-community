/**
 * Test Data Fixtures
 * Contains test data and constants used across E2E tests
 */

/**
 * Test user credentials
 */
export const TEST_USERS = {
  valid: {
    phone: '+447700900000',
    email: 'test@dilivygo.example.com',
  },
  invalid: {
    phone: '+4477009000', // Too short
    email: 'invalid-email',
  },
} as const;

/**
 * OTP codes
 */
export const OTP_CODES = {
  valid: '123456',
  invalid: '000000',
  expired: '111111',
} as const;

/**
 * Test addresses
 */
export const TEST_ADDRESSES = {
  valid: {
    line1: '123 Test Street',
    city: 'London',
    postcode: 'SW1A 1AA',
    full: '123 Test Street, London, SW1A 1AA',
  },
  outOfRange: {
    line1: '999 Far Away Lane',
    city: 'Edinburgh',
    postcode: 'EH1 1AA',
    full: '999 Far Away Lane, Edinburgh, EH1 1AA',
  },
} as const;

/**
 * Stripe test card data
 */
export const STRIPE_TEST_CARDS = {
  valid: {
    number: '4242424242424242',
    expiry: '1234',
    cvc: '123',
  },
  declined: {
    number: '4000000000000002',
    expiry: '1234',
    cvc: '123',
  },
  insufficientFunds: {
    number: '4000000000009995',
    expiry: '1234',
    cvc: '123',
  },
  requires3DS: {
    number: '4000002500003155',
    expiry: '1234',
    cvc: '123',
  },
} as const;

/**
 * Promo codes for testing
 */
export const PROMO_CODES = {
  valid: 'TEST10',
  freeDelivery: 'FREEDELIVERY',
  invalid: 'INVALIDCODE',
  expired: 'EXPIREDCODE',
} as const;

/**
 * Test restaurant data
 */
export const TEST_RESTAURANTS = {
  demo: {
    ref: 'demo',
    name: 'Demo Restaurant',
  },
} as const;

/**
 * Common timeout values
 */
export const TIMEOUTS = {
  short: 5_000,
  medium: 10_000,
  long: 30_000,
  navigation: 15_000,
  networkRequest: 10_000,
} as const;

/**
 * Common wait intervals for debounced operations
 */
export const WAIT_INTERVALS = {
  debounce: 500,
  apiResponse: 1_000,
  animation: 300,
} as const;

/**
 * Order status values
 */
export const ORDER_STATUSES = {
  placed: 'placed',
  accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  assigned: 'assigned',
  pickedUp: 'picked_up',
  arrived: 'arrived',
  completed: 'completed',
  cancelled: 'cancelled',
  rejected: 'rejected',
  scheduled: 'scheduled',
} as const;

/**
 * Cuisine categories for filtering
 */
export const CUISINE_CATEGORIES = [
  'all',
  'italian',
  'chinese',
  'indian',
  'mexican',
  'japanese',
  'thai',
  'american',
  'mediterranean',
] as const;

/**
 * Dietary preferences for filtering
 */
export const DIETARY_PREFERENCES = [
  'vegan',
  'halal',
  'gluten_free',
  'nut_free',
] as const;

/**
 * Sort options
 */
export const SORT_OPTIONS = [
  'relevance',
  'distance',
  'rating',
  'delivery_time',
  'min_order',
  'name',
] as const;

/**
 * Test message for chat
 */
export const TEST_MESSAGES = {
  simple: 'Hello, this is a test message',
  withEmoji: 'Thanks for the food! 🍕',
  question: 'Could you please add extra sauce?',
} as const;

/**
 * Generate a scheduled delivery time (1 hour from now)
 */
export function getScheduledDeliveryTime(): { date: string; time: string } {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
  };
}

/**
 * Generate a random test email
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  return `test.user.${timestamp}@dilivygo.example.com`;
}

/**
 * Generate a random test phone
 */
export function generateTestPhone(): string {
  const randomDigits = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `+44770${randomDigits}`;
}
