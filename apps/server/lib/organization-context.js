'use strict';

/**
 * Resolve an organization context from a public `ref` string.
 *
 * A public `ref` can be:
 *   1. An organization's `public_ref` (preferred; matches customer/rider URL slug).
 *   2. A workspace's `project_ref` (legacy / staff URL compatibility).
 *   3. The legacy marketplace sentinel `_marketplace` (deprecated — returns the
 *      synthetic marketplace organization, but callers should migrate off it).
 *
 * Returns `{ organizationId, organizationPublicRef, workspace? }` or `null`.
 *
 * NOTE: Results are memoised in the shared `org-context` LRU (60s TTL).
 * Mutations to `organizations` / `workspaces` rows should call
 * `cache.invalidate('org-context')` from the corresponding model. Adding or
 * renaming an organization / workspace becomes visible within one TTL window.
 */

const { select } = require('./supabase');
const {
  MARKETPLACE_PUBLIC_REF,
  MARKETPLACE_ORGANIZATION_ID,
} = require('./platform-constants');
const cache = require('./cache');

/**
 * @param {string|null|undefined} ref
 * @returns {Promise<{
 *   organizationId: string,
 *   organizationPublicRef: string|null,
 *   workspace: { id: string, project_ref: string } | null,
 *   isLegacyMarketplace: boolean,
 * }|null>}
 */
async function resolveOrganizationContext(ref) {
  const raw = typeof ref === 'string' ? ref.trim() : '';
  if (!raw) return null;

  return cache.wrap('org-context', `ctx:${raw.toLowerCase()}`, async () => {
    if (raw === MARKETPLACE_PUBLIC_REF) {
      return {
        organizationId: MARKETPLACE_ORGANIZATION_ID,
        organizationPublicRef: MARKETPLACE_PUBLIC_REF,
        workspace: null,
        isLegacyMarketplace: true,
      };
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
    if (isUuid) {
      const orgById = await select('organizations', {
        filters: { id: raw },
        limit: 1,
      });
      if (orgById?.length) {
        return {
          organizationId: String(orgById[0].id),
          organizationPublicRef: orgById[0].public_ref ? String(orgById[0].public_ref) : null,
          workspace: null,
          isLegacyMarketplace: false,
        };
      }
    }

    const orgRows = await select('organizations', {
      filters: { public_ref: raw },
      limit: 1,
    });
    if (orgRows?.length) {
      return {
        organizationId: String(orgRows[0].id),
        organizationPublicRef: String(orgRows[0].public_ref),
        workspace: null,
        isLegacyMarketplace: false,
      };
    }

    const wsRows = await select('workspaces', {
      filters: { project_ref: raw },
      limit: 1,
    });
    if (wsRows?.length) {
      const ws = wsRows[0];
      let publicRef = null;
      if (ws.organization_id) {
        const orgRow = await select('organizations', {
          filters: { id: ws.organization_id },
          limit: 1,
        });
        publicRef = orgRow?.[0]?.public_ref ? String(orgRow[0].public_ref) : null;
      }
      return {
        organizationId: String(ws.organization_id),
        organizationPublicRef: publicRef,
        workspace: { id: String(ws.id), project_ref: String(ws.project_ref) },
        isLegacyMarketplace: false,
      };
    }

    return null;
  });
}

/** @param {string} projectRef */
async function organizationIdByProjectRef(projectRef) {
  return cache.wrap('org-context', `proj:${String(projectRef).toLowerCase()}`, async () => {
    const rows = await select('workspaces', {
      filters: { project_ref: projectRef },
      limit: 1,
    });
    return rows?.[0]?.organization_id ? String(rows[0].organization_id) : null;
  });
}

/**
 * @param {string} organizationId
 * @returns {Promise<{ id: string, publicRef: string|null, name: string|null }|null>}
 */
async function organizationById(organizationId) {
  return cache.wrap('org-context', `id:${String(organizationId).toLowerCase()}`, async () => {
    const rows = await select('organizations', {
      filters: { id: organizationId },
      limit: 1,
    });
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: String(row.id),
      publicRef: row.public_ref ? String(row.public_ref) : null,
      name: row.name ? String(row.name) : null,
    };
  });
}

/**
 * Drop every cached organization / workspace lookup. Call this from mutation
 * paths that create, rename, or delete an organization or workspace — keeps
 * the customer-facing resolver from returning stale `project_ref`/`public_ref`
 * mappings until the natural 60s TTL expires.
 */
function invalidateOrganizationContext() {
  cache.invalidate('org-context');
  // Shop listing scopes by org/workspace — flush there too so a moved or
  // renamed workspace doesn't keep surfacing shops to the wrong tenant ref.
  cache.invalidate('public:shops');
  cache.invalidate('public:shop-detail');
  cache.invalidate('public:theme');
  cache.invalidate('public:banners');
}

module.exports = {
  resolveOrganizationContext,
  organizationIdByProjectRef,
  organizationById,
  invalidateOrganizationContext,
};
