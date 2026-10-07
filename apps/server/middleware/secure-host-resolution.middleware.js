'use strict';

const config = require('../config');
const { extractTrustedHost, DEV_HOSTS } = require('../lib/trusted-host');
const { resolveAuthHostScope, staffHostMismatchResponse } = require('../lib/host-scope');
const { resolveOrganizationContext } = require('../lib/organization-context');
const logger = require('../lib/logger');

/**
 * Classify a resolved host into a security category.
 *
 * @typedef {'platform'|'known-customer'|'known-staff'|'dev'|'unknown'} HostClassification
 * @property {HostClassification} classification
 * @property {'customer'|'vendor'|'rider'|'superadmin'|'pos'|null} surface
 * @property {string|null} organizationId
 * @property {string|null} organizationPublicRef
 * @property {string|null} workspaceProjectRef
 * @property {boolean} isActive
 * @property {string|null} status
 */

/**
 * Resolve the incoming request host to a tenant context.
 *
 * This is the single entry point for host-based tenant resolution in the
 * Express middleware chain. It:
 *   1. Extracts the trusted host (respecting proxy trust boundary)
 *   2. Canonicalizes it with the single `canonicalizeHostname` function
 *   3. Resolves it against the DB via `resolveAuthHostScope`
 *   4. Classifies it (platform / known-customer / known-staff / dev / unknown)
 *   5. Attaches `req.hostContext` with the full classification
 *   6. Returns the classification for downstream use
 *
 * Unknown hosts return `{ classification: 'unknown' }` and MUST NOT
 * fall through to any tenant. Downstream code should fail closed.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{classification: string, surface: string|null, organizationId: string|null, organizationPublicRef: string|null, workspaceProjectRef: string|null, isActive: boolean, status: string|null, host: string|null, error: Error|null}>}
 */
async function resolveRequestHost(req) {
  const host = extractTrustedHost(req);

  // Dev host — allow through (localhost, 127.0.0.1, etc.)
  if (host && DEV_HOSTS.has(host)) {
    return {
      classification: 'dev',
      surface: null,
      organizationId: null,
      organizationPublicRef: null,
      workspaceProjectRef: null,
      isActive: true,
      status: null,
      host,
      error: null,
    };
  }

  if (!host) {
    return {
      classification: 'unknown',
      surface: null,
      organizationId: null,
      organizationPublicRef: null,
      workspaceProjectRef: null,
      isActive: false,
      status: null,
      host: null,
      error: new Error('HOST_HEADER_MISSING'),
    };
  }

  // First-party platform hosts (the API's own public base URL from
  // `PUBLIC_SERVER_URL` plus `TRUSTED_PLATFORM_HOSTS`) bypass tenant host
  // resolution entirely. This keeps health checks, mobile/WS clients, deploy
  // probes, and internal rewrites on the platform host working even once
  // `SAAS_DNS_APEX` host-scoping is enforced, while unknown hosts still fail
  // closed below.
  if (config.platformHosts.has(host)) {
    return {
      classification: 'platform',
      surface: null,
      organizationId: null,
      organizationPublicRef: null,
      workspaceProjectRef: null,
      isActive: true,
      status: null,
      host,
      error: null,
    };
  }

  try {
    const scope = await resolveAuthHostScope(req);
    if (scope) {
      return {
        classification: scope.kind === 'staff' ? 'known-staff' : scope.kind === 'platform' ? 'platform' : 'known-customer',
        surface: scope.surface,
        organizationId: scope.organizationId,
        organizationPublicRef: scope.organizationPublicRef ?? null,
        workspaceProjectRef: scope.workspaceProjectRef,
        isActive: true,
        status: scope.kind === 'staff' ? 'active' : 'active',
        host,
        error: null,
      };
    }

    // No DB match — check if it looks like a platform host (superadmin apex)
    const apex = String(config.saas?.dnsApex || '').trim().toLowerCase();
    if (apex && host === `superadmin.${apex}`) {
      return {
        classification: 'platform',
        surface: 'superadmin',
        organizationId: null,
        organizationPublicRef: null,
        workspaceProjectRef: null,
        isActive: true,
        status: null,
        host,
        error: null,
      };
    }

    return {
      classification: 'unknown',
      surface: null,
      organizationId: null,
      organizationPublicRef: null,
      workspaceProjectRef: null,
      isActive: false,
      status: null,
      host,
      error: new Error('UNKNOWN_HOST'),
    };
  } catch (err) {
    return {
      classification: 'unknown',
      surface: null,
      organizationId: null,
      organizationPublicRef: null,
      workspaceProjectRef: null,
      isActive: false,
      status: null,
      host,
      error: err,
    };
  }
}

/**
 * Middleware: resolve host and attach `req.hostContext`.
 *
 * Dev hosts pass through without restriction.
 * Known hosts (platform/customer/staff) attach the resolved context.
 * Unknown hosts fail closed with 404.
 */
async function secureHostResolution(req, res, next) {
  try {
    // Health checks and static assets bypass host resolution.
    if (req.path === '/api/health' || req.path.startsWith('/api/docs')) {
      return next();
    }

    const ctx = await resolveRequestHost(req);
    req.hostContext = ctx;

    if (ctx.classification === 'unknown') {
      logger.warn('secureHostResolution rejected unknown host', {
        host: ctx.host,
        path: req.originalUrl || req.url,
        ip: req.ip,
      });
      return res.status(404).json({
        error: 'Site not found',
        code: 'UNKNOWN_HOST',
      });
    }

    // Attach convenience properties for downstream middleware
    if (ctx.organizationId) {
      req.hostOrganizationId = ctx.organizationId;
    }
    if (ctx.workspaceProjectRef) {
      req.hostWorkspaceProjectRef = ctx.workspaceProjectRef;
    }

    next();
  } catch (err) {
    logger.error('secureHostResolution unexpected error', { error: err.message });
    next(err);
  }
}

/**
 * Middleware: enforce tenant-context invariant.
 *
 * If both a host-resolved tenant (req.hostContext) and a legacy
 * `public_ref`/`projectRef` param are present, they must agree or the
 * request is rejected. This prevents a host mapped to org A from
 * silently switching to org B via URL params.
 *
 * This must run AFTER `attachProjectRef` so `req.projectRef` is set.
 */
async function enforceTenantContext(req, res, next) {
  try {
    const ctx = req.hostContext;
    if (!ctx || ctx.classification === 'dev' || ctx.classification === 'unknown') {
      return next();
    }

    // If the host resolved to an org but the URL embeds a different org,
    // reject. The host is the source of truth for the tenant boundary.
    if (ctx.organizationId && req.params?.ref) {
      try {
        const urlCtx = await resolveOrganizationContext(req.params.ref);
        if (urlCtx && String(urlCtx.organizationId) !== String(ctx.organizationId)) {
          logger.warn('enforceTenantContext rejected host/URL mismatch', {
            hostOrgId: ctx.organizationId,
            urlOrgId: urlCtx.organizationId,
            ref: req.params.ref,
            host: ctx.host,
            path: req.originalUrl || req.url,
          });
          return res.status(403).json({
            error: 'Host and organization reference do not match. Use your organization URL.',
            code: 'HOST_ORG_MISMATCH',
          });
        }
      } catch {
        // resolveOrganizationContext failed — let downstream handle it
      }
    }

    // Staff host: projectRef from host must match session projectRef
    if (ctx.classification === 'known-staff' && ctx.workspaceProjectRef && req.user?.projectRef) {
      if (String(ctx.workspaceProjectRef).toLowerCase() !== String(req.user.projectRef).toLowerCase()) {
        logger.warn('enforceTenantContext rejected host/session mismatch', {
          hostProjectRef: ctx.workspaceProjectRef,
          sessionProjectRef: req.user.projectRef,
          host: ctx.host,
          path: req.originalUrl || req.url,
        });
        return res.status(403).json({
          error: 'Host and session do not match. Use your workspace URL.',
          code: 'HOST_SESSION_MISMATCH',
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Security regression: validate host header against known attack patterns.
 * Called before `secureHostResolution` to reject obviously malicious
 * Host headers before they reach any resolver.
 */
function validateHostSecurity(req, res, next) {
  const hostHeader = String(req.headers.host || '');
  const fwdHost = String(req.headers['x-forwarded-host'] || '');

  // Reject empty/missing host (except health checks).
  if (!hostHeader && req.path !== '/api/health') {
    return res.status(400).json({ error: 'Host header required', code: 'HOST_HEADER_REQUIRED' });
  }

  // Reject protocol-injected Host headers (e.g. "http://evil.com").
  // These indicate header injection or host spoofing attempts.
  if (hostHeader && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(hostHeader)) {
    return res.status(400).json({ error: 'Invalid Host header', code: 'HOST_HEADER_PROTOCOL_FORBIDDEN' });
  }

  // Reject multiple comma-separated forwarded-host values when trust proxy is on.
  if (config.trustProxyHops > 0 && fwdHost.includes(',')) {
    logger.warn('validateHostSecurity multiple forwarded-host values', {
      host: fwdHost,
      path: req.originalUrl || req.url,
    });
  }

  // Reject overly long Host headers (potential buffer/DoS).
  const maxHostLen = 253;
  if (hostHeader.length > maxHostLen) {
    logger.warn('validateHostSecurity oversized Host header', {
      length: hostHeader.length,
      path: req.originalUrl || req.url,
    });
    return res.status(400).json({ error: 'Host header too long', code: 'HOST_HEADER_TOO_LONG' });
  }

  next();
}

module.exports = {
  extractTrustedHost,
  resolveRequestHost,
  secureHostResolution,
  enforceTenantContext,
  validateHostSecurity,
  DEV_HOSTS,
};
