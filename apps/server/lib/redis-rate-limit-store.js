'use strict';

const logger = require('./logger');
const { getRedis } = require('./redis');

let warned = false;

function createRedisRateLimitStore(prefix) {
  const redis = getRedis();
  if (!redis) {
    if (!warned) {
      warned = true;
      logger.warn('Redis rate limit store disabled (REDIS_URL not set)');
    }
    return null;
  }

  let windowMs = 60_000;

  const incrementScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

  function redisKey(key) {
    return `${prefix}:${key}`;
  }

  return {
    init: (options) => {
      windowMs = options.windowMs;
    },

    increment: async (key) => {
      const [totalHits, ttlMs] = await redis.eval(incrementScript, 1, redisKey(key), String(windowMs));
      const ttl = Number(ttlMs);
      const resetInMs = ttl > 0 ? ttl : windowMs;
      return {
        totalHits: Number(totalHits),
        resetTime: new Date(Date.now() + resetInMs),
      };
    },

    decrement: async (key) => {
      const value = await redis.decr(redisKey(key));
      if (Number(value) <= 0) await redis.del(redisKey(key));
    },

    resetKey: async (key) => {
      await redis.del(redisKey(key));
    },
  };
}

module.exports = { createRedisRateLimitStore };

