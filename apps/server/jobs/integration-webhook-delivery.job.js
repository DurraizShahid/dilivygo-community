'use strict';

const cron = require('node-cron');
const logger = require('../lib/logger');
const { acquireLock, releaseLock } = require('../lib/lock');
const webhookService = require('../services/integration-webhook.service');

async function runOnce({ skipLock = false } = {}) {
  const lock = skipLock ? { acquired: true } : await acquireLock('lock:job:integration-webhook-delivery', 55_000);
  if (!lock) return { skipped: true };
  try {
    const result = await webhookService.deliverDue({ limit: 100 });
    if (result.processed) logger.info('Integration webhooks processed', result);
    return result;
  } catch (err) {
    logger.error('Integration webhook delivery job failed', { error: err.message });
    throw err;
  } finally {
    if (!skipLock) await releaseLock(lock);
  }
}

const schedule = { pattern: '* * * * *', tz: 'UTC' };

function start() {
  const task = cron.schedule('* * * * *', () => runOnce().catch(() => {}));
  logger.info('Background job started: integration-webhook-delivery (every minute)');
  return task;
}

module.exports = { start, runOnce, schedule, name: 'integration-webhook-delivery' };
