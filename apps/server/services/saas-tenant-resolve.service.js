'use strict';

const { domainToASCII } = require('url');
const config = require('../config');
const { select } = require('../lib/supabase');

function canonicalHost(host) {
  const raw = String(host || '')
    .split(':')[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!raw) return raw;
  try {
    const ascii = domainToASCII(raw);
    return ascii || raw;
  } catch {
    return raw;
  }
}

function isActiveRow(row) {
  const s = row?.status;
  return s == null || s === '' || s === 'active';
}

const SURFACES = new Set(['customer', 'vendor', 'rider', 'superadmin', 'pos', 'apex']);
const CUSTOMER_FACING_SURFACES = new Set(['customer', 'rider']);
// Superadmin is platform-wide (no per-workspace ref). Resolution returns null
// so the Next middleware doesn't try to scope it to a tenant.
const PLATFORM_SURFACES = new Set(['superadmin']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function inferDevSlug(hostname, surf) {
  const needle = `.${String(surf || '').trim().toLowerCase()}.`;
  const idx = hostname.indexOf(needle);
  if (idx <= 0) return null;
  const slug = hostname.slice(0, idx);
  if (!slug || !SLUG_RE.test(slug)) return null;
  return slug;
}

/**
 * Host-scope resolution result.
 *
 * `kind` tells callers whether the ref identifies an organization (tenant
 * marketplace) or a single workspace (vendor portal, POS, etc). Both fields
 * are populated for customer/rider hosts when the organization has a single
 * default workspace, so legacy `project_ref`-scoped code can keep working.
 *
 * @typedef {object} ResolvedHostScope
 * @property {'organization'|'workspace'} kind
 * @property {string|null} organizationId
 * @property {string|null} organizationPublicRef
 * @property {string|null} workspaceProjectRef
 * @property {string|null} canonicalHost
 *   Surrogate canonical host for the surface (primary active custom domain for
 *   the org, else `{publicRef}.{surface}.{apex}`). `null` unless resolved via
 *   `opts.canonical`, and always `null` for workspace-kind scopes.
 */

/**
 * Infer which Dilivygo web shell is serving this host (`{ref}.{surface}.{apex}`).
 * @param {string} host
 * @param {string} apex
 * @returns {string}
 */
function inferSurfaceFromHost(host, apex) {
  const h = canonicalHost(host);
  const a = String(apex || '')
    .trim()
    .toLowerCase();
  if (!h || !a) return 'customer';
  const ordered = ['customer', 'vendor', 'rider', 'superadmin', 'pos'];
  for (const s of ordered) {
    const needle = `.${s}.${a}`;
    if (h.endsWith(needle)) return s;
  }
  return 'customer';
}

/**
 * Resolve a public `ref` from a request `host` for Next.js middleware use.
 *
 * For customer/rider surfaces we prefer **organization** resolution (the org's
 * `public_ref` is returned — shared by every customer/rider in the org, no
 * per-workspace URLs). For vendor/superadmin/pos surfaces we keep the old
 * per-workspace resolution so staff tools still work the same way.
 *
 * Lookup order (customer / rider):
 *   1. `organization_hostnames` exact match.
 *   2. `{publicRef}.customer.{apex}` / `.rider.{apex}` subdomain.
 *   3. Legacy: `workspace_hostnames` / `{projectRef}.{surface}.{apex}` — returns
 *      the owning organization's `public_ref` if one exists.
 *
 * Vendor / superadmin / pos:
 *   1. `workspace_hostnames` exact match.
 *   2. `{projectRef}.{surface}.{apex}` subdomain.
 *
 * @param {string} host
 * @param {string} surface
 * @returns {Promise<string|null>}
 */
async function resolveProjectRefFromHost(host, surface) {
  const h = canonicalHost(host);
  const surf = String(surface || 'customer').trim().toLowerCase();
  if (!h || !SURFACES.has(surf)) return null;

  // Superadmin is a single platform host — no tenant scoping ever applies.
  if (PLATFORM_SURFACES.has(surf)) return null;

  const apex = (config.saas?.dnsApex || '').trim().toLowerCase();

  if (CUSTOMER_FACING_SURFACES.has(surf)) {
    const orgHostRows = await select('organization_hostnames', {
      filters: { hostname: h },
      limit: 1,
    });
    const candidate = orgHostRows?.[0];
    if (candidate?.organization_id && isActiveRow(candidate)) {
      const orgRow = await select('organizations', {
        filters: { id: candidate.organization_id },
        limit: 1,
      });
      const pub = orgRow?.[0]?.public_ref;
      if (pub) return String(pub);
    }

    if (!apex) {
      const slug = inferDevSlug(h, surf);
      if (slug) {
        const orgRow = await select('organizations', {
          filters: { public_ref: slug },
          limit: 1,
        });
        if (orgRow?.[0]) return slug;

        const wsRows = await select('workspaces', { filters: { project_ref: slug }, limit: 1 });
        if (wsRows?.[0]?.organization_id) {
          const orgByWs = await select('organizations', {
            filters: { id: wsRows[0].organization_id },
            limit: 1,
          });
          const pub = orgByWs?.[0]?.public_ref;
          if (pub) return String(pub);
        }
        if (wsRows?.[0]) return slug;
      }
    } else {
      const suffix = `.${surf}.${apex}`;
      if (h.endsWith(suffix)) {
        const slug = h.slice(0, -suffix.length);
        if (slug && SLUG_RE.test(slug)) {
          const orgRow = await select('organizations', {
            filters: { public_ref: slug },
            limit: 1,
          });
          if (orgRow?.[0]) return slug;
        }
      }
    }
  }

  const rows = await select('workspace_hostnames', {
    filters: { hostname: h },
    limit: 1,
  });
  const wsCandidate = rows?.[0];
  if (wsCandidate?.workspace_id && isActiveRow(wsCandidate)) {
    const ws = await select('workspaces', { filters: { id: wsCandidate.workspace_id }, limit: 1 });
    const wsRow = ws?.[0];
    if (wsRow) {
      if (CUSTOMER_FACING_SURFACES.has(surf) && wsRow.organization_id) {
        const orgRow = await select('organizations', {
          filters: { id: wsRow.organization_id },
          limit: 1,
        });
        const pub = orgRow?.[0]?.public_ref;
        if (pub) return String(pub);
      }
      const ref = wsRow.project_ref;
      return ref != null && String(ref).trim() !== '' ? String(ref).trim() : null;
    }
  }

  if (!apex) {
    const slug = inferDevSlug(h, surf);
    if (!slug) return null;
    const wsRows = await select('workspaces', { filters: { project_ref: slug }, limit: 1 });
    if (!wsRows?.[0]) return null;

    if (CUSTOMER_FACING_SURFACES.has(surf) && wsRows[0].organization_id) {
      const orgRow = await select('organizations', {
        filters: { id: wsRows[0].organization_id },
        limit: 1,
      });
      const pub = orgRow?.[0]?.public_ref;
      if (pub) return String(pub);
    }
    return slug;
  }

  const suffix = `.${surf}.${apex}`;
  if (!h.endsWith(suffix)) return null;

  const slug = h.slice(0, -suffix.length);
  if (!slug || !SLUG_RE.test(slug)) return null;

  const wsRows = await select('workspaces', { filters: { project_ref: slug }, limit: 1 });
  if (!wsRows?.[0]) return null;

  if (CUSTOMER_FACING_SURFACES.has(surf) && wsRows[0].organization_id) {
    const orgRow = await select('organizations', {
      filters: { id: wsRows[0].organization_id },
      limit: 1,
    });
    const pub = orgRow?.[0]?.public_ref;
    if (pub) return String(pub);
  }

  return slug;
}

/**
 * Surrogate canonical host for a resolved organization on a customer-facing
 * surface: the active custom hostname marked `is_primary` for that surface
 * first, else any active custom hostname for it (migration `113` lifecycle:
 * `status = 'active'`, `removed_at IS NULL`). Falls back to
 * `{publicRef}.{surface}.{apex}` when the org has no active custom hostname.
 * Returns `null` in dev (no `SAAS_DNS_APEX` configured) or when surface/org
 * are invalid.
 *
 * @param {string} surface
 * @param {string} organizationId
 * @param {string} organizationPublicRef
 * @returns {Promise<string|null>}
 */
async function resolveCanonicalSurfHost(surface, organizationId, organizationPublicRef) {
  const surf = String(surface || 'customer').trim().toLowerCase();
  if (!organizationId || !CUSTOMER_FACING_SURFACES.has(surf)) return null;

  const rows = await select('organization_hostnames', {
    filters: { organization_id: String(organizationId) },
    limit: 50,
  });
  const active = (rows || []).filter((r) => r?.hostname && isActiveRow(r) && !r.removed_at);
  const forSurf = active.filter((r) => String(r.app_surface || 'customer').toLowerCase() === surf);
  const pool = forSurf.length ? forSurf : active;
  const primary = pool.find((r) => r.is_primary === true) || pool[0];
  if (primary) return canonicalHost(primary.hostname);

  const apex = (config.saas?.dnsApex || '').trim().toLowerCase();
  if (!apex || !organizationPublicRef) return null;
  return `${organizationPublicRef}.${surf}.${apex}`;
}

/**
 * Load an organization's public_ref, or `null`.
 *
 * @param {string|null|undefined} organizationId
 * @returns {Promise<string|null>}
 */
async function orgPublicRefFor(organizationId) {
  if (!organizationId) return null;
  const rows = await select('organizations', {
    filters: { id: String(organizationId) },
    limit: 1,
  });
  const pub = rows?.[0]?.public_ref;
  return pub ? String(pub) : null;
}

/**
 * Shape an organization-scope result (optionally resolving the canonical host).
 *
 * @param {string} surf
 * @param {string} organizationId
 * @param {string} organizationPublicRef
 * @param {boolean} wantCanonical
 * @returns {Promise<ResolvedHostScope>}
 */
async function orgHostScope(surf, organizationId, organizationPublicRef, wantCanonical) {
  const canonical = wantCanonical
    ? await resolveCanonicalSurfHost(surf, organizationId, organizationPublicRef)
    : null;
  return {
    kind: 'organization',
    organizationId,
    organizationPublicRef,
    workspaceProjectRef: null,
    canonicalHost: canonical,
  };
}

/**
 * Full host resolution — returns organization + (optional) workspace context.
 *
 * Customer/rider surfaces always identify an organization. The shared
 * customer marketplace spans every workspace in that org, so we deliberately
 * do NOT pick a single workspace project_ref on these surfaces — downstream
 * code must use the organization scope for tenant isolation.
 *
 * Vendor/POS surfaces still resolve to a single workspace (staff is pinned
 * to one workspace).
 *
 * @param {string} host
 * @param {string} surface
 * @param {{ canonical?: boolean }} [opts]
 *   When `opts.canonical` is true, also resolves the surrogate canonical host
 *   for the resolved organization (adds an `organization_hostnames` query for
 *   org-kind results — enable only where the canonical host is genuinely needed).
 * @returns {Promise<ResolvedHostScope|null>}
 */
async function resolveHostScope(host, surface, opts = {}) {
  const h = canonicalHost(host);
  const surf = String(surface || 'customer').trim().toLowerCase();
  const wantCanonical = opts.canonical === true;
  if (!h || !SURFACES.has(surf)) return null;
  if (PLATFORM_SURFACES.has(surf)) return null;

  const apex = (config.saas?.dnsApex || '').trim().toLowerCase();

  if (CUSTOMER_FACING_SURFACES.has(surf)) {
    const orgHostRows = await select('organization_hostnames', {
      filters: { hostname: h },
      limit: 1,
    });
    const orgCandidate = orgHostRows?.[0];
    if (orgCandidate?.organization_id && isActiveRow(orgCandidate)) {
      const orgRow = await select('organizations', {
        filters: { id: orgCandidate.organization_id },
        limit: 1,
      });
      const org = orgRow?.[0];
      if (org?.public_ref) {
        return await orgHostScope(surf, String(org.id), String(org.public_ref), wantCanonical);
      }
    }

    if (apex) {
      const suffix = `.${surf}.${apex}`;
      if (h.endsWith(suffix)) {
        const slug = h.slice(0, -suffix.length);
        if (slug && SLUG_RE.test(slug)) {
          const orgRow = await select('organizations', {
            filters: { public_ref: slug },
            limit: 1,
          });
          if (orgRow?.[0]) {
            return await orgHostScope(
              surf,
              String(orgRow[0].id),
              String(orgRow[0].public_ref),
              wantCanonical
            );
          }
        }
      }
    }
  }

  const rows = await select('workspace_hostnames', {
    filters: { hostname: h },
    limit: 1,
  });
  const wsActive = rows?.[0];
  if (wsActive?.workspace_id && isActiveRow(wsActive)) {
    const ws = await select('workspaces', { filters: { id: wsActive.workspace_id }, limit: 1 });
    const wsRow = ws?.[0];
    if (wsRow) {
      const orgPublicRef = await orgPublicRefFor(wsRow.organization_id);
      // Legacy customer-facing workspace host → treat as that org's marketplace
      // (every org-level route is scoped by organization_id, not project_ref).
      if (CUSTOMER_FACING_SURFACES.has(surf) && wsRow.organization_id && orgPublicRef) {
        return await orgHostScope(surf, String(wsRow.organization_id), orgPublicRef, wantCanonical);
      }
      return {
        kind: 'workspace',
        organizationId: wsRow.organization_id ? String(wsRow.organization_id) : null,
        organizationPublicRef: orgPublicRef,
        workspaceProjectRef:
          wsRow.project_ref != null && String(wsRow.project_ref).trim() !== ''
            ? String(wsRow.project_ref).trim()
            : null,
        canonicalHost: null,
      };
    }
  }

  if (!apex) {
    // Dev fallback (no SAAS_DNS_APEX configured): `{slug}.{surface}.{host}`,
    // mirroring resolveProjectRefFromHost's inferDevSlug behavior.
    const slug = inferDevSlug(h, surf);
    if (slug && CUSTOMER_FACING_SURFACES.has(surf)) {
      const orgRow = await select('organizations', { filters: { public_ref: slug }, limit: 1 });
      if (orgRow?.[0]) {
        return await orgHostScope(
          surf,
          String(orgRow[0].id),
          String(orgRow[0].public_ref),
          wantCanonical
        );
      }
    }
    if (slug) {
      const wsRows = await select('workspaces', { filters: { project_ref: slug }, limit: 1 });
      const wsRow = wsRows?.[0];
      if (wsRow) {
        const orgPublicRef = await orgPublicRefFor(wsRow.organization_id);
        if (CUSTOMER_FACING_SURFACES.has(surf) && wsRow.organization_id && orgPublicRef) {
          return await orgHostScope(surf, String(wsRow.organization_id), orgPublicRef, wantCanonical);
        }
        return {
          kind: 'workspace',
          organizationId: wsRow.organization_id ? String(wsRow.organization_id) : null,
          organizationPublicRef: orgPublicRef,
          workspaceProjectRef: slug,
          canonicalHost: null,
        };
      }
    }
    return null;
  }

  const suffix = `.${surf}.${apex}`;
  if (!h.endsWith(suffix)) return null;

  const slug = h.slice(0, -suffix.length);
  if (!slug || !SLUG_RE.test(slug)) return null;

  const wsRows = await select('workspaces', { filters: { project_ref: slug }, limit: 1 });
  if (!wsRows?.[0]) return null;

  const wsRow = wsRows[0];
  const orgPublicRef = await orgPublicRefFor(wsRow.organization_id);

  if (CUSTOMER_FACING_SURFACES.has(surf) && wsRow.organization_id && orgPublicRef) {
    return await orgHostScope(surf, String(wsRow.organization_id), orgPublicRef, wantCanonical);
  }

  return {
    kind: 'workspace',
    organizationId: wsRow.organization_id ? String(wsRow.organization_id) : null,
    organizationPublicRef: orgPublicRef,
    workspaceProjectRef: slug,
    canonicalHost: null,
  };
}

module.exports = {
  resolveProjectRefFromHost,
  resolveHostScope,
  resolveCanonicalSurfHost,
  SURFACES,
  inferSurfaceFromHost,
};
