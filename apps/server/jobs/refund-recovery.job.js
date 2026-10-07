'use strict';

const cron = require('node-cron');
const refundOperations = require('../services/refund-operation.service');
const { executeOrderRefund } = require('../services/order-refund.service');
const orderModel = require('../models/order.model');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

async function recoverOperation(operation) {
  const order = await orderModel.findWithItems(operation.order_id);
  if (!order) {
    await refundOperations.markManualReview(operation, 'Refund recovery order no longer exists');
    return 'manual_review_missing_order';
  }

  try {
    await executeOrderRefund(
      order,
      {
        amountCents: Number(operation.requested_amount_cents),
        reason: operation.reason || 'Refund recovery',
      },
      {
        userId: null,
        ip: null,
        orderId: operation.order_id,
        recovery: true,
      },
    );
    return 'completed';
  } catch (err) {
    if (err?.statusCode === 409 && /already being processed/i.test(String(err.message || ''))) {
      return 'busy';
    }
    logger.warn('Refund recovery attempt remains pending', {
      operationId: operation.id,
      orderId: operation.order_id,
      attempts: operation.attempts || 0,
      error: err.message,
    });
    return 'pending_error';
  }
}

async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock
    ? { acquired: true }
    : await acquireLock('lock:job:refund-recovery', 4 * 60_000);
  if (!lock) return { skipped: true, processed: 0 };

  try {
    const operations = await refundOperations.listPending({ limit: 100, minAgeMs: 60_000 });
    const outcomes = {};

    for (const operation of operations || []) {
      try {
        const outcome = await recoverOperation(operation);
        outcomes[outcome] = (outcomes[outcome] || 0) + 1;
      } catch (err) {
        outcomes.failed = (outcomes.failed || 0) + 1;
        logger.error('Refund recovery worker failed for operation', {
          operationId: operation?.id || null,
          orderId: operation?.order_id || null,
          error: err.message,
        });
      }
    }

    if (operations?.length) {
      logger.info('Refund recovery pass complete', {
        processed: operations.length,
        outcomes,
      });
    }
    return { processed: operations?.length || 0, outcomes };
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '*/5 * * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule('*/5 * * * *', () => runOnce().catch((err) => {
    logger.error('Refund recovery job error', { error: err.message });
  }));
  logger.info('Background job started: refund-recovery (every 5 minutes)');
  return task;
}

module.exports = {
  start,
  runOnce,
  recoverOperation,
  schedule,
  name: 'refund-recovery',
};
