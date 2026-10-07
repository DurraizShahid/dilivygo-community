'use strict';

const { getRedis } = require('./redis');
const { opaqueId } = require('./opaque-id');
const logger = require('./logger');

// Fallback (dev-only) lock map
const memLocks = new Map(); // key -> { value, expiresAt }

function _pruneMem() {
  const now = Date.now();
  for (const [k, v] of memLocks.entries()) {
    if (v.expiresAt <= now) memLocks.delete(k);
  }
}

async function acquireLock(key, ttlMs = 30_000) {
  const redis = getRedis();
  const value = opaqueId();

  if (redis) {
    // SET key value NX PX ttl
    const ok = await redis.set(key, value, 'PX', ttlMs, 'NX');
    return ok ? { key, value, ttlMs, backend: 'redis' } : null;
  }

  _pruneMem();
  const existing = memLocks.get(key);
  if (existing && existing.expiresAt > Date.now()) return null;
  memLocks.set(key, { value, expiresAt: Date.now() + ttlMs });
  return { key, value, ttlMs, backend: 'memory' };
}

async function releaseLock(lock) {
  if (!lock) return;
  const redis = getRedis();

  try {
    if (redis && lock.backend === 'redis') {
      // Best-effort: only delete if value matches
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, lock.key, lock.value);
      return;
    }
    if (lock.backend === 'memory') {
      const existing = memLocks.get(lock.key);
      if (existing?.value === lock.value) memLocks.delete(lock.key);
    }
  } catch (err) {
    logger.warn('Failed to release lock', { key: lock.key, error: err.message });
  }
}

module.exports = { acquireLock, releaseLock };

