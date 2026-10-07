'use strict';

const logger = require('../lib/logger');

/**
 * Redis-backed session/cache store using ioredis.
 *
 * Transient connectivity failures (Redis restart, network blips, slow reconnect)
 * must never bubble up as 5xx from unrelated request paths — most callers here
 * (`parseSession`, OTP rate-limits, rider-location cache) can safely treat
 * "store temporarily unavailable" as "no entry". We log and swallow the error
 * instead so the request can continue.
 *
 * Known transient ioredis errors:
 *   - "Connection is closed." (CONNECTION_CLOSED_ERROR_MSG)
 *   - "Stream isn't writeable and enableOfflineQueue options is false"
 *   - Any `err.code` starting with `ECONN`/`ETIMEDOUT`/`EPIPE`
 */
function isTransientRedisError(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EPIPE') {
    return true;
  }
  const message = String(err.message || '');
  return (
    message.includes('Connection is closed') ||
    message.includes("Stream isn't writeable") ||
    message.includes('Connection is already closed')
  );
}

class RedisSessionStore {
  constructor(redisClient) {
    this._client = redisClient;
  }

  async get(id) {
    let value;
    try {
      value = await this._client.get(id);
    } catch (err) {
      if (isTransientRedisError(err)) {
        logger.warn('Redis get failed (transient) — treating as miss', {
          key: id,
          message: err.message,
        });
        return null;
      }
      throw err;
    }
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async set(id, data, ttlSeconds) {
    const serialised = JSON.stringify(data);
    try {
      if (ttlSeconds) {
        await this._client.setex(id, ttlSeconds, serialised);
      } else {
        await this._client.set(id, serialised);
      }
    } catch (err) {
      if (isTransientRedisError(err)) {
        logger.warn('Redis set failed (transient) — dropping write', {
          key: id,
          message: err.message,
        });
        return;
      }
      throw err;
    }
  }

  async delete(id) {
    try {
      await this._client.del(id);
    } catch (err) {
      if (isTransientRedisError(err)) {
        logger.warn('Redis delete failed (transient) — ignoring', {
          key: id,
          message: err.message,
        });
        return;
      }
      throw err;
    }
  }
}

module.exports = RedisSessionStore;
module.exports.isTransientRedisError = isTransientRedisError;
