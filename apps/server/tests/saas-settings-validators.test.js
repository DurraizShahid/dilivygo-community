'use strict';

const {
  SUPPORTED_LANGUAGES,
  updateLanguageSettingsSchema,
} = require('../validators/language-settings.validator');
const {
  hostnameField,
  addHostnameSchema,
  addOrgHostnameSchema,
} = require('../validators/hostname.validator');

describe('SaaS language settings validator', () => {
  test('accepts every supported SaaS locale', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(17);

    for (const locale of SUPPORTED_LANGUAGES) {
      const result = updateLanguageSettingsSchema.safeParse({
        defaultLanguage: locale,
        locked: false,
      });
      expect(result.success).toBe(true);
    }
  });

  test('rejects unsupported locales instead of silently accepting them', () => {
    expect(updateLanguageSettingsSchema.safeParse({ defaultLanguage: 'xx' }).success).toBe(false);
    expect(updateLanguageSettingsSchema.safeParse({ defaultLanguage: 'en-US' }).success).toBe(false);
  });
});

describe('SaaS custom hostname validator', () => {
  test('normalizes valid public hostnames', () => {
    expect(hostnameField.parse('  Vendor.Example.com.  ')).toBe('vendor.example.com');
  });

  test.each([
    'https://vendor.example.com',
    'vendor.example.com/path',
    'vendor.example.com:443',
    '*.example.com',
    '127.0.0.1',
    'localhost',
    'bad_host.example.com',
  ])('rejects unsafe or non-DNS hostname input: %s', (hostname) => {
    expect(hostnameField.safeParse(hostname).success).toBe(false);
  });

  test('validates workspace-scoped and organization-scoped surfaces', () => {
    const workspaceResult = addHostnameSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      hostname: 'vendor.example.com',
      appSurface: 'vendor',
    });
    expect(workspaceResult.success).toBe(true);

    const orgResult = addOrgHostnameSchema.safeParse({
      hostname: 'orders.example.com',
      appSurface: 'customer',
    });
    expect(orgResult.success).toBe(true);

    expect(addHostnameSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      hostname: 'rider.example.com',
      appSurface: 'rider',
    }).success).toBe(false);
  });
});
