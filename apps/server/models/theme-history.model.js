'use strict';

const { select, insert, supabaseFetch } = require('../lib/supabase');
const logger = require('../lib/logger');

const TABLE = 'theme_history';

async function create(entry) {
  const now = new Date().toISOString();
  const row = {
    id: entry.id || undefined,
    organization_id: entry.organization_id,
    theme_snapshot: entry.theme_snapshot,
    branding_snapshot: entry.branding_snapshot || null,
    source: entry.source || 'manual',
    logo_hash: entry.logo_hash || null,
    strategy: entry.strategy || null,
    generator_version: entry.generator_version || null,
    analyzer_version: entry.analyzer_version || null,
    created_by: entry.created_by || null,
    created_at: entry.created_at || now,
    restored_from: entry.restored_from || null,
  };
  // Use insert helper
  const inserted = await insert(TABLE, [row]);
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

async function listByOrganization(organizationId, { limit = 20, offset = 0 } = {}) {
  const rows = await select(TABLE, {
    filters: { organization_id: organizationId },
    order: 'created_at.desc',
    limit: Math.min(100, Math.max(1, limit)),
    offset: Math.max(0, offset),
  });
  return rows || [];
}

async function findByIdForOrg(id, organizationId) {
  const rows = await select(TABLE, { filters: { id, organization_id: organizationId }, limit: 1 });
  return rows?.[0] || null;
}

async function countByOrg(organizationId) {
  const rows = await select(TABLE, { filters: { organization_id: organizationId } });
  return (rows || []).length;
}

module.exports = { create, listByOrganization, findByIdForOrg, countByOrg };
