'use strict';

jest.mock('../models/shop.model', () => ({
  findById: jest.fn(),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
}));

jest.mock('../lib/currency', () => ({
  getPlatformCurrency: jest.fn(),
  resolveShopCurrency: jest.fn(),
  validCurrency: jest.fn((value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : null;
  }),
}));

const shopModel = require('../models/shop.model');
const db = require('../lib/supabase');
const currency = require('../lib/currency');
const { enforceAuthoritativeCurrency } = require('../middleware/currency-authority.middleware');

function invoke(body, extraReq = {}) {
  return new Promise((resolve) => {
    const req = { body, ...extraReq };
    enforceAuthoritativeCurrency(req, {}, (err) => resolve({ req, err }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.select.mockResolvedValue([]);
  currency.getPlatformCurrency.mockResolvedValue('gbp');
});

describe('enforceAuthoritativeCurrency', () => {
  test('normalizes checkout to the server-resolved shop currency', async () => {
    shopModel.findById.mockResolvedValue({ id: 'shop-1', project_ref: 'acme' });
    db.select.mockResolvedValue([{ project_ref: 'acme', currency: null }]);
    currency.resolveShopCurrency.mockResolvedValue('eur');

    const { req, err } = await invoke({
      currency: 'EUR',
      checkoutDraft: { groups: [{ shopId: 'shop-1', projectRef: 'acme' }] },
    });

    expect(err).toBeUndefined();
    expect(req.body.currency).toBe('eur');
  });

  test('rejects a stale or manipulated client currency', async () => {
    shopModel.findById.mockResolvedValue({ id: 'shop-1', project_ref: 'acme' });
    db.select.mockResolvedValue([{ project_ref: 'acme', currency: null }]);
    currency.resolveShopCurrency.mockResolvedValue('gbp');

    const { err } = await invoke({
      currency: 'usd',
      checkoutDraft: { groups: [{ shopId: 'shop-1', projectRef: 'acme' }] },
    });

    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CURRENCY_MISMATCH');
  });

  test('rejects a cart containing shops with different currencies', async () => {
    shopModel.findById
      .mockResolvedValueOnce({ id: 'shop-1', project_ref: 'a' })
      .mockResolvedValueOnce({ id: 'shop-2', project_ref: 'b' });
    db.select
      .mockResolvedValueOnce([{ project_ref: 'a' }])
      .mockResolvedValueOnce([{ project_ref: 'b' }]);
    currency.resolveShopCurrency
      .mockResolvedValueOnce('gbp')
      .mockResolvedValueOnce('eur');

    const { err } = await invoke({
      checkoutDraft: {
        groups: [
          { shopId: 'shop-1', projectRef: 'a' },
          { shopId: 'shop-2', projectRef: 'b' },
        ],
      },
    });

    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('MIXED_CURRENCY_CART');
  });

  test('falls back to organization currency when no shop group is present', async () => {
    currency.getPlatformCurrency.mockResolvedValue('aed');

    const { req, err } = await invoke(
      { checkoutDraft: { groups: [] } },
      { organizationId: 'org-1' },
    );

    expect(err).toBeUndefined();
    expect(currency.getPlatformCurrency).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(req.body.currency).toBe('aed');
  });
});
