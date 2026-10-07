'use strict';

/**
 * Phase 03 — payment-reconciliation job.
 *
 * Conservative-by-design contract: the job may auto-repair ONLY the
 * provably-safe case (internal pending/requires_action + Stripe canceled or
 * failed -> mark the LEDGER row; orders/wallet/transfers are never touched).
 * Every other discrepancy is flagged via structured logs for operator review.
 */

const mockQueryPayment = jest.fn();

jest.mock('../services/payment-provider', () => ({
  queryPayment: (...args) => mockQueryPayment(...args),
}));

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

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const db = require('../lib/supabase');
const logger = require('../lib/logger');
const job = require('../jobs/payment-reconciliation.job');

function opRow(overrides = {}) {
  return {
    id: 'op-1',
    organization_id: 'org-1',
    order_id: null,
    dilivygo_reference: 'order-123',
    purpose: 'order_payment',
    provider: 'stripe',
    provider_payment_id: 'pi_test_123',
    idempotency_key: 'order-123:payment_create',
    status: 'pending',
    raw_status: 'requires_payment_method',
    webhook_event_id: null,
    amount_cents: 1500,
    currency: 'gbp',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.select.mockResolvedValue([]);
  db.update.mockResolvedValue({});
});

describe('safeRepairFor', () => {
  test('pending + canceled/failed are the only repairs', () => {
    expect(job.safeRepairFor('pending', 'cancelled')).toBe('cancelled');
    expect(job.safeRepairFor('pending', 'failed')).toBe('failed');
    expect(job.safeRepairFor('requires_action', 'cancelled')).toBe('cancelled');
    expect(job.safeRepairFor('requires_action', 'failed')).toBe('failed');
  });

  test('everything else returns null (flag, do not repair)', () => {
    expect(job.safeRepairFor('pending', 'succeeded')).toBeNull();
    expect(job.safeRepairFor('pending', 'unknown')).toBeNull();
    expect(job.safeRepairFor('pending', 'pending')).toBeNull();
    expect(job.safeRepairFor('succeeded', 'cancelled')).toBeNull();
    expect(job.safeRepairFor('failed', 'cancelled')).toBeNull();
    expect(job.safeRepairFor('refunded', 'succeeded')).toBeNull();
  });
});

describe('reconcileOperationRow', () => {
  test('safe-repair case: internal pending + Stripe canceled -> mark cancelled', async () => {
    mockQueryPayment.mockResolvedValue({ status: 'cancelled', raw: { id: 'pi_test_123', status: 'canceled' } });

    const outcome = await job.reconcileOperationRow(opRow());

    expect(outcome).toBe('repaired');
    expect(db.update).toHaveBeenCalledWith(
      'payment_operations',
      expect.objectContaining({ status: 'cancelled' }),
      { id: 'op-1' },
    );
  });

  test('safe-repair case: internal requires_action + Stripe failed -> mark failed', async () => {
    mockQueryPayment.mockResolvedValue({ status: 'failed', raw: { id: 'pi_x', status: 'failed' } });

    const outcome = await job.reconcileOperationRow(opRow({ status: 'requires_action' }));

    expect(outcome).toBe('repaired');
    expect(db.update).toHaveBeenCalledWith(
      'payment_operations',
      expect.objectContaining({ status: 'failed' }),
      { id: 'op-1' },
    );
  });

  test('mismatch flagging: Stripe succeeded + internal pending -> flag, no repair', async () => {
    mockQueryPayment.mockResolvedValue({ status: 'succeeded', raw: { id: 'pi_test_123', status: 'succeeded' } });

    const outcome = await job.reconcileOperationRow(opRow());

    expect(outcome).toBe('flagged_succeeded_unsettled');
    expect(db.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('flagged'),
      expect.objectContaining({
        providerPaymentId: 'pi_test_123',
        idempotencyKey: 'order-123:payment_create',
      }),
    );
  });

  test('no false repair: already-terminal internal rows are never rewritten', async () => {
    mockQueryPayment.mockResolvedValue({ status: 'cancelled', raw: { id: 'pi_x', status: 'canceled' } });

    const outcome = await job.reconcileOperationRow(opRow({ status: 'succeeded' }));

    expect(outcome).toBe('ok');
    expect(db.update).not.toHaveBeenCalled();
  });

  test('synthetic ids are skipped without a provider call', async () => {
    const outcome = await job.reconcileOperationRow(opRow({ provider_payment_id: 'wallet_batch-9' }));

    expect(outcome).toBe('skipped_synthetic');
    expect(mockQueryPayment).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  test('provider-unavailable degrades the row without flag noise', async () => {
    const err = new Error('Stripe is not configured');
    err.statusCode = 503;
    err.code = 'PAYMENT_PROVIDER_UNAVAILABLE';
    mockQueryPayment.mockRejectedValue(err);

    const outcome = await job.reconcileOperationRow(opRow());

    expect(outcome).toBe('skipped_provider_unavailable');
    expect(db.update).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('runOnce', () => {
  test('repairs stale canceled intents and verifies recent paid orders', async () => {
    const staleOp = opRow();
    const paidOrder = {
      id: 'order-9',
      organization_id: 'org-1',
      project_ref: 'ws-1',
      total_cents: 1500,
      currency: 'gbp',
      payment_intent_id: 'pi_paid_9',
      payment_status: 'paid',
      created_at: new Date().toISOString(),
    };
    db.select
      .mockResolvedValueOnce([staleOp])
      .mockResolvedValueOnce([paidOrder]);
    mockQueryPayment
      .mockResolvedValueOnce({ status: 'cancelled', raw: { id: 'pi_test_123', status: 'canceled' } })
      .mockResolvedValueOnce({ status: 'succeeded', raw: { id: 'pi_paid_9', status: 'succeeded' } });

    const summary = await job.runOnce({ skipLock: true });

    expect(summary.operationsChecked).toBe(1);
    expect(summary.ordersChecked).toBe(1);
    expect(summary.outcomes.repaired).toBe(1);
    expect(summary.outcomes.ok).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  test('flags paid orders whose Stripe intent is terminal-unpaid (never repairs orders)', async () => {
    const paidOrder = {
      id: 'order-10',
      organization_id: 'org-1',
      project_ref: 'ws-1',
      total_cents: 900,
      currency: 'gbp',
      payment_intent_id: 'pi_bad_10',
      payment_status: 'paid',
      created_at: new Date().toISOString(),
    };
    db.select
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([paidOrder]);
    mockQueryPayment.mockResolvedValueOnce({ status: 'failed', raw: { id: 'pi_bad_10', status: 'failed' } });

    const summary = await job.runOnce({ skipLock: true });

    expect(summary.outcomes.flagged_paid_terminal_unpaid).toBe(1);
    expect(db.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('flagged'),
      expect.objectContaining({ orderId: 'order-10', providerPaymentId: 'pi_bad_10' }),
    );
  });

  test('missing payment_operations table (migration not applied) degrades without throwing', async () => {
    db.select
      .mockRejectedValueOnce(new Error('relation "payment_operations" does not exist'))
      .mockResolvedValueOnce([]);

    const summary = await job.runOnce({ skipLock: true });

    expect(summary.degraded).toBe(true);
    expect(summary.operationsChecked).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unreadable'),
      expect.anything(),
    );
  });
});
