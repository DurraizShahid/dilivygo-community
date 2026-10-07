'use strict';

/**
 * Shared in-process LRU cache registry.
 *
 * Fronts the hottest Supabase read paths on the public-customer surface
 * (shop listing, menu catalog, theme, organization/workspace ref lookups,
 * platform + vendor settings) so a single Railway replica can absorb bursty
 * read traffic without fanning every request out to Supabase PostgREST.
 *
 * Design:
 *   - One named `LRUCache` per namespace with its own `max` + `ttl`.
 *   - `wrap(name, key, loader)` is the primary API: cache hit → return; miss
 *     → await `loader()`, store, return. `null` is treated as a real value
 *     (so "row not found" is memoised and doesn't re-query); `undefined` is
 *     treated as "do not cache" (loader declined).
 *   - `invalidate(name, key?)` drops a single key, or the whole cache when
 *     `key` is omitted. Mutation paths call this after a write.
 *   - `invalidateMany([{ name, key? }, …])` for fanned-out invalidations.
 *   - `stats()` returns hit/miss counters for observability / tests.
 *   - `CACHE_DISABLED=true` env var turns every `wrap()` into a passthrough
 *     (still honours invalidate calls). Useful for A/B comparison and
 *     emergency rollback without redeploying.
 *
 * The cache is intentionally in-process (no Redis pub/sub invalidation):
 *   - Railway currently deploys with `numReplicas = 1`.
 *   - 30-60s TTLs bound the staleness window if we ever scale horizontally
 *     before wiring a cross-replica invalidation channel.
 */

const { LRUCache } = require('lru-cache');
const logger = require('./logger');

const CACHE_DISABLED =
  String(process.env.CACHE_DISABLED || '').toLowerCase() === 'true' ||
  String(process.env.CACHE_DISABLED || '') === '1';

/** Sentinel for explicit cached-null values (lru-cache drops `undefined`). */
const NULL_SENTINEL = Symbol.for('dilivygo.cache.null');

/** @type {Map<string, LRUCache<string, any>>} */
const registry = new Map();

/** @type {Record<string, { hits: number, misses: number, sets: number, invalidations: number }>} */
const counters = {};

/**
 * @param {string} name
 * @returns {{ hits: number, misses: number, sets: number, invalidations: number }}
 */
function counterFor(name) {
  if (!counters[name]) counters[name] = { hits: 0, misses: 0, sets: 0, invalidations: 0 };
  return counters[name];
}

/**
 * @param {string} name
 * @param {{ max?: number, ttl?: number, allowStale?: boolean }} [opts]
 * @returns {LRUCache<string, any>}
 */
function registerCache(name, opts = {}) {
  if (registry.has(name)) return registry.get(name);
  const cache = new LRUCache({
    max: opts.max ?? 500,
    ttl: opts.ttl ?? 30_000,
    allowStale: false,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });
  registry.set(name, cache);
  counterFor(name);
  return cache;
}

// Default caches wired into model/controller hot paths. Each registration
// declares the TTL and size that production traffic was sized against.
registerCache('public:shops',          { max: 200,  ttl: 30_000 });
registerCache('public:shop-detail',    { max: 2000, ttl: 30_000 });
registerCache('public:catalog:products',   { max: 2000, ttl: 30_000 });
registerCache('public:catalog:categories', { max: 2000, ttl: 30_000 });
registerCache('public:theme',          { max: 200,  ttl: 60_000 });
registerCache('public:banners',        { max: 200,  ttl: 30_000 });
registerCache('org-context',           { max: 500,  ttl: 60_000 });
registerCache('platform-settings',     { max: 2000, ttl: 30_000 });
registerCache('vendor-settings',       { max: 2000, ttl: 30_000 });
registerCache('cx:customer-360',       { max: 2000, ttl: 30_000 });

/**
 * @param {string} name
 * @returns {LRUCache<string, any>}
 */
function getCache(name) {
  const cache = registry.get(name);
  if (!cache) throw new Error(`Unknown cache namespace: ${name}`);
  return cache;
}

/**
 * Generate a tenant-variant cache key that isolates entries by verified
 * host or organization. This prevents cross-tenant cache pollution when
 * multiple tenants share the same cache namespace (e.g. `public:theme`).
 *
 * @param {string} key - The original cache key
 * @param {object} [req] - Express request with hostContext from Phase 05
 * @returns {string} Tenant-variant key
 */
function tenantVariant(key, req) {
  if (!req?.hostContext) return key;
  const ctx = req.hostContext;
  const tenantId = ctx.organizationId || ctx.workspaceProjectRef || ctx.host;
  if (!tenantId || tenantId === 'localhost') return key;
  return `${key}:${tenantId}`;
}

/**
 * Cache-or-load wrapper.
 *
 * @template T
 * @param {string} name
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @param {{ ttl?: number, req?: object }} [opts]  Override TTL; pass req for tenant isolation.
 * @returns {Promise<T>}
 */
async function wrap(name, key, loader, opts = {}) {
  const effectiveKey = tenantVariant(key, opts.req);
  if (CACHE_DISABLED) {
    return loader();
  }
  const cache = getCache(name);
  const stats = counterFor(name);

  const cached = cache.get(effectiveKey);
  if (cached !== undefined) {
    stats.hits += 1;
    return cached === NULL_SENTINEL ? null : cached;
  }

  stats.misses += 1;
  const value = await loader();

  // `undefined` => opt out of caching (e.g. loader signalled "don't memoise").
  // `null`     => cache as sentinel so we don't re-query for known-missing rows.
  if (value === undefined) {
    return value;
  }
  const toStore = value === null ? NULL_SENTINEL : value;
  if (opts.ttl) {
    cache.set(effectiveKey, toStore, { ttl: opts.ttl });
  } else {
    cache.set(effectiveKey, toStore);
  }
  stats.sets += 1;
  return value;
}

/**
 * Collect the storage keys to hit for an invalidation, including the
 * tenant-variant suffix when the request is org-scoped. Storage keys are
 * scoped per-namespace (each registered LRUCache is keyed by `name`), so
 * this returns plain keys — the `name` prefix is never added here.
 *
 * @param {string} key
 * @param {object} [req] - Express request with hostContext from Phase 05
 * @returns {string[]}
 */
function collectKeys(key, req) {
  const keys = [key];
  const ctx = req?.hostContext;
  if (!ctx) return keys;
  const tenantId = ctx.organizationId || ctx.workspaceProjectRef || ctx.host;
  if (tenantId && tenantId !== 'localhost') {
    keys.push(`${key}:${tenantId}`);
  }
  return [...new Set(keys)];
}

/**
 * Remove cached entry/entries by namespace + key.
 * - `key` omitted/`undefined` → flush the whole namespace (including any
 *   tenant-variant entries).
 * - `key` provided → delete the base key and, when `req` carries an
 *   org-scoped hostContext, the tenant-variant key too.
 * Unknown namespaces are a silent no-op (mutation paths never break).
 *
 * @param {string} name
 * @param {string} [key]
 * @param {object} [req] - Express request with hostContext.organizationId
 */
function invalidate(name, key, req) {
  const cache = registry.get(name);
  if (!cache) return;
  const stats = counterFor(name);

  if (key == null) {
    const size = cache.size;
    cache.clear();
    stats.invalidations += size;
    return;
  }

  let count = 0;
  for (const k of collectKeys(key, req)) {
    if (cache.has(k)) {
      cache.delete(k);
      count += 1;
    }
  }
  stats.invalidations += count;
}

/**
 * Bulk invalidation. Silent no-op on unknown namespaces so mutation paths
 * never break if a cache is retired.
 * @param {Array<{ name: string, key?: string, req?: object }>} entries
 */
function invalidateMany(entries) {
  for (const entry of entries || []) {
    if (!entry || typeof entry.name !== 'string') continue;
    try {
      invalidate(entry.name, entry.key, entry.req);
    } catch (err) {
      logger.warn('cache invalidate failed', { name: entry.name, key: entry.key, error: err.message });
    }
  }
}

/** Drop every cache entry across every namespace. Use in tests and for emergency flush. */
function invalidateAll() {
  for (const [name] of registry) {
    invalidate(name);
  }
}

/**
 * Per-namespace counters for observability.
 * @returns {Record<string, { hits: number, misses: number, sets: number, invalidations: number, size: number }>}
 */
function stats() {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, cache] of registry) {
    const c = counterFor(name);
    out[name] = {
      hits: c.hits,
      misses: c.misses,
      sets: c.sets,
      invalidations: c.invalidations,
      size: cache.size,
    };
  }
  return out;
}

/** Reset every hit/miss/size counter and clear every cache. Test-only helper. */
function __resetForTests() {
  for (const [name, cache] of registry) {
    cache.clear();
    counters[name] = { hits: 0, misses: 0, sets: 0, invalidations: 0 };
  }
}

module.exports = {
  registerCache,
  getCache,
  wrap,
  invalidate,
  invalidateMany,
  invalidateAll,
  stats,
  __resetForTests,
  CACHE_DISABLED,
  tenantVariant,
};
