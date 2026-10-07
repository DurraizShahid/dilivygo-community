'use strict';

/**
 * Phase 01 — capability-map tests for `lib/integration-capabilities.js`.
 *
 * Uses the real `integrations/catalog.json` (static local JSON, no network):
 * the whole point is that every catalog key resolves to ≥1 capability.
 */

const catalog = require('../../../integrations/catalog.json');
const {
  CAPABILITIES,
  PROVIDER_CAPABILITIES,
  getCapabilities,
  hasCapability,
  assertCapability,
  providersForCapability,
} = require('../lib/integration-capabilities');

describe('integration capabilities', () => {
  test('exposes the canonical capability vocabulary', () => {
    for (const expected of [
      'payments',
      'marketplace-payments',
      'payouts',
      'accounting',
      'marketplace-orders',
      'pos',
      'crm',
      'marketing',
      'email',
      'messaging',
      'support',
      'notifications',
      'collaboration',
      'analytics',
      'automation',
      'push-notifications',
      'maps',
      'ai',
      'bnpl',
    ]) {
      expect(Object.values(CAPABILITIES)).toContain(expected);
    }
  });

  test('every catalog key resolves to at least one capability', () => {
    expect(catalog.length).toBeGreaterThan(0);
    for (const item of catalog) {
      const caps = getCapabilities(item.key);
      expect(Array.isArray(caps)).toBe(true);
      expect(caps.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PROVIDER_CAPABILITIES)).toHaveLength(catalog.length);
  });

  test('quickbooks and xero include the accounting capability', () => {
    expect(getCapabilities('quickbooks')).toContain('accounting');
    expect(getCapabilities('xero')).toContain('accounting');
    expect(assertCapability('quickbooks', 'accounting')).toBe(true);
    expect(assertCapability('xero', 'accounting')).toBe(true);
    expect(providersForCapability('accounting')).toEqual(
      expect.arrayContaining(['quickbooks', 'xero']),
    );
  });

  test('catalog capabilities pass through verbatim (lower-cased)', () => {
    expect(getCapabilities('resend')).toContain('email');
    expect(hasCapability('google-maps', 'maps')).toBe(true);
    expect(hasCapability('stripe', 'payments')).toBe(true);
  });

  test('normalizes provider and capability casing/whitespace', () => {
    expect(hasCapability('  QuickBooks ', ' Accounting ')).toBe(true);
    expect(assertCapability('XERO', 'ACCOUNTING')).toBe(true);
  });

  test('unknown provider throws 404 PROVIDER_NOT_CONFIGURED', () => {
    expect(getCapabilities('no-such-provider')).toBeNull();
    expect(hasCapability('no-such-provider', 'payments')).toBe(false);
    try {
      assertCapability('no-such-provider', 'payments');
      throw new Error('assertCapability did not throw');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 404, code: 'PROVIDER_NOT_CONFIGURED' });
    }
  });

  test('unsupported capability throws 422 CAPABILITY_NOT_SUPPORTED', () => {
    expect(hasCapability('quickbooks', 'payments')).toBe(false);
    try {
      assertCapability('quickbooks', 'payments');
      throw new Error('assertCapability did not throw');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 422, code: 'CAPABILITY_NOT_SUPPORTED' });
    }
    try {
      assertCapability('quickbooks', 'not-a-capability');
      throw new Error('assertCapability did not throw');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 422, code: 'CAPABILITY_NOT_SUPPORTED' });
    }
  });
});
