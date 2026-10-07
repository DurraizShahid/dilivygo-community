'use strict';

/**
 * Resolve the **tenant scope a request was actually served on** from the
 * request `Host` / `X-Forwarded-Host` header. Used by auth guards to make sure
 * a staff/customer/rider session can only be created or used on a host that
 * belongs to the same workspace / organization as the user.
 *
 * Returns `null` when:
 *   - The host header is missing.
 *   - The host does not match any `workspace_hostnames` /
 *     `organization_hostnames` row AND does not match a
 *     `{ref}.{surface}.{SAAS_DNS_APEX}` subdomain pattern.
 *   - `SAAS_DNS_APEX` is unset and no exact hostname row matches (typical dev
 *     case — we do not enforce host scoping in dev to keep `localhost`,
 *     `127.0.0.1`, and direct API calls working).
 *
 * Resolution order:
 *   1. `organization_hostnames` (exact). Always `kind: 'customer-facing'`.
 *   2. `workspace_hostnames` (exact). Returns `kind: 'staff'` only when the
 *      mapped surface is a staff surface (vendor / pos); customer/rider rows
 *      here are legacy and treated as customer-facing.
 *   3. `superadmin.{apex}` / `{slug}.superadmin.{apex}` → platform.
 *   4. `{slug}.{vendor|pos}.{apex}` → workspace lookup.
 *   5. `{slug}.{customer|rider}.{apex}` → organization lookup.
 *
 * @typedef {Object} AuthHostScope
 * @property {'staff'|'customer-facing'|'platform'} kind
 *   `platform` is used for the single superadmin console which has no
 *   workspace/org binding.
 * @property {'customer'|'vendor'|'rider'|'superadmin'|'pos'} surface
 * @property {string|null} workspaceProjectRef Set when a staff host resolves to a workspace.
 * @property {string|null} organizationId Set whenever the host resolves to a known org.
 * @property {string|null} organizationPublicRef Set whenever the host resolves to a known org.
 */

const { extractTrustedHost } = require('./trusted-host');
const config = require('../config');
const { select } = require('./supabase');

// Per-workspace staff surfaces (vendor + pos). Superadmin is platform-wide and
// handled separately via PLATFORM_SURFACES.
const STAFF_SURFACES = new Set(['vendor', 'pos']);
const PLATFORM_SURFACES = new Set(['superadmin']);
const CUSTOMER_FACING_SURFACES = new Set(['customer', 'rider']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function orgPublicRefFor(organizationId) {
  if (!organizationId) return null;
  const rows = await select('organizations', {
    filters: { id: String(organizationId) },
    limit: 1,
  });
  const pub = rows?.[0]?.public_ref;
  return pub ? String(pub) : null;
}

function pickHostHeader(req) {
  // Delegate header extraction + canonicalization to the shared trust boundary
  // helper (`extractTrustedHost`). In prod it honors `x-forwarded-host` under
  // the configured proxy trust; in dev (0 hops) it reads only the `Host`
  // header — never attacker-supplied `x-forwarded-host`.
  return extractTrustedHost(req) || '';
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<AuthHostScope|null>}
 */
async function resolveAuthHostScope(req) {
  const host = pickHostHeader(req);
  if (!host) return null;

  // 1) organization_hostnames (exact match). Org-level customer/rider hosts are
  // the current model (each org is its own marketplace). Only active rows are
  // routable (ADR-001 §2.6) — pending/dns_pending/verifying/error/removing/removed are not.
  // Legacy shim: rows with null/empty status are treated as active for 60d rollout.
  const orgHostRows = await select('organization_hostnames', {
    filters: { hostname: host },
    limit: 1,
  });
  const orgHost = orgHostRows?.[0];
  if (orgHost?.organization_id && orgHost.status != null && orgHost.status !== '' && orgHost.status !== 'active') {
    // Not active — fall through (do not route to pending)
  } else if (orgHost?.organization_id) {
    const surface = String(orgHost.app_surface || '').toLowerCase();
    if (CUSTOMER_FACING_SURFACES.has(surface)) {
      const organizationPublicRef = await orgPublicRefFor(orgHost.organization_id);
      return {
        kind: 'customer-facing',
        surface,
        workspaceProjectRef: null,
        organizationId: String(orgHost.organization_id),
        organizationPublicRef,
      };
    }
  }

  // 2) workspace_hostnames (exact match works even without SAAS_DNS_APEX).
  // Only active rows are routable (ADR-001 §2.6) — pending/dns_pending/verifying/error/removing/removed are not.
  // Legacy shim: rows with null/empty status are treated as active for 60d rollout.
  const wsHostRows = await select('workspace_hostnames', {
    filters: { hostname: host },
    limit: 1,
  });
  const wsHost = wsHostRows?.[0];
  if (wsHost?.workspace_id && wsHost.status != null && wsHost.status !== '' && wsHost.status !== 'active') {
    // Not active — fall through to next resolver (do not route to pending domain)
  } else if (wsHost?.workspace_id) {
    const wsRows = await select('workspaces', {
      filters: { id: wsHost.workspace_id },
      limit: 1,
    });
    const ws = wsRows?.[0];
    if (ws) {
      const surface = String(wsHost.app_surface || '').toLowerCase();
      const projectRef = ws.project_ref ? String(ws.project_ref) : null;
      const organizationId = ws.organization_id ? String(ws.organization_id) : null;
      const organizationPublicRef = organizationId ? await orgPublicRefFor(organizationId) : null;
      if (STAFF_SURFACES.has(surface)) {
        return {
          kind: 'staff',
          surface,
          workspaceProjectRef: projectRef,
          organizationId,
          organizationPublicRef,
        };
      }
      // Legacy `superadmin` rows mapped to a workspace are treated as platform
      // — superadmin sessions are not bound to a workspace/org.
      if (PLATFORM_SURFACES.has(surface)) {
        return {
          kind: 'platform',
          surface,
          workspaceProjectRef: null,
          organizationId: null,
          organizationPublicRef: null,
        };
      }
      // Legacy customer/rider hostname mapped at the workspace level — treat as
      // customer-facing under the workspace's organization.
      if (CUSTOMER_FACING_SURFACES.has(surface)) {
        return {
          kind: 'customer-facing',
          surface,
          workspaceProjectRef: null,
          organizationId,
          organizationPublicRef,
        };
      }
    }
  }

  const apex = String(config.saas?.dnsApex || '').trim().toLowerCase();
  if (!apex) return null;

  // 3) Bare platform subdomain: `superadmin.{apex}` — no slug. Single platform
  // host, not bound to a workspace or org.
  for (const surface of PLATFORM_SURFACES) {
    if (host === `${surface}.${apex}`) {
      return {
        kind: 'platform',
        surface,
        workspaceProjectRef: null,
        organizationId: null,
        organizationPublicRef: null,
      };
    }
    // Legacy `{slug}.superadmin.{apex}` URLs — still allowed, still platform
    // (slug is ignored for superadmin since sessions are platform-wide).
    const legacy = `.${surface}.${apex}`;
    if (host.endsWith(legacy)) {
      const slug = host.slice(0, -legacy.length);
      if (slug && SLUG_RE.test(slug)) {
        return {
          kind: 'platform',
          surface,
          workspaceProjectRef: null,
          organizationId: null,
          organizationPublicRef: null,
        };
      }
    }
  }

  // 4) Per-workspace staff subdomain pattern: {slug}.{vendor|pos}.{apex}
  for (const surface of STAFF_SURFACES) {
    const suffix = `.${surface}.${apex}`;
    if (host.endsWith(suffix)) {
      const slug = host.slice(0, -suffix.length);
      if (!slug || !SLUG_RE.test(slug)) return null;
      const wsRows = await select('workspaces', {
        filters: { project_ref: slug },
        limit: 1,
      });
      const ws = wsRows?.[0];
      if (!ws) return null;
      const organizationPublicRef = await orgPublicRefFor(ws.organization_id);
      return {
        kind: 'staff',
        surface,
        workspaceProjectRef: String(ws.project_ref),
        organizationId: ws.organization_id ? String(ws.organization_id) : null,
        organizationPublicRef,
      };
    }
  }

  // 5) Customer-facing subdomain pattern: {slug}.{customerSurface}.{apex}
  for (const surface of CUSTOMER_FACING_SURFACES) {
    const suffix = `.${surface}.${apex}`;
    if (host.endsWith(suffix)) {
      const slug = host.slice(0, -suffix.length);
      if (!slug || !SLUG_RE.test(slug)) return null;
      const orgRows = await select('organizations', {
        filters: { public_ref: slug },
        limit: 1,
      });
      const org = orgRows?.[0];
      if (!org) return null;
      return {
        kind: 'customer-facing',
        surface,
        workspaceProjectRef: null,
        organizationId: String(org.id),
        organizationPublicRef: String(org.public_ref),
      };
    }
  }

  return null;
}

/**
 * Build a 403 payload for staff users whose project_ref / organization_id does
 * not match the host they are signing in from. Returns `null` when the user is
 * allowed.
 *
 * @param {{ project_ref?: string|null, organization_id?: string|null, role?: string|null }} user
 * @param {AuthHostScope|null} scope
 * @param {string|null} resolvedUserOrgId Pre-resolved org id for the user (avoids re-lookup in the controller).
 * @returns {{ status: number, body: { error: string, code: string } }|null}
 */
function staffHostMismatchResponse(user, scope, resolvedUserOrgId) {
  if (!scope) return null;

  // Platform host (superadmin console) — no workspace/org binding. Anyone with
  // a valid superadmin session can use it. Org-scoped staff trying to sign in
  // here would just fail at the auth controller (no row in `superadmins`).
  if (scope.kind === 'platform') return null;

  const userOrgId =
    (user && (user.organization_id || resolvedUserOrgId)) || null;

  // Cross-organization: always reject, regardless of surface kind.
  if (
    scope.organizationId &&
    userOrgId &&
    String(userOrgId) !== String(scope.organizationId)
  ) {
    return {
      status: 403,
      body: {
        error:
          "This account belongs to a different organization. Sign in from your organization's URL.",
        code: 'WRONG_ORG_HOST',
      },
    };
  }

  // Cross-workspace on a staff host: reject for everything except platform-wide
  // riders (project_ref = null). Workspace-bound riders + admins/vendors must
  // match the workspace this host serves.
  if (scope.kind === 'staff' && scope.workspaceProjectRef) {
    const role = String(user?.role || '').toLowerCase();
    const userRef = user?.project_ref ? String(user.project_ref) : null;
    const isPlatformRider = role === 'rider' && !userRef;
    if (!isPlatformRider) {
      if (!userRef || userRef !== String(scope.workspaceProjectRef)) {
        return {
          status: 403,
          body: {
            error:
              "This account is not authorized for this brand. Sign in from your brand's URL.",
            code: 'WRONG_WORKSPACE_HOST',
          },
        };
      }
    }
  }

  return null;
}

module.exports = {
  resolveAuthHostScope,
  staffHostMismatchResponse,
  STAFF_SURFACES,
  PLATFORM_SURFACES,
  CUSTOMER_FACING_SURFACES,
};
