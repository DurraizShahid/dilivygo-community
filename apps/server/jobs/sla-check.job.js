'use strict';

const cron = require('node-cron');
const { supabaseFetch } = require('../lib/supabase');
const orderModel = require('../models/order.model');
const notificationService = require('../services/notification.service');
const wsServer = require('../websocket/ws-server');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

/**
 * Every 60 seconds: find orders whose SLA deadline has passed but
 * have not yet been marked as breached — mark them and notify.
 */
async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock ? { acquired: true } : await acquireLock('lock:job:sla-check', 55_000);
  if (!lock) return { processed: 0, skipped: true };
  try {
    const now = new Date().toISOString();
    const breached = await supabaseFetch(
      `/rest/v1/orders?sla_deadline=lt.${encodeURIComponent(now)}&sla_breached=eq.false&status=in.(accepted,preparing)&select=*`
    );

    if (!breached || breached.length === 0) return { processed: 0 };

    logger.info(`SLA check job: ${breached.length} order(s) breached deadline`);

    let processed = 0;
    for (const order of breached) {
      await orderModel.markSlaBreach(order.id);

      wsServer.broadcast(order.project_ref, {
        type: 'order:delayed',
        orderId: order.id,
        slaDeadline: order.sla_deadline,
        updatedAt: new Date().toISOString(),
      });

      if (order.customer_id) {
        await notificationService.notifyOrderDelayed(order, order.customer_id);
      }

      // Automation (Phase 24): delayed order.
      try {
        const { handleAutomationEvent } = require('../services/cx-automation.service');
        if (order.organization_id) {
          await handleAutomationEvent(String(order.organization_id), 'order.delayed', {
            orderId: order.id, customerId: order.customer_id || null,
            shopId: order.shop_id || null, slaDeadline: order.sla_deadline || null,
          }, { eventKey: `order-delayed:${order.id}` });
        }
      } catch {}

      logger.info('SLA breached for order', { orderId: order.id });
      processed += 1;
    }
    return { processed };
  } catch (err) {
    logger.error('SLA check job error', { error: err.message });
    throw err;
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '* * * * *' };

function start() {
  const task = cron.schedule('* * * * *', () => runOnce().catch(() => {}));
  logger.info('Background job started: sla-check (every 60s)');
  return task;
}

module.exports = { start, runOnce, schedule, name: 'sla-check' };
