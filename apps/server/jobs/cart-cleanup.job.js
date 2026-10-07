'use strict';

const cron = require('node-cron');
const cartModel = require('../models/cart.model');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');

/**
 * Daily at 03:00 UTC: remove cart sessions older than 30 days.
 */
async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock ? { acquired: true } : await acquireLock('lock:job:cart-cleanup', 5 * 60_000);
  if (!lock) return { skipped: true };
  try {
    logger.info('Cart cleanup job: removing sessions older than 30 days');
    await cartModel.cleanOldSessions(30);
    logger.info('Cart cleanup job: complete');
    return { ok: true };
  } catch (err) {
    logger.error('Cart cleanup job error', { error: err.message });
    throw err;
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '0 3 * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule('0 3 * * *', () => runOnce().catch(() => {}));
  logger.info('Background job started: cart-cleanup (daily at 03:00 UTC)');
  return task;
}

module.exports = { start, runOnce, schedule, name: 'cart-cleanup' };
