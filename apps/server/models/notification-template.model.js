'use strict';

const { v4: uuidv4 } = require('uuid');
const { select, insert, update, supabaseFetch } = require('../lib/supabase');
const logger = require('../lib/logger');
const platformSettings = require('./platform-settings.model');

const TABLE = 'notification_templates';

const _cache = new Map();
const CACHE_TTL = 60_000;

function _cacheKey(slug, orgKey) {
  return `${orgKey}:${slug}`;
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function _cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

function invalidateCache(slug, orgKey) {
  if (arguments.length === 0) {
    _cache.clear();
    return;
  }
  if (slug && orgKey !== undefined) {
    _cache.delete(_cacheKey(slug, orgKey));
    return;
  }
  if (slug) {
    for (const k of _cache.keys()) {
      if (k.endsWith(`:${slug}`)) _cache.delete(k);
    }
    return;
  }
  _cache.clear();
}

/**
 * @param {string} slug
 * @param {{ projectRef?: string|null, organizationId?: string|null }} [options]
 */
async function getBySlug(slug, options) {
  const orgId = await platformSettings.resolveOrganizationId(options || {});
  const orgKey = orgId || 'global';
  const ck = _cacheKey(slug, orgKey);
  const cached = _cacheGet(ck);
  if (cached) return cached;

  const filters = orgId
    ? { slug, organization_id: orgId }
    : { slug, organization_id: null };

  const rows = await select(TABLE, { filters, limit: 1 });
  const row = rows?.[0] ?? null;
  if (row) _cacheSet(ck, row);
  return row;
}

async function findById(id) {
  const rows = await select(TABLE, { filters: { id }, limit: 1 });
  return rows?.[0] ?? null;
}

/**
 * @param {{ organization_id?: string|null }} [filters]
 */
async function listAll(filters = {}) {
  if (filters.organization_id) {
    return select(TABLE, { filters: { organization_id: filters.organization_id }, order: 'name.asc' });
  }
  return select(TABLE, { order: 'name.asc' });
}

async function updateById(id, patch) {
  patch.updated_at = new Date().toISOString();
  const rows = await update(TABLE, patch, { id });
  const updated = Array.isArray(rows) ? rows[0] : rows;
  if (updated) {
    const orgKey = updated.organization_id || 'global';
    invalidateCache(updated.slug, orgKey);
  }
  return updated;
}

async function resetToDefault(id) {
  const current = await findById(id);
  if (!current) return null;

  const defaults = await supabaseFetch(
    `/rest/v1/rpc/get_notification_template_defaults`,
    { method: 'POST', body: JSON.stringify({ p_slug: current.slug }) }
  ).catch(() => null);

  if (!defaults) {
    logger.warn('No default template found for reset', { slug: current.slug });
    return current;
  }
  return updateById(id, defaults);
}

/**
 * Copy templates from another org or from legacy global (organization_id NULL) rows into a new org.
 * Idempotent when the org already has at least one template row.
 * @param {string} organizationId
 */
async function seedForOrganization(organizationId) {
  const existing = await select(TABLE, { filters: { organization_id: organizationId }, limit: 1 });
  if (existing?.length) return { seeded: 0 };

  const others = await select('organizations', { order: 'created_at.asc' });
  const sourceOrg = (others || []).find((o) => o.id !== organizationId);

  let rows = [];
  if (sourceOrg) {
    rows = await select(TABLE, { filters: { organization_id: sourceOrg.id } });
  } else {
    rows = await select(TABLE, { filters: { organization_id: null } });
  }
  if (!rows?.length) {
    logger.warn('seedForOrganization: no template source rows', { organizationId });
    return { seeded: 0 };
  }

  const now = new Date().toISOString();
  let seeded = 0;
  for (const t of rows) {
    try {
      await insert(TABLE, [
        {
          id: uuidv4(),
          slug: t.slug,
          name: t.name,
          description: t.description,
          channel: t.channel,
          email_subject: t.email_subject,
          email_html: t.email_html,
          push_title: t.push_title,
          push_body: t.push_body,
          is_active: t.is_active,
          organization_id: organizationId,
          created_at: now,
          updated_at: now,
        },
      ]);
      seeded += 1;
    } catch (err) {
      logger.warn('seedForOrganization row failed', { organizationId, slug: t.slug, error: err.message });
    }
  }
  invalidateCache();
  return { seeded };
}

module.exports = {
  getBySlug,
  findById,
  listAll,
  updateById,
  invalidateCache,
  seedForOrganization,
};
