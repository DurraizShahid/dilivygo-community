'use strict';

/**
 * Developer platform — trust levels, scope vocabulary, and scope enforcement.
 *
 * Phase 14 (Integration Marketplace & Developer Platform Foundations).
 * NEW FILE — nothing here is mounted; the main session wires
 * `authenticateDeveloperKey` (verify via developer-keys.service) +
 * `requireDeveloperScope(...)` onto future `/api/developer/*` routes.
 *
 * ## Trust model
 * - `first-party` — Dilivygo-owned apps/services. May hold every stable scope.
 * - `partner`     — Certified third-party integrations. May hold every stable
 *   scope, but `orders:read` and `webhooks:write` are issued only after the
 *   partner passes the certification checklist in
 *   `docs/integrations/developer-platform.md` (enforced at issuance time by
 *   the main session, not by this middleware).
 * - `custom`      — Single-organization scripts / internal tooling. Read-only:
 *   may NOT hold `webhooks:write` (a custom script must not subscribe the org
 *   to outbound event streams; use the SaaS dashboard for that).
 *
 * ## Scope vocabulary (explicit allowlist, STABLE resources only)
 * Each scope maps to already-existing, stable read routes or to the
 * automation-webhook subscription surface. Derived from:
 * - `apps/server/routes/public.routes.js` + `lib/openapi-spec.js`
 *   (tenant-scoped public reads: shops, products/categories, banners,
 *   reviews, delivery-check)
 * - `apps/server/routes/order.routes.js` (`GET /` listOrders,
 *   `GET /:id` getOrder — read-only slice)
 * - `apps/server/migrations/104_integration_webhooks.sql`
 *   (`integration_webhook_endpoints` for n8n/zapier/make — read-only
 *   reference; developer subscriptions reuse the same event vocabulary)
 *
 * Deliberately EXCLUDED (when in doubt, excluded — see EXCLUDED_SCOPES):
 * order/delivery writes, refunds, payments/payouts, customer PII writes,
 * auth/session management, rider location writes, admin settings, billing.
 *
 * ## Org enforcement shape
 * `requireDeveloperScope(...)` expects `req.developerKey` to be set by the
 * key-authentication step (see mount snippet in the Phase 14 report):
 *   req.developerKey = { keyId, appId, organizationId, trustLevel, scopes[] }
 * It then enforces: authentication present → org match (when the request
 * already resolved an org) → required scopes held.
 *
 * The middleware is a pure factory over `req`/`res`/`next` and is fully
 * unit-testable without mounting any route.
 */

const TRUST_LEVELS = Object.freeze(['first-party', 'partner', 'custom']);

/**
 * The ONLY scopes the developer platform may ever issue. Anything not in
 * this list is rejected fail-closed at issuance (`assertIssuableScopes`)
 * and at enforcement (`requireDeveloperScope` treats an unknown *required*
 * scope as a server misconfiguration, never as an allow).
 */
const DEVELOPER_SCOPES = Object.freeze([
  'orders:read', // GET /api/orders, GET /api/orders/:id (read-only slice)
  'shops:read', // GET /api/public/:ref/shops, GET .../shops/:shopId
  'menu:read', // GET .../shops/:shopId/products, .../categories
  'banners:read', // GET /api/public/banners
  'reviews:read', // GET .../shops/:shopId/reviews
  'delivery:read', // GET .../delivery-check (availability/quote reads only)
  'webhooks:read', // list automation-webhook subscriptions (n8n/zapier/make vocab)
  'webhooks:write', // create/delete automation-webhook subscriptions
]);

/** Stable source for each scope — audit trail for "derive from public/pos reads". */
const STABLE_SCOPE_SOURCES = Object.freeze({
  'orders:read': 'routes/order.routes.js: listOrders/getOrder (GET only)',
  'shops:read': 'routes/public.routes.js: listShops/shopDetail + openapi-spec.js',
  'menu:read': 'routes/public.routes.js: shopProducts/shopCategories',
  'banners:read': 'routes/public.routes.js: listActiveBanners',
  'reviews:read': 'routes/public.routes.js: shopReviews',
  'delivery:read': 'routes/public.routes.js: shopDeliveryCheck/deliveryCheck (read-only)',
  'webhooks:read': 'migrations/104_integration_webhooks.sql: endpoint vocabulary (read)',
  'webhooks:write': 'migrations/104_integration_webhooks.sql: endpoint vocabulary (subscribe)',
});

/**
 * Sensitive capabilities that MUST NOT become developer scopes without a
 * dedicated security review. Listed here so future sessions see the
 * exclusion is deliberate, not an oversight.
 */
const EXCLUDED_SCOPES = Object.freeze([
  'orders:write', // create/cancel/accept/reject/complete/status transitions
  'payments:write', // intents, captures, refunds, top-ups
  'payouts:read', // Connect transfers, earnings, bank data
  'customers:write', // PII create/update, avatar, recovery
  'deliveries:write', // assignment, location ingestion, POD
  'rider:write', // availability, online status
  'admin:write', // settings, promo codes, templates, billing
  'auth:write', // login/OTP/2FA/session issuance
]);

/**
 * Maximum scope set issuable per trust level. Issuance must always be a
 * subset of both DEVELOPER_SCOPES and the trust-level cap.
 */
const TRUST_LEVEL_SCOPES = Object.freeze({
  'first-party': DEVELOPER_SCOPES,
  'partner': DEVELOPER_SCOPES,
  'custom': Object.freeze(DEVELOPER_SCOPES.filter((s) => s !== 'webhooks:write')),
});

function developerScopeError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function isKnownTrustLevel(value) {
  return TRUST_LEVELS.includes(value);
}

function isKnownScope(value) {
  return DEVELOPER_SCOPES.includes(value);
}

/** True when every required scope is present in the granted set. */
function hasScopes(grantedScopes, requiredScopes) {
  const granted = new Set(Array.isArray(grantedScopes) ? grantedScopes : []);
  return (Array.isArray(requiredScopes) ? requiredScopes : []).every((s) => granted.has(s));
}

/** The cap for a trust level (empty frozen list for unknown levels — fail-closed). */
function scopesForTrustLevel(trustLevel) {
  return TRUST_LEVEL_SCOPES[trustLevel] || Object.freeze([]);
}

/**
 * Validate a scope grant at issuance/rotation time. Throws
 * (fail-closed) on unknown scopes or scopes above the trust-level cap.
 * Returns the deduplicated scope list.
 */
function assertIssuableScopes(scopes, trustLevel) {
  if (!isKnownTrustLevel(trustLevel)) {
    throw developerScopeError(`Unknown trust level: ${trustLevel}`, 400, 'DEVELOPER_UNKNOWN_TRUST_LEVEL');
  }
  const list = Array.isArray(scopes) ? scopes : [];
  const unknown = list.filter((s) => !isKnownScope(s));
  if (unknown.length > 0) {
    throw developerScopeError(
      `Unknown developer scope(s): ${unknown.join(', ')}`,
      400,
      'DEVELOPER_UNKNOWN_SCOPE'
    );
  }
  const cap = new Set(scopesForTrustLevel(trustLevel));
  const aboveCap = list.filter((s) => !cap.has(s));
  if (aboveCap.length > 0) {
    throw developerScopeError(
      `Scope(s) not issuable to trust level '${trustLevel}': ${aboveCap.join(', ')}`,
      403,
      'DEVELOPER_SCOPE_ABOVE_TRUST'
    );
  }
  return Object.freeze([...new Set(list)]);
}

/** Extract a `Bearer <token>` value (used by the future key-auth step). */
function extractBearerToken(req) {
  const auth = req?.headers?.authorization;
  if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

/** Resolve the already-pinned org on the request, if any (mirror of SaaS pinning). */
function resolvedRequestOrg(req) {
  return (
    req?.organizationId ||
    req?.saasOrganizationId ||
    req?.developerOrganizationId ||
    null
  );
}

/**
 * Scope-check middleware factory. NOT mounted here — the main session mounts
 * it after key authentication on future developer routes.
 *
 * Expects `req.developerKey = { keyId, appId, organizationId, trustLevel, scopes }`.
 * - no `req.developerKey` → 401 DEVELOPER_AUTH_REQUIRED
 * - key has no org, or org differs from the request org → 403
 * - a *required* scope outside DEVELOPER_SCOPES → 500
 *   DEVELOPER_SCOPE_MISCONFIGURED (route misconfiguration, fail-closed)
 * - key missing any required scope → 403 DEVELOPER_SCOPE_DENIED
 */
function requireDeveloperScope(...requiredScopes) {
  const required = requiredScopes.flat();
  return (req, res, next) => {
    const key = req?.developerKey;
    if (!key) {
      return res.status(401).json({ error: 'Developer authentication required', code: 'DEVELOPER_AUTH_REQUIRED' });
    }
    if (!key.organizationId) {
      return res.status(403).json({ error: 'Developer key has no organization scope', code: 'DEVELOPER_ORG_MISSING' });
    }
    const requestOrg = resolvedRequestOrg(req);
    if (requestOrg && String(requestOrg) !== String(key.organizationId)) {
      return res.status(403).json({ error: 'Developer key is not valid for this organization', code: 'DEVELOPER_ORG_MISMATCH' });
    }
    const misconfigured = required.filter((s) => !isKnownScope(s));
    if (misconfigured.length > 0) {
      return res.status(500).json({
        error: 'Developer route requires an unknown scope',
        code: 'DEVELOPER_SCOPE_MISCONFIGURED',
        scopes: misconfigured,
      });
    }
    const granted = Array.isArray(key.scopes) ? key.scopes : [];
    const missing = required.filter((s) => !granted.includes(s));
    if (missing.length > 0) {
      return res.status(403).json({
        error: 'Developer key lacks required scope(s)',
        code: 'DEVELOPER_SCOPE_DENIED',
        missing,
      });
    }
    return next();
  };
}

module.exports = {
  TRUST_LEVELS,
  DEVELOPER_SCOPES,
  STABLE_SCOPE_SOURCES,
  EXCLUDED_SCOPES,
  TRUST_LEVEL_SCOPES,
  isKnownTrustLevel,
  isKnownScope,
  hasScopes,
  scopesForTrustLevel,
  assertIssuableScopes,
  extractBearerToken,
  resolvedRequestOrg,
  requireDeveloperScope,
};
