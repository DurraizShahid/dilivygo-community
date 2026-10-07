'use strict';

const cron = require('node-cron');
const orderModel = require('../models/order.model');
const wsServer = require('../websocket/ws-server');
const notificationService = require('../services/notification.service');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

/**
 * Every 60 seconds: transition due scheduled orders to placed using a
 * compare-and-set update. If a customer cancels after the due-order query but
 * before this write, the CAS returns no row and the cancellation wins.
 */
async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock ? { acquired: true } : await acquireLock('lock:job:scheduled-orders', 55_000);
  if (!lock) return { processed: 0, skipped: true };
  try {
    const dueOrders = await orderModel.getScheduledDue();
    if (!dueOrders || dueOrders.length === 0) return { processed: 0 };

    logger.info(`Scheduled orders job: processing ${dueOrders.length} due order(s)`);

    let processed = 0;
    for (const order of dueOrders) {
      const placedOrder = await orderModel.compareAndSetStatus(order.id, 'scheduled', 'placed');
      if (!placedOrder) {
        logger.info('Scheduled order changed concurrently; leaving newer state untouched', {
          orderId: order.id,
        });
        continue;
      }

      wsServer.broadcast(order.project_ref, {
        type: 'order:status_changed',
        orderId: order.id,
        status: 'placed',
        previousStatus: 'scheduled',
        updatedAt: placedOrder.updated_at || new Date().toISOString(),
      });

      notificationService.notifyShopStaffNewOrder(placedOrder).catch((err) =>
        logger.error('Vendor new-order notification failed', { orderId: order.id, error: err.message })
      );

      logger.info('Scheduled order transitioned to placed', { orderId: order.id });
      processed += 1;
    }
    return { processed };
  } catch (err) {
    logger.error('Scheduled orders job error', { error: err.message });
    throw err;
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '* * * * *' };

function start() {
  const task = cron.schedule('* * * * *', () => runOnce().catch(() => {}));
  logger.info('Background job started: scheduled-orders (every 60s)');
  return task;
}

module.exports = { start, runOnce, schedule, name: 'scheduled-orders' };
