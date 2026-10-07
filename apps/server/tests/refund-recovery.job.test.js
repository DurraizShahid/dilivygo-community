'use strict';

jest.mock('../services/refund-operation.service', () => ({
  listPending: jest.fn(),
  markManualReview: jest.fn(),
}));

jest.mock('../services/order-refund.service', () => ({
  executeOrderRefund: jest.fn(),
}));

jest.mock('../models/order.model', () => ({
  findWithItems: jest.fn(),
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

const refundOperations = require('../services/refund-operation.service');
const { executeOrderRefund } = require('../services/order-refund.service');
const orderModel = require('../models/order.model');
const { acquireLock, releaseLock } = require('../lib/lock');
const { recoverOperation, runOnce } = require('../jobs/refund-recovery.job');

const operation = {
  id: 'refund-op-1',
  order_id: 'order-1',
  requested_amount_cents: 2500,
  reason: 'cancelled',
  attempts: 1,
  status: 'pending',
};

const order = {
  id: 'order-1',
  payment_status: 'paid',
  total_cents: 2500,
};

describe('refund recovery job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refundOperations.listPending.mockResolvedValue([]);
    refundOperations.markManualReview.mockResolvedValue(undefined);
    orderModel.findWithItems.mockResolvedValue({ ...order });
    executeOrderRefund.mockResolvedValue({ refundAmount: 2500 });
    acquireLock.mockResolvedValue({ key: 'lock:job:refund-recovery', backend: 'redis' });
    releaseLock.mockResolvedValue(undefined);
  });

  test('reuses the canonical refund service for pending operations', async () => {
    const result = await recoverOperation(operation);

    expect(result).toBe('completed');
    expect(executeOrderRefund).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      { amountCents: 2500, reason: 'cancelled' },
      expect.objectContaining({ orderId: 'order-1', recovery: true }),
    );
  });

  test('moves an orphaned refund operation to manual review', async () => {
    orderModel.findWithItems.mockResolvedValueOnce(null);

    const result = await recoverOperation(operation);

    expect(result).toBe('manual_review_missing_order');
    expect(refundOperations.markManualReview).toHaveBeenCalledWith(
      operation,
      'Refund recovery order no longer exists',
    );
    expect(executeOrderRefund).not.toHaveBeenCalled();
  });

  test('treats an actively-held per-order refund lock as busy, not failed', async () => {
    const err = new Error('A refund for this order is already being processed');
    err.statusCode = 409;
    executeOrderRefund.mockRejectedValueOnce(err);

    await expect(recoverOperation(operation)).resolves.toBe('busy');
  });

  test('leaves transient failures pending for the next pass', async () => {
    executeOrderRefund.mockRejectedValueOnce(new Error('stripe timeout'));
    await expect(recoverOperation(operation)).resolves.toBe('pending_error');
  });

  test('runs pending operations under a distributed job lock', async () => {
    refundOperations.listPending.mockResolvedValueOnce([operation]);

    const result = await runOnce();

    expect(refundOperations.listPending).toHaveBeenCalledWith({ limit: 100, minAgeMs: 60_000 });
    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      outcomes: expect.objectContaining({ completed: 1 }),
    }));
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
