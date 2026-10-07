'use strict';

/**
 * Phase 03 — canonical payment capability (Stripe reference implementation).
 *
 * The Stripe SDK itself is mocked via jest.mock('stripe'): no network, no
 * credentials. The real stripe.service.js + payment-provider.js run on top of
 * the mock so idempotency-key plumbing, status normalization, and ledger
 * writes are exercised for real. Money is asserted as integer cents; secrets
 * must never reach logs.
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_phase03_capability';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_phase03_capability';

const mockPICreate = jest.fn();
const mockPIRetrieve = jest.fn();
const mockPICancel = jest.fn();
const mockPICapture = jest.fn();
const mockRefundCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
  paymentIntents: {
    create: (...args) => mockPICreate(...args),
    retrieve: (...args) => mockPIRetrieve(...args),
    cancel: (...args) => mockPICancel(...args),
    capture: (...args) => mockPICapture(...args),
  },
  refunds: {
    create: (...args) => mockRefundCreate(...args),
  },
  webhooks: {
    constructEvent: (...args) => mockConstructEvent(...args),
  },
})));

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
  SupabaseError: class SupabaseError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('../models/platform-settings.model', () => ({
  get: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const db = require('../lib/supabase');
const logger = require('../lib/logger');
const provider = require('../services/payment-provider');

function loggedBlobs() {
  const blobs = [];
  for (const fn of [logger.info, logger.warn, logger.error]) {
    for (const call of fn.mock.calls) {
      blobs.push(JSON.stringify(call));
    }
  }
  return blobs.join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  db.insert.mockResolvedValue({});
  db.update.mockResolvedValue({});
  mockConstructEvent.mockReturnValue({ id: 'evt_test', type: 'payment_intent.succeeded' });
});

describe('normalizePaymentStatus', () => {
  test.each([
    ['requires_payment_method', 'pending'],
    ['requires_confirmation', 'pending'],
    ['requires_capture', 'pending'],
    ['processing', 'pending'],
    ['pending', 'pending'],
    ['requires_action', 'requires_action'],
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'cancelled'],
    ['cancelled', 'cancelled'],
    ['refunded', 'refunded'],
  ])('%s -> %s', (input, expected) => {
    expect(provider.normalizePaymentStatus(input)).toBe(expected);
  });

  test('unknown / null / undefined map to unknown and never throw', () => {
    expect(provider.normalizePaymentStatus('some_future_state')).toBe('unknown');
    expect(provider.normalizePaymentStatus(null)).toBe('unknown');
    expect(provider.normalizePaymentStatus(undefined)).toBe('unknown');
    expect(provider.normalizePaymentStatus('')).toBe('unknown');
  });
});

describe('createPayment', () => {
  test('creates a PaymentIntent with a derived idempotency key', async () => {
    mockPICreate.mockResolvedValue({ id: 'pi_test_123', client_secret: 'secret_x', status: 'requires_payment_method' });

    const result = await provider.createPayment({
      organizationId: 'org-1',
      orderId: 'order-123',
      amountCents: 1500,
      currency: 'GBP',
    });

    expect(result.providerPaymentId).toBe('pi_test_123');
    expect(result.status).toBe('pending');
    expect(mockPICreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, currency: 'gbp' }),
      { idempotencyKey: 'order-123:payment_create' },
    );
    // Operation ledger write: integer cents, canonical currency, no floats.
    expect(db.insert).toHaveBeenCalledWith('payment_operations', [
      expect.objectContaining({
        purpose: 'order_payment',
        provider: 'stripe',
        provider_payment_id: 'pi_test_123',
        idempotency_key: 'order-123:payment_create',
        amount_cents: 1500,
        currency: 'gbp',
      }),
    ]);
  });

  test('explicit idempotencyKey wins over derivation (retry-safe)', async () => {
    mockPICreate.mockResolvedValue({ id: 'pi_retry', status: 'requires_payment_method' });

    await provider.createPayment({
      orderId: 'order-123',
      amountCents: 1500,
      currency: 'gbp',
      idempotencyKey: 'custom-key-1',
    });

    expect(mockPICreate).toHaveBeenCalledWith(
      expect.anything(),
      { idempotencyKey: 'custom-key-1' },
    );
  });

  test.each([[1500.5], [0], [-100], ['1500'], [NaN]])(
    'rejects invalid amountCents=%p with { statusCode, code }',
    async (amountCents) => {
      await expect(provider.createPayment({ orderId: 'o1', amountCents, currency: 'gbp' }))
        .rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_INVALID_AMOUNT' });
      expect(mockPICreate).not.toHaveBeenCalled();
    },
  );

  test('rejects empty orderId and invalid currency', async () => {
    await expect(provider.createPayment({ orderId: '  ', amountCents: 100, currency: 'gbp' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_INVALID_ORDER' });
    await expect(provider.createPayment({ orderId: 'o1', amountCents: 100, currency: 'xx' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_INVALID_CURRENCY' });
    expect(mockPICreate).not.toHaveBeenCalled();
  });

  test('duplicate ledger insert (409) still resolves — retries are safe', async () => {
    mockPICreate.mockResolvedValue({ id: 'pi_dup', status: 'requires_payment_method' });
    db.insert.mockRejectedValueOnce({ status: 409, message: 'duplicate key' });

    const result = await provider.createPayment({ orderId: 'o-dup', amountCents: 200, currency: 'gbp' });

    expect(result.providerPaymentId).toBe('pi_dup');
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('duplicate ignored'),
      expect.anything(),
    );
  });

  test('never logs secrets or client secrets', async () => {
    mockPICreate.mockResolvedValue({ id: 'pi_s', client_secret: 'secret_should_not_log', status: 'requires_payment_method' });

    await provider.createPayment({ orderId: 'o-s', amountCents: 200, currency: 'gbp' });

    const blobs = loggedBlobs();
    expect(blobs).not.toContain('sk_test_phase03_capability');
    expect(blobs).not.toContain('secret_should_not_log');
  });
});

describe('queryPayment', () => {
  test('returns normalized status with raw provider state', async () => {
    mockPIRetrieve.mockResolvedValue({ id: 'pi_q', status: 'requires_action' });

    const result = await provider.queryPayment({ organizationId: 'org-1', providerPaymentId: 'pi_q' });

    expect(result.status).toBe('requires_action');
    expect(result.raw).toMatchObject({ id: 'pi_q' });
  });

  test('synthetic wallet/dummy ids short-circuit without a Stripe call', async () => {
    for (const synthetic of ['wallet_batch-1', 'pi_dummy_123']) {
      const result = await provider.queryPayment({ providerPaymentId: synthetic });
      expect(result.status).toBe('succeeded');
      expect(result.raw).toMatchObject({ synthetic: true });
    }
    expect(mockPIRetrieve).not.toHaveBeenCalled();
  });

  test('unresolvable intent throws { statusCode, code }', async () => {
    mockPIRetrieve.mockResolvedValue(null);

    await expect(provider.queryPayment({ providerPaymentId: 'pi_missing' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  });
});

describe('capturePayment', () => {
  test('captures with derived key and normalizes the result', async () => {
    mockPICapture.mockResolvedValue({ id: 'pi_cap', status: 'succeeded' });

    const result = await provider.capturePayment({ organizationId: 'org-1', providerPaymentId: 'pi_cap' });

    expect(mockPICapture).toHaveBeenCalledWith('pi_cap', {}, { idempotencyKey: 'pi_cap:payment_capture' });
    expect(result).toMatchObject({ providerPaymentId: 'pi_cap', status: 'succeeded' });
  });

  test('synthetic ids short-circuit without a Stripe call', async () => {
    const result = await provider.capturePayment({ providerPaymentId: 'wallet_x' });
    expect(result.status).toBe('succeeded');
    expect(mockPICapture).not.toHaveBeenCalled();
  });
});

describe('cancelPayment', () => {
  test('cancels with derived key and normalizes canceled -> cancelled', async () => {
    mockPICancel.mockResolvedValue({ id: 'pi_cx', status: 'canceled' });

    const result = await provider.cancelPayment({ organizationId: 'org-1', providerPaymentId: 'pi_cx' });

    expect(mockPICancel).toHaveBeenCalledWith('pi_cx', {}, { idempotencyKey: 'pi_cx:payment_cancel' });
    expect(result).toMatchObject({ providerPaymentId: 'pi_cx', status: 'cancelled' });
  });
});

describe('refundPayment', () => {
  test('full refund uses the full-refund derived key', async () => {
    mockRefundCreate.mockResolvedValue({ id: 're_full', status: 'succeeded', currency: 'gbp' });

    const result = await provider.refundPayment({ organizationId: 'org-1', providerPaymentId: 'pi_r' });

    expect(mockRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_r' }),
      { idempotencyKey: 'pi_r:payment_refund_full' },
    );
    // A succeeded Stripe refund means funds returned: 'refunded', not 'succeeded'.
    expect(result).toMatchObject({ providerPaymentId: 're_full', status: 'refunded' });
  });

  test('partial refund derives the key from the integer-cent amount', async () => {
    mockRefundCreate.mockResolvedValue({ id: 're_part', status: 'succeeded', currency: 'gbp' });

    await provider.refundPayment({ providerPaymentId: 'pi_r', amountCents: 400 });

    expect(mockRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_r', amount: 400 }),
      { idempotencyKey: 'pi_r:payment_refund:400' },
    );
  });

  test('synthetic ids are rejected (wallet refunds use the wallet ledger)', async () => {
    await expect(provider.refundPayment({ providerPaymentId: 'wallet_x', amountCents: 100 }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_NOT_REFUNDABLE_VIA_PROVIDER' });
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });
});

describe('verifyWebhookSignature', () => {
  test('true on valid signature, false on invalid, never throws', () => {
    expect(provider.verifyWebhookSignature('raw-body', 'sig')).toBe(true);

    mockConstructEvent.mockImplementationOnce(() => { throw new Error('bad sig'); });
    expect(provider.verifyWebhookSignature('raw-body', 'sig')).toBe(false);

    expect(provider.verifyWebhookSignature(null, 'sig')).toBe(false);
    expect(provider.verifyWebhookSignature('raw-body', null)).toBe(false);
  });

  test('never logs the signature material', () => {
    provider.verifyWebhookSignature('raw-body', 'super-secret-sig-value');
    expect(loggedBlobs()).not.toContain('super-secret-sig-value');
  });
});
