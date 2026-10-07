'use strict';

const {
  SUPPORTED_LANGUAGES,
  updateLanguageSettingsSchema,
} = require('../validators/language-settings.validator');
const {
  addHostnameSchema,
  addOrgHostnameSchema,
} = require('../validators/hostname.validator');

describe('SaaS language settings', () => {
  test.each(SUPPORTED_LANGUAGES)('accepts supported language %s', (language) => {
    const parsed = updateLanguageSettingsSchema.safeParse({
      defaultLanguage: language,
      locked: false,
    });
    expect(parsed.success).toBe(true);
  });

  test('supports flexible language mode', () => {
    expect(updateLanguageSettingsSchema.parse({ defaultLanguage: 'ur', locked: false })).toEqual({
      defaultLanguage: 'ur',
      locked: false,
    });
  });

  test('rejects unsupported locales', () => {
    expect(updateLanguageSettingsSchema.safeParse({ defaultLanguage: 'xx', locked: false }).success).toBe(false);
  });
});

describe('SaaS custom hostname validation', () => {
  test('normalizes a valid staff hostname', () => {
    expect(addHostnameSchema.parse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      hostname: ' Vendor.Example.com. ',
      appSurface: 'vendor',
    }).hostname).toBe('vendor.example.com');
  });

  test.each([
    'https://vendor.example.com',
    '*.example.com',
    'vendor.example.com:443',
    '127.0.0.1',
    'vendor/example.com',
  ])('rejects unsafe or malformed hostname %s', (hostname) => {
    expect(addHostnameSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      hostname,
      appSurface: 'pos',
    }).success).toBe(false);
  });

  test('accepts customer-facing org hostnames only for customer/rider surfaces', () => {
    expect(addOrgHostnameSchema.safeParse({ hostname: 'order.example.com', appSurface: 'customer' }).success).toBe(true);
    expect(addOrgHostnameSchema.safeParse({ hostname: 'order.example.com', appSurface: 'vendor' }).success).toBe(false);
  });
});
