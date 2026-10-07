'use strict';

const {
  canonicalizeLegacyOrderCheckout,
  computedSubtotal,
} = require('../middleware/legacy-checkout-canonicalization.middleware');

function validItem(overrides = {}) {
  return {
    productId: '11111111-1111-1111-1111-111111111111',
    name: 'Meal',
    quantity: 2,
    unitPriceCents: 500,
    modifiers: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('legacy order checkout canonicalization', () => {
  test('computes subtotal from validated line quantities and unit prices', () => {
    expect(computedSubtotal([
      validItem(),
      validItem({ quantity: 1, unitPriceCents: 250 }),
    ])).toBe(1250);
  });

  test('turns legacy single-shop metadata into one canonical checkout group', () => {
    const req = {
      projectRef: 'workspace-a',
      body: {
        amountCents: 1100,
        metadata: {
          shopId: '22222222-2222-2222-2222-222222222222',
          items: JSON.stringify([validItem()]),
          address: '123 Main Street',
          deliveryFeeCents: '100',
          wantsCutlery: 'true',
        },
      },
    };
    const next = jest.fn();

    canonicalizeLegacyOrderCheckout(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.checkoutDraft).toEqual(expect.objectContaining({
      deliveryFeeCents: 100,
      address: '123 Main Street',
      groups: [expect.objectContaining({
        projectRef: 'workspace-a',
        shopId: '22222222-2222-2222-2222-222222222222',
        subtotalCents: 1000,
        wantsCutlery: true,
      })],
    }));
    expect(req.body.metadata.items).toBeUndefined();
  });

  test('does not canonicalize wallet topups or other purpose-specific intents', () => {
    const req = {
      projectRef: 'workspace-a',
      body: {
        amountCents: 1000,
        metadata: {
          purpose: 'wallet_topup',
          shopId: '22222222-2222-2222-2222-222222222222',
          items: JSON.stringify([validItem()]),
        },
      },
    };
    const next = jest.fn();

    canonicalizeLegacyOrderCheckout(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.checkoutDraft).toBeUndefined();
  });

  test('fails closed when legacy order metadata cannot satisfy modern checkout schema', () => {
    const req = {
      projectRef: 'workspace-a',
      body: {
        amountCents: 1000,
        metadata: {
          shopId: '22222222-2222-2222-2222-222222222222',
          items: JSON.stringify([validItem()]),
          address: '',
        },
      },
    };
    const next = jest.fn();

    canonicalizeLegacyOrderCheckout(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      code: 'LEGACY_CHECKOUT_INVALID',
    });
  });
});
