'use strict';

const { select, supabaseFetch } = require('../lib/supabase');
const logger = require('../lib/logger');
const cache = require('../lib/cache');
const {
  TENANT_SETTING_KEYS,
  GLOBAL_SETTING_KEYS,
  TENANT_SETTING_DEFAULTS,
  defaultForKey,
} = require('../lib/tenant-settings-defaults');

const TABLE = 'platform_settings';
const ORG_TABLE = 'organization_platform_settings';

/**
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function resolveOrganizationId(options) {
  if (!options) return null;
  if (options.organizationId) return String(options.organizationId);
  const ref = options.projectRef;
  if (ref == null || ref === '') return null;

  // Public surfaces use the same `ref` slot for an organization public_ref or
  // a legacy workspace project_ref. Resolve both through the canonical context
  // resolver; otherwise org-scoped customer URLs silently fall back to code
  // defaults (notably GBP) while staff/workspace URLs read the real setting.
  const { resolveOrganizationContext } = require('../lib/organization-context');
  const ctx = await resolveOrganizationContext(String(ref));
  return ctx?.organizationId ? String(ctx.organizationId) : null;
}

async function getGlobalRow(key) {
  return cache.wrap('platform-settings', `global:${key}`, async () => {
    const rows = await select(TABLE, { filters: { key }, limit: 1 });
    return rows?.[0]?.value ?? null;
  });
}

/**
 * Tenant keys: organization_platform_settings only, then code defaults — never platform_settings.
 * Global keys (e.g. demo_mode): platform_settings only. Unknown keys return null.
 * @param {string} key
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function get(key, options) {
  if (GLOBAL_SETTING_KEYS.has(key)) {
    return getGlobalRow(key);
  }
  if (!TENANT_SETTING_KEYS.has(key)) {
    return null;
  }
  const orgId = await resolveOrganizationId(options);
  if (!orgId) {
    return defaultForKey(key);
  }
  return cache.wrap('platform-settings', `org:${orgId}:${key}`, async () => {
    const rows = await select(ORG_TABLE, { filters: { organization_id: orgId, key }, limit: 1 });
    if (rows?.[0] && rows[0].value !== undefined && rows[0].value !== null) {
      return rows[0].value;
    }
    return defaultForKey(key);
  });
}

async function setGlobal(key, value) {
  const now = new Date().toISOString();
  const body = JSON.stringify({ key, value: String(value), updated_at: now });
  await supabaseFetch(`/rest/v1/${TABLE}?on_conflict=key`, {
    method: 'POST',
    body,
    headers: { Prefer: 'resolution=merge-duplicates' },
  });
  cache.invalidate('platform-settings', `global:${key}`);
  // Theme payload is a derived join across many settings — safest to flush.
  cache.invalidate('public:theme');
}

/**
 * @param {string} key
 * @param {string|number|boolean} value
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function set(key, value, options) {
  if (GLOBAL_SETTING_KEYS.has(key)) {
    try {
      await setGlobal(key, value);
    } catch (err) {
      logger.error('Failed to set global platform setting', { key, error: err.message });
      throw err;
    }
    return;
  }
  const orgId = options && (await resolveOrganizationId(options));
  if (!orgId) {
    const err = new Error(
      `Setting "${key}" requires organization context (organizationId or resolvable projectRef)`,
    );
    err.statusCode = 400;
    throw err;
  }
  return setForOrganization(orgId, key, value);
}

/**
 * Upsert a key for one organization (tenant-scoped config).
 * @param {string} organizationId
 * @param {string} key
 * @param {string} value
 */
async function setForOrganization(organizationId, key, value) {
  const now = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    key,
    value: String(value),
    updated_at: now,
  };
  await supabaseFetch(`/rest/v1/${ORG_TABLE}?on_conflict=organization_id,key`, {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'resolution=merge-duplicates' },
  });
  cache.invalidate('platform-settings', `org:${organizationId}:${key}`);
  cache.invalidate('public:theme');
  // listActiveBanners reads per-org; wipe banner cache so a new placement shows up.
  cache.invalidate('public:banners');
}

/**
 * Seed all tenant keys for a new organization from code defaults (no global platform_settings read).
 * @param {string} organizationId
 */
async function seedOrganizationTenantSettings(organizationId) {
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(TENANT_SETTING_DEFAULTS)) {
    try {
      await supabaseFetch(`/rest/v1/${ORG_TABLE}?on_conflict=organization_id,key`, {
        method: 'POST',
        body: JSON.stringify({
          organization_id: organizationId,
          key,
          value: String(value ?? ''),
          updated_at: now,
        }),
        headers: { Prefer: 'resolution=merge-duplicates' },
      });
    } catch (err) {
      logger.warn('seedOrganizationTenantSettings row failed', { organizationId, key, error: err.message });
    }
  }
  // Whole-org seed — flush everything scoped to this org.
  cache.invalidate('platform-settings');
  cache.invalidate('public:theme');
}

/** @deprecated Use seedOrganizationTenantSettings — kept for call-site compatibility */
async function seedOrganizationSettingsFromGlobal(organizationId) {
  return seedOrganizationTenantSettings(organizationId);
}

async function getAll() {
  const rows = await select(TABLE, {});
  const result = {};
  for (const row of rows || []) {
    result[row.key] = row.value;
  }
  return result;
}

/**
 * @param {string[]} keys
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function getBulk(keys, options) {
  if (!keys?.length) return {};
  const orgId = await resolveOrganizationId(options);
  const result = {};

  const orgRowMap = new Map();
  if (orgId) {
    const orgRows = await select(ORG_TABLE, { filters: { organization_id: orgId } });
    for (const row of orgRows || []) {
      orgRowMap.set(row.key, row.value);
    }
  }

  for (const key of keys) {
    if (GLOBAL_SETTING_KEYS.has(key)) {
      result[key] = await getGlobalRow(key);
    } else if (TENANT_SETTING_KEYS.has(key)) {
      if (orgId && orgRowMap.has(key)) {
        result[key] = orgRowMap.get(key);
      } else {
        result[key] = defaultForKey(key);
      }
    } else {
      result[key] = null;
    }
  }

  return result;
}

/**
 * @param {string} key
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function remove(key, options) {
  if (GLOBAL_SETTING_KEYS.has(key)) {
    await supabaseFetch(`/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
    cache.invalidate('platform-settings', `global:${key}`);
    cache.invalidate('public:theme');
    return;
  }
  const orgId = options && (await resolveOrganizationId(options));
  if (!orgId) {
    const err = new Error(
      `Removing "${key}" requires organization context (organizationId or resolvable projectRef)`,
    );
    err.statusCode = 400;
    throw err;
  }
  const q = `organization_id=eq.${encodeURIComponent(orgId)}&key=eq.${encodeURIComponent(key)}`;
  await supabaseFetch(`/rest/v1/${ORG_TABLE}?${q}`, { method: 'DELETE' });
  cache.invalidate('platform-settings', `org:${orgId}:${key}`);
  cache.invalidate('public:theme');
  cache.invalidate('public:banners');
}

module.exports = {
  get,
  set,
  getAll,
  getBulk,
  remove,
  setForOrganization,
  seedOrganizationSettingsFromGlobal,
  seedOrganizationTenantSettings,
  resolveOrganizationId,
};