'use strict';

/**
 * CORS allowlisting for tenant **custom hostnames** — both
 * `organization_hostnames` (customer/rider surfaces) and `workspace_hostnames`
 * (vendor/POS staff surfaces).
 *
 * Hosts like `eats.example.com` are tenant-scoped browser origins that are NOT
 * covered by the static `{ref}.{surface}.{apex}` patterns in `config/cors.js`
 * (`isSaasTenantWebOrigin` / `isSaasBareSurfaceOrigin`). Auth/cart/order
 * requests from those origins reach the API with a credential-bearing CORS
 * preflight, so they must be allowlisted dynamically.
 *
 * Active rows (ADR-001 §2.6 + migration `113` lifecycle: `status` is null /
 * '' / 'active' and `removed_at` is unset) are treated as valid tenant origins.
 * The row set is resolved through a short-lived cache (`org-hostnames-cors`,
 * 60s) so per-request preflight checks never hit the DB, and a browser's 24h
 * preflight cache cannot outlive a parked/removed domain by more than one TTL
 * after a code deploy + cache flush.
 *
 * Fail-closed: any cache/DB error causes the origin check to reject (the caller
 * in `config/cors.js` shadows errors so the origin is simply not allowed).
 */

const cache = require('./cache');
const logger = require('./logger');
const { select } = require('./supabase');

const CORS_CACHE_NAME = 'org-hostnames-cors';
const CORS_CACHE_TTL_MS = 60_000;
const ALLOWLIST_PAGE_SIZE = 1000;
const MAX_ALLOWLIST_HOSTS = 5000;

// Staff surfaces (vendor/POS) live in `workspace_hostnames`; customer/rider
// surfaces live in `organization_hostnames`. Both must be allowlisted.
const HOSTNAME_TABLES = ['organization_hostnames', 'workspace_hostnames'];

let registered = false;

// Mirrors the default caches wired into model/controller hot paths. Registered
// lazily (and guarded) so test suites that stub `../lib/cache` with a partial
// mock can require `config/cors.js` without needing `registerCache`.
function ensureCacheRegistered() {
  if (registered || typeof cache.registerCache !== 'function') return;
  cache.registerCache(CORS_CACHE_NAME, { max: 2, ttl: CORS_CACHE_TTL_MS });
  registered = true;
}

/**
 * Legacy-agnostic active-row check (null / '' / 'active').
 * @param {{ status?: string|null }} [row]
 * @returns {boolean}
 */
function isActiveRow(row) {
  const status = row?.status;
  return status == null || status === '' || status === 'active';
}

/**
 * @param {string} normalizedOrigin
 * @returns {string|null} Lowercased hostname, or null when unparseable.
 */
function parseOriginHost(normalizedOrigin) {
  try {
    return new URL(normalizedOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Page through a hostname table, collecting active hostnames. Ordered by
 * hostname so the page boundary is stable across calls and capped so a runaway
 * table cannot exhaust memory/DB in a single preflight.
 * @param {string} table
 * @returns {Promise<string[]>}
 */
async function fetchActiveHostnamesFromTable(table) {
  const hosts = [];
  let offset = 0;
  while (offset < MAX_ALLOWLIST_HOSTS) {
    const rows = await select(table, {
      filters: { removed_at: null },
      order: 'hostname.asc',
      limit: ALLOWLIST_PAGE_SIZE,
      offset,
    });
    for (const r of rows || []) {
      if (r?.hostname && isActiveRow(r) && !r.removed_at) {
        hosts.push(String(r.hostname).toLowerCase());
      }
    }
    if (!rows || rows.length < ALLOWLIST_PAGE_SIZE) break;
    offset += rows.length;
  }
  return hosts;
}

async function loadActiveHostnames() {
  const perTable = await Promise.all(HOSTNAME_TABLES.map(fetchActiveHostnamesFromTable));
  const hosts = [...new Set(perTable.flat())].sort();
  if (hosts.length >= MAX_ALLOWLIST_HOSTS) {
    logger.warn('custom-hostname CORS allowlist truncated at capacity', {
      max: MAX_ALLOWLIST_HOSTS,
      tables: HOSTNAME_TABLES,
    });
  }
  return hosts;
}

/**
 * Active custom hostnames across all tenants (cached 60s).
 * @returns {Promise<string[]>}
 */
async function listActiveHostnames() {
  ensureCacheRegistered();
  return cache.wrap(CORS_CACHE_NAME, 'active', () => loadActiveHostnames(), {
    ttl: CORS_CACHE_TTL_MS,
  });
}

/**
 * Is the given browser origin one of the tenants' active custom hostnames
 * (organization or workspace/staff surface)?
 * @param {string} normalizedOrigin Lowercased origin string.
 * @returns {Promise<boolean>}
 */
async function isCustomTenantHost(normalizedOrigin) {
  const host = parseOriginHost(normalizedOrigin);
  if (!host) return false;
  const hosts = await listActiveHostnames();
  return hosts.includes(host);
}

/**
 * @deprecated Use `isCustomTenantHost` — this only covered organization
 * (customer/rider) hostnames and missed workspace (staff) hostnames.
 * Kept as a thin delegate for existing call sites.
 * @param {string} normalizedOrigin Lowercased origin string.
 * @returns {Promise<boolean>}
 */
async function isCustomOrgHost(normalizedOrigin) {
  return isCustomTenantHost(normalizedOrigin);
}

/** Drop the cached allowlist (domain-service mutation paths call this). */
function invalidateCustomHostnamesCache() {
  cache.invalidate(CORS_CACHE_NAME);
}

module.exports = {
  isCustomTenantHost,
  isCustomOrgHost,
  listActiveHostnames,
  parseOriginHost,
  invalidateCustomHostnamesCache,
  CORS_CACHE_NAME,
  isActiveRow,
};
