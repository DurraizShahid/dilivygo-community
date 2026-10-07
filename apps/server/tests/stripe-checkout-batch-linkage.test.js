'use strict';

const mockStripeCreate = jest.fn();
const mockStripeCancel = jest.fn();
const mockStripeRetrieve = jest.fn();
const mockStripeClient = {
  paymentIntents: {
    create: mockStripeCreate,
    cancel: mockStripeCancel,
    retrieve: mockStripeRetrieve,
  },
  webhooks: { constructEvent: jest.fn() },
  refunds: { create: jest.fn() },
  transfers: { create: jest.fn(), createReversal: jest.fn() },
  accounts: { create: jest.fn(), retrieve: jest.fn() },
  accountLinks: { create: jest.fn() },
};

jest.mock('stripe', () => jest.fn(() => mockStripeClient));

jest.mock('../config', () => ({
  isProd: false,
  stripe: {
    enabled: true,
    secretKey: 'sk_test_fake',
    webhookSecret: 'whsec_fake',
  },
}));

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn(),
}));

jest.mock('../services/checkout-batch.service', () => ({
  attachPaymentIntent: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const platformSettings = require('../models/platform-settings.model');
const checkoutBatchService = require('../services/checkout-batch.service');
const { createPaymentIntent } = require('../services/stripe.service');

describe('Stripe checkout batch linkage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformSettings.get.mockResolvedValue('false');
    checkoutBatchService.attachPaymentIntent.mockResolvedValue({ id: 'batch-1' });
    mockStripeCreate.mockResolvedValue({ id: 'pi_real_1', client_secret: 'secret_1' });
    mockStripeCancel.mockResolvedValue({ id: 'pi_real_1', status: 'canceled' });
  });

  test('links the durable checkout batch before returning a real client secret', async () => {
    const result = await createPaymentIntent(2500, 'usd', { checkoutBatchId: 'batch-1' });

    expect(mockStripeCreate).toHaveBeenCalledTimes(1);
    expect(checkoutBatchService.attachPaymentIntent).toHaveBeenCalledWith('batch-1', 'pi_real_1');
    expect(result).toEqual(expect.objectContaining({
      clientSecret: 'secret_1',
      paymentIntentId: 'pi_real_1',
      isDummy: false,
    }));
    expect(result.__checkoutBatchId).toBe('batch-1');
    expect(Object.keys(result)).not.toContain('__checkoutBatchId');
  });

  test('fails closed and attempts cancellation when durable linkage cannot be persisted', async () => {
    checkoutBatchService.attachPaymentIntent.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(
      createPaymentIntent(2500, 'usd', { checkoutBatchId: 'batch-1' }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_BATCH_PAYMENT_LINK_FAILED' });

    expect(mockStripeCancel).toHaveBeenCalledWith(
      'pi_real_1',
      {},
      { idempotencyKey: 'checkout_batch_link_failed:pi_real_1' },
    );
  });

  test('links demo payment ids too so immediate reconciliation has an owner', async () => {
    platformSettings.get.mockResolvedValueOnce('true');

    const result = await createPaymentIntent(1200, 'usd', { checkoutBatchId: 'batch-demo' });

    expect(mockStripeCreate).not.toHaveBeenCalled();
    expect(result.isDummy).toBe(true);
    expect(result.paymentIntentId).toMatch(/^pi_dummy_/);
    expect(checkoutBatchService.attachPaymentIntent).toHaveBeenCalledWith(
      'batch-demo',
      result.paymentIntentId,
    );
    expect(result.__checkoutBatchId).toBe('batch-demo');
  });
});
