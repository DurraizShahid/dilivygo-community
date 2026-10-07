'use strict';

/**
 * BullMQ requires its own ioredis instance — the defaults differ from the
 * general-purpose `lib/redis.js` client in two important ways:
 *
 *   1. `maxRetriesPerRequest: null`  — BullMQ workers must block indefinitely
 *      on `BRPOPLPUSH`. Any other value crashes the worker under idle load.
 *   2. `enableReadyCheck: false`      — recommended by the BullMQ docs so
 *      blocking commands don't race against the ready-check on reconnect.
 *
 * Both are REQUIRED by `Worker`/`QueueEvents`; `Queue` producers tolerate
 * either setting. We use one factory for every BullMQ role so the connection
 * pool on Railway/Redis Cloud stays predictable (one ioredis per Queue /
 * Worker pair, not one per publish).
 */

const config = require('../config');
const logger = require('./logger');

let IORedis = null;

function getIORedis() {
  if (!IORedis) IORedis = require('ioredis');
  return IORedis;
}

/**
 * Create a new ioredis connection pre-configured for BullMQ.
 *
 * @param {object} [options]
 * @param {string} [options.label] — logged tag for reconnect diagnostics
 * @returns {import('ioredis').Redis | null} null when REDIS_URL is missing.
 */
function createBullConnection({ label = 'bull' } = {}) {
  const url = config.redis.url;
  if (!url) return null;

  const Redis = getIORedis();
  const conn = new Redis(url, {
    family: 0, // Railway private networking: dual-stack (IPv4+IPv6)
    maxRetriesPerRequest: null, // REQUIRED by BullMQ workers
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error(`BullMQ Redis (${label}): too many reconnection attempts, giving up`);
        return null;
      }
      return Math.min(times * 200, 3000);
    },
    reconnectOnError: (err) => {
      logger.warn(`BullMQ Redis (${label}) reconnect on error`, { message: err.message });
      return true;
    },
  });

  conn.on('connect', () => logger.info(`BullMQ Redis (${label}): connected`));
  conn.on('error', (err) =>
    logger.error(`BullMQ Redis (${label}) error`, { message: err.message })
  );
  conn.on('close', () => logger.warn(`BullMQ Redis (${label}): connection closed`));

  return conn;
}

function isBullMqEnabled() {
  return Boolean(config.redis.url) && config.jobs.runner !== 'cron' && config.jobs.runner !== 'off';
}

module.exports = { createBullConnection, isBullMqEnabled };
