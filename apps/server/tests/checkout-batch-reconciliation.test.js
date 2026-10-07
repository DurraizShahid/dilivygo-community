'use strict';

jest.mock('../services/checkout-batch.service', () => ({
  attachPaymentIntent: jest.fn(),
  completeCheckoutBatch: jest.fn(),
  deleteCheckoutBatch: jest.fn(),
  listExpiredPending: jest.fn(),
}));

jest.mock('../services/stripe.service', () => ({
  getPaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  supabaseFetch: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../lib/lock', () => ({
  acquireLock: jest.fn(),
  releaseLock: jest.fn(),
}));

const checkoutBatchService = require('../services/checkout-batch.service');
const { getPaymentIntent, cancelPaymentIntent } = require('../services/stripe.service');
const { select } = require('../lib/supabase');
const {
  reconcilePending,
  batchFulfillmentState,
  expectedShopIds,
} = require('../jobs/checkout-batch-cleanup.job');

function batch(overrides = {}) {
  return {
    id: 'batch-1',
    payment_intent_id: null,
    payload: {
      groups: [
        { shopId: 'shop-a' },
        { shopId: 'shop-b' },
      ],
    },
    ...overrides,
  };
}

describe('checkout batch reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkoutBatchService.attachPaymentIntent.mockResolvedValue({ id: 'batch-1' });
    checkoutBatchService.completeCheckoutBatch.mockResolvedValue(undefined);
    checkoutBatchService.deleteCheckoutBatch.mockResolvedValue(undefined);
    getPaymentIntent.mockResolvedValue(null);
    cancelPaymentIntent.mockResolvedValue({ id: 'pi-real', status: 'canceled' });
    select.mockResolvedValue([]);
  });

  test('requires every expected shop order before declaring multi-shop fulfillment complete', async () => {
    select.mockResolvedValueOnce([{ id: 'order-a', shop_id: 'shop-a' }]);
    const state = await batchFulfillmentState(batch(), 'pi-real');
    expect(state).toEqual({ complete: false, expected: 2, found: 1 });

    select.mockResolvedValueOnce([
      { id: 'order-a', shop_id: 'shop-a' },
      { id: 'order-b', shop_id: 'shop-b' },
    ]);
    const complete = await batchFulfillmentState(batch(), 'pi-real');
    expect(complete.complete).toBe(true);
  });

  test('deduplicates expected shop ids', () => {
    expect(expectedShopIds(batch({
      payload: { groups: [{ shopId: 'shop-a' }, { shopId: 'shop-a' }] },
    }))).toEqual(['shop-a']);
  });

  test('recovers an unlinked wallet batch only when all orders exist', async () => {
    select.mockImplementation(async (table) => {
      if (table === 'orders') {
        return [
          { id: 'order-a', shop_id: 'shop-a' },
          { id: 'order-b', shop_id: 'shop-b' },
        ];
      }
      return [];
    });

    const outcome = await reconcilePending(batch());

    expect(outcome).toBe('completed_wallet_recovered');
    expect(checkoutBatchService.attachPaymentIntent).toHaveBeenCalledWith('batch-1', 'wallet_batch-1');
    expect(checkoutBatchService.completeCheckoutBatch).toHaveBeenCalledWith('batch-1');
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
  });

  test('keeps an unlinked wallet batch when money moved but fulfillment is incomplete', async () => {
    select.mockImplementation(async (table, options) => {
      if (table === 'orders') return [{ id: 'order-a', shop_id: 'shop-a' }];
      if (table === 'customer_wallet_ledger' && options?.filters?.idempotency_key === 'checkout_debit:batch-1') {
        return [{ id: 'ledger-1' }];
      }
      return [];
    });

    const outcome = await reconcilePending(batch());

    expect(outcome).toBe('kept_wallet_debit_incomplete');
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
  });

  test('deletes an expired unlinked batch when no payment or wallet movement exists', async () => {
    select.mockResolvedValue([]);
    const outcome = await reconcilePending(batch());
    expect(outcome).toBe('deleted_unattached');
    expect(checkoutBatchService.deleteCheckoutBatch).toHaveBeenCalledWith('batch-1');
  });

  test('keeps a fully fulfilled real Stripe batch pending until webhook commit', async () => {
    select.mockResolvedValueOnce([
      { id: 'order-a', shop_id: 'shop-a' },
      { id: 'order-b', shop_id: 'shop-b' },
    ]);

    const outcome = await reconcilePending(batch({ payment_intent_id: 'pi-real' }));

    expect(outcome).toBe('kept_orders_complete_webhook_pending');
    expect(checkoutBatchService.completeCheckoutBatch).not.toHaveBeenCalled();
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
    expect(getPaymentIntent).not.toHaveBeenCalled();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });

  test('keeps a partially fulfilled real Stripe batch for webhook retry', async () => {
    select.mockResolvedValueOnce([{ id: 'order-a', shop_id: 'shop-a' }]);

    const outcome = await reconcilePending(batch({ payment_intent_id: 'pi-real' }));

    expect(outcome).toBe('kept_orders_partial_webhook_pending');
    expect(getPaymentIntent).not.toHaveBeenCalled();
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });

  test('keeps a succeeded Stripe payment with no local orders for webhook recovery', async () => {
    select.mockResolvedValueOnce([]);
    getPaymentIntent.mockResolvedValueOnce({ id: 'pi-real', status: 'succeeded' });

    const outcome = await reconcilePending(batch({ payment_intent_id: 'pi-real' }));

    expect(outcome).toBe('kept_succeeded_unfulfilled');
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });

  test('cancels and deletes an expired unconfirmed Stripe payment with no local orders', async () => {
    select.mockResolvedValueOnce([]);
    getPaymentIntent.mockResolvedValueOnce({ id: 'pi-real', status: 'requires_payment_method' });

    const outcome = await reconcilePending(batch({ payment_intent_id: 'pi-real' }));

    expect(cancelPaymentIntent).toHaveBeenCalledWith('pi-real', {
      idempotencyKey: 'checkout_batch_expiry:pi-real',
    });
    expect(checkoutBatchService.deleteCheckoutBatch).toHaveBeenCalledWith('batch-1');
    expect(outcome).toBe('deleted_canceled');
  });

  test('keeps the batch when Stripe cancellation is uncertain', async () => {
    select.mockResolvedValueOnce([]);
    getPaymentIntent.mockResolvedValueOnce({ id: 'pi-real', status: 'requires_action' });
    cancelPaymentIntent.mockRejectedValueOnce(new Error('stripe timeout'));

    const outcome = await reconcilePending(batch({ payment_intent_id: 'pi-real' }));

    expect(outcome).toBe('kept_cancel_failed');
    expect(checkoutBatchService.deleteCheckoutBatch).not.toHaveBeenCalled();
  });
});
