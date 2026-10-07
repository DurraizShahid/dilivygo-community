'use strict';

jest.mock('../services/inventory-reservation.service', () => ({
  reserveForCheckout: jest.fn(),
  attachPaymentIntent: jest.fn(),
  consume: jest.fn(),
  release: jest.fn(),
}));

jest.mock('../services/stripe.service', () => ({
  cancelPaymentIntent: jest.fn(),
}));

jest.mock('../services/order-line-pricing.service', () => ({
  assertOrderItemsPricedForShop: jest.fn(),
}));

const inventory = require('../services/inventory-reservation.service');
const { cancelPaymentIntent } = require('../services/stripe.service');
const { assertOrderItemsPricedForShop } = require('../services/order-line-pricing.service');
const { reserveCheckoutInventory, checkoutGroups } = require('../middleware/inventory-reservation.middleware');

function makeRes() {
  const res = {
    statusCode: 200,
    writableEnded: false,
    sent: null,
    once: jest.fn(),
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(body) {
      this.sent = body;
      this.writableEnded = true;
      return this;
    }),
  };
  return res;
}

function draftReq() {
  return {
    projectRef: 'workspace-a',
    body: {
      checkoutDraft: {
        groups: [{
          shopId: 'shop-a',
          projectRef: 'workspace-a',
          items: [{ productId: 'product-a', productVariantId: 'variant-a', quantity: 2 }],
        }],
      },
    },
  };
}

describe('inventory reservation middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inventory.reserveForCheckout.mockResolvedValue('res-1');
    inventory.attachPaymentIntent.mockResolvedValue({ id: 'res-1' });
    inventory.consume.mockResolvedValue({ id: 'res-1' });
    inventory.release.mockResolvedValue({ id: 'res-1' });
    cancelPaymentIntent.mockResolvedValue({ id: 'pi-1', status: 'canceled' });
    assertOrderItemsPricedForShop.mockResolvedValue(true);
  });

  test('normalizes legacy metadata items into a checkout group', () => {
    const req = {
      projectRef: 'workspace-a',
      body: {
        metadata: {
          shopId: 'shop-a',
          items: JSON.stringify([{ productId: 'p1', productVariantId: 'v1', quantity: 1 }]),
        },
      },
    };
    expect(checkoutGroups(req)).toEqual([{
      shopId: 'shop-a',
      projectRef: 'workspace-a',
      items: [{ productId: 'p1', productVariantId: 'v1', quantity: 1 }],
    }]);
  });

  test('validates line ownership before reserving stock', async () => {
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);

    expect(assertOrderItemsPricedForShop).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 'shop-a',
      projectRef: 'workspace-a',
    }));
    expect(inventory.reserveForCheckout).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  test('links a Stripe PaymentIntent before sending the successful response', async () => {
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);
    await res.json({ paymentIntentId: 'pi-1', clientSecret: 'secret', isDummy: false });

    expect(inventory.attachPaymentIntent).toHaveBeenCalledWith('res-1', 'pi-1');
    expect(inventory.consume).not.toHaveBeenCalled();
    expect(inventory.release).not.toHaveBeenCalled();
    expect(res.sent).toEqual(expect.objectContaining({ paymentIntentId: 'pi-1' }));
  });

  test('consumes successful wallet-only inventory even when synthetic id linkage fails', async () => {
    inventory.attachPaymentIntent.mockRejectedValueOnce(new Error('db unavailable'));
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);
    await res.json({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });

    expect(inventory.consume).toHaveBeenCalledWith('res-1');
    expect(inventory.release).not.toHaveBeenCalled();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.sent).toEqual({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });
  });

  test('cancels Stripe and releases stock when reservation linkage fails', async () => {
    inventory.attachPaymentIntent.mockRejectedValueOnce(new Error('db unavailable'));
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);
    await res.json({ paymentIntentId: 'pi-1', clientSecret: 'secret', isDummy: false });

    expect(cancelPaymentIntent).toHaveBeenCalledWith('pi-1', expect.objectContaining({
      idempotencyKey: 'inventory_attach_failed:pi-1',
    }));
    expect(inventory.release).toHaveBeenCalledWith('res-1');
    expect(res.statusCode).toBe(503);
    expect(res.sent.code).toBe('INVENTORY_PAYMENT_LINK_FAILED');
  });

  test('keeps stock reserved if Stripe cancellation is uncertain', async () => {
    inventory.attachPaymentIntent.mockRejectedValueOnce(new Error('db unavailable'));
    cancelPaymentIntent.mockRejectedValueOnce(new Error('stripe timeout'));
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);
    await res.json({ paymentIntentId: 'pi-1', clientSecret: 'secret', isDummy: false });

    expect(inventory.release).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  test('maps insufficient stock to a conflict response', async () => {
    inventory.reserveForCheckout.mockRejectedValueOnce(new Error('insufficient or unavailable stock'));
    const req = draftReq();
    const res = makeRes();
    const next = jest.fn();

    await reserveCheckoutInventory(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(409);
  });
});
