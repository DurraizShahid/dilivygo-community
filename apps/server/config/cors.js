'use strict';

const config = require('./index');
const { isCustomTenantHost } = require('../lib/organization-hostnames');

const SAAS_WEB_SURFACES = ['customer', 'vendor', 'rider', 'superadmin', 'pos'];
/**
 * Bare surface hosts that live directly under the apex (no tenant prefix).
 * `app.{apex}` is the SaaS control-plane dashboard; the rest are shared
 * marketing/operator shells (e.g. `superadmin.dilivygo.com`).
 */
const SAAS_BARE_SURFACES = ['app', ...SAAS_WEB_SURFACES];
const PROJECT_REF_HOST_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseOriginHost(normalizedOrigin) {
  try {
    return new URL(normalizedOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Browser origins for `{projectRef}.{surface}.{SAAS_DNS_APEX}` (e.g. helptribepk.superadmin.lvh.me:3003).
 * When SAAS_DNS_APEX is set, these are valid first-party web shells and must be CORS-allowed to the API.
 */
function isSaasTenantWebOrigin(normalizedOrigin) {
  const apex = String(config.saas?.dnsApex || '')
    .trim()
    .toLowerCase();
  if (!apex) return false;
  const host = parseOriginHost(normalizedOrigin);
  if (!host) return false;
  for (const surface of SAAS_WEB_SURFACES) {
    const suffix = `.${surface}.${apex}`;
    if (!host.endsWith(suffix)) continue;
    const ref = host.slice(0, -suffix.length);
    if (PROJECT_REF_HOST_RE.test(ref)) return true;
  }
  return false;
}

/**
 * Bare surface origins that live directly on the apex (no tenant prefix):
 *   - `app.{apex}`           — SaaS control-plane dashboard
 *   - `{surface}.{apex}`     — shared operator/customer/vendor/rider/pos shells
 *
 * These are first-party platform shells that the API must accept just like
 * tenant-scoped origins. Without this, adding a new marketing/surface host
 * would require redeploying the API with an updated `ALLOWED_ORIGINS` list.
 */
function isSaasBareSurfaceOrigin(normalizedOrigin) {
  const apex = String(config.saas?.dnsApex || '')
    .trim()
    .toLowerCase();
  if (!apex) return false;
  const host = parseOriginHost(normalizedOrigin);
  if (!host) return false;
  return SAAS_BARE_SURFACES.some((surface) => host === `${surface}.${apex}`);
}

const corsOptions = {
  origin: async (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const normalizedOrigin = String(origin).trim().toLowerCase();
    const allowed = config.cors.origins.map((o) => String(o).trim().toLowerCase());

    // In development, allow any localhost port to reduce friction across apps
    // (customer/vendor/rider/admin all run on different ports).
    if (!config.isProd) {
      const isLocalhost =
        /^https?:\/\/localhost(:\d+)?$/.test(normalizedOrigin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(normalizedOrigin);
      if (isLocalhost) return callback(null, true);
    }

    if (isSaasTenantWebOrigin(normalizedOrigin) || isSaasBareSurfaceOrigin(normalizedOrigin)) {
      return callback(null, true);
    }

    const saasAppOrigin = String(config.saas?.appOrigin || '').trim().toLowerCase();
    if (saasAppOrigin && normalizedOrigin === saasAppOrigin) {
      return callback(null, true);
    }

    if (allowed.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // Tenant custom hostnames (`organization_hostnames` for customer/rider
    // surfaces, `workspace_hostnames` for vendor/POS staff surfaces) are valid
    // first-party origins not covered by the platform subdomain patterns.
    // Fail closed: an allowlist lookup error rejects, never falls open.
    try {
      if (await isCustomTenantHost(normalizedOrigin)) {
        return callback(null, true);
      }
    } catch {
      // fall through to rejection
    }

    callback(new Error(`CORS policy: origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'If-None-Match',
    'X-Requested-With',
    'X-CSRF-Token',
    'X-Shop-Id',
    'X-Project-Ref',
    'X-Dilivygo-Actor',
  ],
  exposedHeaders: ['X-Request-Id', 'ETag'],
  maxAge: 86400, // 24h preflight cache
};

module.exports = corsOptions;
