'use strict';

jest.mock('../services/checkout-batch.service', () => ({
  attachPaymentIntent: jest.fn(),
  completeCheckoutBatch: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  error: jest.fn(),
}));

const checkoutBatchService = require('../services/checkout-batch.service');
const {
  checkoutBatchResponseLifecycle,
  batchIdFromResponse,
  isImmediateCheckoutResponse,
} = require('../middleware/checkout-batch-response.middleware');

function makeRes() {
  return {
    statusCode: 200,
    sent: null,
    json: jest.fn(function json(body) {
      this.sent = body;
      return this;
    }),
  };
}

describe('checkout batch response lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkoutBatchService.attachPaymentIntent.mockResolvedValue({ id: 'batch-1' });
    checkoutBatchService.completeCheckoutBatch.mockResolvedValue(undefined);
  });

  test('derives wallet batch id from the synthetic payment id', () => {
    expect(batchIdFromResponse({ paymentIntentId: 'wallet_batch-123' })).toBe('batch-123');
    expect(isImmediateCheckoutResponse({ paymentIntentId: 'wallet_batch-123' })).toBe(true);
  });

  test('uses the non-enumerable internal batch id returned by Stripe service', () => {
    const body = { paymentIntentId: 'pi_dummy_1', isDummy: true };
    Object.defineProperty(body, '__checkoutBatchId', { enumerable: false, value: 'batch-demo' });
    expect(batchIdFromResponse(body)).toBe('batch-demo');
    expect(Object.keys(body)).not.toContain('__checkoutBatchId');
  });

  test('links and completes wallet-only checkout before serialization', async () => {
    const res = makeRes();
    const next = jest.fn();
    checkoutBatchResponseLifecycle({}, res, next);

    await res.json({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });

    expect(checkoutBatchService.attachPaymentIntent).toHaveBeenCalledWith('batch-1', 'wallet_batch-1');
    expect(checkoutBatchService.completeCheckoutBatch).toHaveBeenCalledWith('batch-1');
    expect(res.sent).toEqual({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });
  });

  test('completes a demo batch using its hidden batch id', async () => {
    const res = makeRes();
    const next = jest.fn();
    checkoutBatchResponseLifecycle({}, res, next);

    const body = { paymentIntentId: 'pi_dummy_1', isDummy: true };
    Object.defineProperty(body, '__checkoutBatchId', { enumerable: false, value: 'batch-demo' });
    await res.json(body);

    expect(checkoutBatchService.attachPaymentIntent).toHaveBeenCalledWith('batch-demo', 'pi_dummy_1');
    expect(checkoutBatchService.completeCheckoutBatch).toHaveBeenCalledWith('batch-demo');
  });

  test('does not complete normal Stripe checkout before webhook fulfillment', async () => {
    const res = makeRes();
    const next = jest.fn();
    checkoutBatchResponseLifecycle({}, res, next);

    const body = { paymentIntentId: 'pi_real', clientSecret: 'secret', isDummy: false };
    Object.defineProperty(body, '__checkoutBatchId', { enumerable: false, value: 'batch-real' });
    await res.json(body);

    expect(checkoutBatchService.attachPaymentIntent).not.toHaveBeenCalled();
    expect(checkoutBatchService.completeCheckoutBatch).not.toHaveBeenCalled();
    expect(res.sent).toBe(body);
  });

  test('does not convert post-fulfillment bookkeeping failure into a duplicate-inducing error', async () => {
    checkoutBatchService.completeCheckoutBatch.mockRejectedValueOnce(new Error('db unavailable'));
    const res = makeRes();
    const next = jest.fn();
    checkoutBatchResponseLifecycle({}, res, next);

    await res.json({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });

    expect(res.statusCode).toBe(200);
    expect(res.sent).toEqual({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });
  });

  test('ignores failed responses', async () => {
    const res = makeRes();
    res.statusCode = 503;
    const next = jest.fn();
    checkoutBatchResponseLifecycle({}, res, next);

    await res.json({ paymentIntentId: 'wallet_batch-1', isWalletOnly: true });

    expect(checkoutBatchService.attachPaymentIntent).not.toHaveBeenCalled();
    expect(checkoutBatchService.completeCheckoutBatch).not.toHaveBeenCalled();
  });
});
