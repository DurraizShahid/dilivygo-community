'use strict';

const config = require('../config');
const logger = require('./logger');

let redisClient = null;
const fatalHandlers = new Set();
let terminalFailureNotified = false;

function notifyFatal(err) {
  if (terminalFailureNotified) return;
  terminalFailureNotified = true;
  for (const handler of fatalHandlers) {
    try {
      handler(err);
    } catch (handlerErr) {
      logger.error('Redis fatal handler failed', { message: handlerErr.message });
    }
  }
}

function onRedisFatal(handler) {
  if (typeof handler !== 'function') return () => {};
  fatalHandlers.add(handler);
  return () => fatalHandlers.delete(handler);
}

function getRedis() {
  if (redisClient) return redisClient;

  if (!config.redis.url) {
    logger.warn('REDIS_URL not set — Redis client unavailable. Session store will use in-memory fallback.');
    return null;
  }

  const Redis = require('ioredis');

  redisClient = new Redis(config.redis.url, {
    // Railway private networking (and dual-stack hosts): prefer both IPv4 and IPv6.
    // https://docs.railway.com/networking/private-networking/library-configuration
    family: 0,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.error('Redis: too many reconnection attempts, giving up');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    reconnectOnError: (err) => {
      logger.warn('Redis reconnect on error', { message: err.message });
      return true;
    },
  });

  redisClient.on('connect', () => {
    terminalFailureNotified = false;
    logger.info('Redis: connected');
  });
  redisClient.on('error', (err) => logger.error('Redis error', { message: err.message }));
  redisClient.on('close', () => logger.warn('Redis: connection closed'));
  // ioredis emits `end` after retryStrategy returns null. This is distinct from
  // a transient close/reconnecting cycle and means the shared coordination
  // client will not recover on its own.
  redisClient.on('end', () => {
    const err = new Error('Redis connection terminated after exhausting reconnect attempts');
    logger.error(err.message);
    notifyFatal(err);
  });

  return redisClient;
}

module.exports = { getRedis, onRedisFatal };
