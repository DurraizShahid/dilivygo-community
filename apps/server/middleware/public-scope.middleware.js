'use strict';

const { MARKETPLACE_PUBLIC_REF } = require('../lib/platform-constants');
const { resolveOrganizationContext } = require('../lib/organization-context');

async function requireKnownPublicRef(req, res, next) {
  try {
    const ref = typeof req.params?.ref === 'string' ? req.params.ref.trim() : '';
    if (!ref) return res.status(404).json({ error: 'Organization not found' });
    if (ref === MARKETPLACE_PUBLIC_REF) return next();

    const ctx = await resolveOrganizationContext(ref);
    if (!ctx) {
      return res.status(404).json({
        error: 'Organization not found',
        code: 'UNKNOWN_PUBLIC_SCOPE',
      });
    }

    // The Host header is the tenant boundary: when the request arrived on a
    // host that already resolved to a known organization, the URL ref must
    // name the same org. Prevents a `{org-a}.customer.{apex}` host from
    // silently serving org B's public scope via a crafted `ref` param.
    if (
      req.hostContext?.organizationId &&
      String(req.hostContext.organizationId) !== String(ctx.organizationId)
    ) {
      return res.status(403).json({
        error: 'Host and organization reference do not match. Use your organization URL.',
        code: 'HOST_ORG_MISMATCH',
      });
    }

    req.publicOrganizationContext = ctx;
    return next();
  } catch (err) {
    return next(err);
  }
}

function blockSensitiveLegacyPublicRead(req, res, next) {
  const table = String(req.params?.table || '').toLowerCase();
  if (table === 'orders' || table === 'deliveries') {
    return res.status(410).json({
      error: 'This legacy public endpoint is no longer available for order or delivery data',
      code: 'PUBLIC_ORDER_READ_REMOVED',
    });
  }
  return next();
}

module.exports = { requireKnownPublicRef, blockSensitiveLegacyPublicRead };
