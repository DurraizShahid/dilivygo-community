'use strict';

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn(),
}));

const platformSettings = require('../models/platform-settings.model');
const {
  DEFAULT_CURRENCY,
  getPlatformCurrency,
  validCurrency,
  resolveShopCurrencySync,
} = require('../lib/currency');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('currency helpers', () => {
  test('accepts only canonical three-letter currency codes', () => {
    expect(validCurrency(' USD ')).toBe('usd');
    expect(validCurrency('aed')).toBe('aed');
    expect(validCurrency('US')).toBeNull();
    expect(validCurrency('usdollars')).toBeNull();
    expect(validCurrency('$USD')).toBeNull();
    expect(validCurrency('12A')).toBeNull();
    expect(validCurrency(null)).toBeNull();
  });

  test('does not keep a second stale cache after tenant currency changes', async () => {
    platformSettings.get
      .mockResolvedValueOnce('gbp')
      .mockResolvedValueOnce('usd');

    await expect(getPlatformCurrency({ organizationId: 'org-1' })).resolves.toBe('gbp');
    await expect(getPlatformCurrency({ organizationId: 'org-1' })).resolves.toBe('usd');
    expect(platformSettings.get).toHaveBeenCalledTimes(2);
  });

  test('falls back safely when a stored setting is malformed', async () => {
    platformSettings.get.mockResolvedValue('usdollars');
    await expect(getPlatformCurrency({ organizationId: 'org-1' })).resolves.toBe(DEFAULT_CURRENCY);
  });

  test('keeps shop then workspace then tenant fallback precedence', () => {
    expect(resolveShopCurrencySync({ currency: 'eur' }, { currency: 'usd' }, 'gbp')).toBe('eur');
    expect(resolveShopCurrencySync({}, { currency: 'usd' }, 'gbp')).toBe('usd');
    expect(resolveShopCurrencySync({}, {}, 'aed')).toBe('aed');
  });
});
