'use strict';

const config = require('../config');
const userModel = require('../models/user.model');
const customerModel = require('../models/customer.model');
const shopModel = require('../models/shop.model');
const { resolveAuthHostScope, staffHostMismatchResponse } = require('../lib/host-scope');
const { extractTrustedHost } = require('../lib/trusted-host');
const { organizationIdByProjectRef } = require('../lib/audit-org');
const logger = require('../lib/logger');

function pickStaffProjectRef(user) {
  if (!user) return null;
  const r = user.projectRef ?? user.project_ref;
  if (r == null || r === '') return null;
  return String(r);
}

function pickCustomerProjectRef(customer) {
  if (!customer) return null;
  const r = customer.projectRef ?? customer.project_ref;
  if (r == null || r === '') return null;
  return String(r);
}

/** Express runs router.use() before /:projectRef matches, so req.params.projectRef is often empty here. */
function pickProjectRefFromWorkspaceUrl(req) {
  const combined = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/{2,}/g, '/');
  const m = combined.match(/\/workspace\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Extract projectRef from multiple sources and attach to req.
 *
 * Priority:
 *   1. req.params.projectRef (explicit route param)
 *   2. URL segment /workspace/:projectRef (from baseUrl + path; params not set yet on router.use)
 *   3. req.user.projectRef (from admin session; refreshed from DB when user id present)
 *   4. req.customer.projectRef (from customer JWT/session; refreshed from DB when customer id present — same as staff)
 *   5. req.headers['x-project-ref'] (API header)
 *   6. Host-based SaaS mapping (`{ref}.{surface}.{SAAS_DNS_APEX}` or `workspace_hostnames`) when no staff/customer session and no header ref
 *   7. req.query.projectRef (query string — public routes only)
 */
async function attachProjectRef(req, res, next) {
  try {
    let fromUser = pickStaffProjectRef(req.user);
    if (req.user?.id) {
      const row = await userModel.findById(req.user.id);
      if (row) {
        // Sync role from DB if available (handles stale sessions missing role)
        if (row.role) {
          req.user.role = row.role;
        }

        const ref = row.project_ref;
        if (row.role === 'rider' && (ref == null || String(ref).trim() === '')) {
          req.user.isPlatformRider = true;
          req.user.projectRef = null;
          fromUser = null;
        } else if (ref != null && ref !== '') {
          req.user.isPlatformRider = false;
          fromUser = String(ref);
          req.user.projectRef = fromUser;
        }
      }
    }

    let fromCustomer = pickCustomerProjectRef(req.customer);
    if (req.customer?.id) {
      const row = await customerModel.findById(req.customer.id);
      if (row) {
        const ref = row.project_ref;
        if (ref == null || String(ref).trim() === '') {
          req.customer.isMarketplaceCustomer = true;
          req.customer.projectRef = null;
          fromCustomer = null;
        } else {
          req.customer.isMarketplaceCustomer = false;
          fromCustomer = String(ref);
          req.customer.projectRef = fromCustomer;
        }
        // Canonical org for org-scoped customers (SaaS support tickets, payment, …).
        const rowOrg = row.organization_id ?? row.organizationId;
        if (rowOrg != null && String(rowOrg).trim() !== '') {
          const oid = String(rowOrg);
          req.customer.organizationId = oid;
          req.customer.organization_id = oid;
        }
      }
    }

    const headerRef =
      typeof req.headers['x-project-ref'] === 'string'
        ? req.headers['x-project-ref'].trim() || null
        : null;
    const queryRef =
      typeof req.query.projectRef === 'string' ? req.query.projectRef : null;

    const fromWorkspacePath = pickProjectRefFromWorkspaceUrl(req);

    let fromHost = null;
    let hostScope = null;
    if (!fromUser && !fromCustomer && !headerRef && !req.params.projectRef && !fromWorkspacePath) {
      try {
        const apex = (config.saas?.dnsApex || '').trim();
        if (apex) {
          const { resolveHostScope, inferSurfaceFromHost } = require('../services/saas-tenant-resolve.service');
          const fwd = extractTrustedHost(req);
          const surface = inferSurfaceFromHost(fwd || '', apex);
          hostScope = await resolveHostScope(fwd || '', surface);
          if (hostScope?.kind === 'workspace' && hostScope.workspaceProjectRef) {
            fromHost = hostScope.workspaceProjectRef;
          }
        }
      } catch {
        fromHost = null;
        hostScope = null;
      }
    }

    // `req.organizationId` / `req.hostOrganizationPublicRef` let controllers
    // scope data by organization when the host belongs to an org-level
    // customer/rider marketplace (no single workspace on the URL).
    //
    // For org-host customer surfaces we deliberately LEAVE `req.projectRef`
    // null here. Downstream body-based fallbacks (checkoutDraft / shopId /
    // productId) then resolve the specific workspace `project_ref` so code
    // that expects `req.projectRef` to be a workspace ref (checkout,
    // `assertShopCanAcceptOrder`, order webhook enrichment) keeps working.
    if (hostScope) {
      if (hostScope.organizationId) {
        req.organizationId = hostScope.organizationId;
      }
      if (hostScope.organizationPublicRef) {
        req.hostOrganizationPublicRef = hostScope.organizationPublicRef;
      }
      if (hostScope.kind === 'organization') {
        req.hostIsOrganizationMarketplace = true;
      }
    }

    req.projectRef =
      req.params.projectRef ||
      fromWorkspacePath ||
      fromUser ||
      fromCustomer ||
      headerRef ||
      fromHost ||
      queryRef ||
      null;

    // Cross-workspace URL hijack guard.
    //
    // When a staff session (admin / vendor / workspace-bound rider) lands on a
    // URL that embeds a `/workspace/:projectRef` segment OR a path-level
    // `:projectRef` param, the URL-derived ref MUST match the user's pinned
    // `project_ref`. Without this check an authenticated vendor/admin of
    // workspace A could call `GET /api/workspace/<workspaceB>` and exfiltrate
    // another tenant's data because the URL segment takes priority over the
    // session ref in the resolution order above (this priority is intentional
    // for superadmin tooling but must never apply to workspace staff).
    //
    // Superadmins, marketplace customers, and platform-wide riders are exempt:
    //   - Superadmins legitimately cross workspaces (`req.superadmin` is set by
    //     the auth middleware, not `req.user`).
    //   - Marketplace customer sessions have no pinned `project_ref`.
    //   - Platform-wide riders (`project_ref` null) fulfill orders across
    //     workspaces.
    const urlProjectRef = req.params.projectRef || fromWorkspacePath || null;
    if (
      urlProjectRef &&
      req.user?.id &&
      fromUser &&
      !req.superadmin &&
      !(req.user.role === 'rider' && req.user.isPlatformRider) &&
      String(urlProjectRef).toLowerCase() !== String(fromUser).toLowerCase()
    ) {
      logger.warn('attachProjectRef rejected cross-workspace URL access', {
        userId: req.user.id,
        userProjectRef: fromUser,
        urlProjectRef,
        path: req.originalUrl || req.url,
      });
      return res.status(403).json({
        error:
          "This workspace is not associated with your account. Use your workspace's URL.",
        code: 'WRONG_WORKSPACE_URL',
      });
    }

    // Belt-and-suspenders defense against cross-tenant session reuse.
    //
    // If the request lands on a host that maps to a known workspace /
    // organization AND a logged-in **staff** user's project_ref or
    // organization_id does not match → reject the request. This catches
    // attempts to reuse a session cookie on a sibling brand's URL after the
    // login guard has already done its job.
    //
    // We deliberately limit this to staff users (admins / vendors / riders).
    // Customer sessions stay org-scoped through `MARKETPLACE_CUSTOMER_SCOPE`
    // logic upstream and cross-org enforcement happens on customer auth itself.
    if (req.user?.id) {
      try {
        const hostScope = await resolveAuthHostScope(req);
        if (hostScope) {
          const userOrgId =
            req.user.organization_id ||
            req.user.organizationId ||
            (req.user.projectRef
              ? await organizationIdByProjectRef(req.user.projectRef)
              : null);
          const mismatch = staffHostMismatchResponse(
            {
              project_ref: req.user.projectRef ?? null,
              organization_id: userOrgId,
              role: req.user.role || null,
            },
            hostScope,
            userOrgId,
          );
          if (mismatch) {
            logger.warn('attachProjectRef rejected cross-tenant session', {
              userId: req.user.id,
              userProjectRef: req.user.projectRef ?? null,
              userOrgId,
              hostScope,
              code: mismatch.body.code,
            });
            return res.status(mismatch.status).json(mismatch.body);
          }
        }
      } catch (err) {
        logger.warn('attachProjectRef host check failed', { error: err.message });
      }
    }

    // Multi-shop checkout draft: resolve tenant from first group when header/session unset.
    if (!req.projectRef && req.body?.checkoutDraft?.groups?.[0]?.projectRef) {
      req.projectRef = String(req.body.checkoutDraft.groups[0].projectRef);
    }

    // Checkout: marketplace customer JWT has no tenant — resolve from shop in Stripe metadata.
    if (!req.projectRef && req.body?.metadata?.shopId) {
      try {
        const shop = await shopModel.findById(String(req.body.metadata.shopId));
        if (shop?.project_ref) req.projectRef = String(shop.project_ref);
      } catch (_) {
        /* ignore */
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require projectRef to be present.
 */
function requireProjectRef(req, res, next) {
  if (req.projectRef) return next();
  if (req.user?.role === 'rider' && req.user?.isPlatformRider) return next();
  if (req.customer?.isMarketplaceCustomer) return next();
  // Customer/rider hosts resolve to an organization marketplace — the specific
  // workspace project_ref is established by the request body (checkoutDraft /
  // shopId / productId). The routes that need a workspace-scoped projectRef
  // will still 400 downstream if the body can't supply one.
  //
  // We deliberately allow *any* request on an org-marketplace host through
  // this gate (including anonymous ones) so that downstream `requireAnyAuth`
  // / `requireCustomer` produces the right 401 instead of masking it as a
  // misleading 400 "Project reference is required". The underlying data is
  // scoped by `req.organizationId` anyway, not `req.projectRef`.
  if (req.hostIsOrganizationMarketplace) {
    return next();
  }
  return res.status(400).json({ error: 'Project reference is required' });
}

module.exports = { attachProjectRef, requireProjectRef };
