'use strict';

const config = require('../config');
const { resolveOrganizationContext } = require('../lib/organization-context');

/**
 * Explicit tenant refs supplied by customer auth clients must resolve to a real
 * organization/workspace. Unknown refs are not silently converted into the
 * legacy global marketplace bucket.
 */
async function requireKnownCustomerOrgRef(req, res, next) {
  try {
    const raw = typeof req.body?.projectRef === 'string' ? req.body.projectRef.trim() : '';
    if (!raw) return next();
    const ctx = await resolveOrganizationContext(raw);
    if (!ctx) {
      return res.status(404).json({
        error: 'Organization not found',
        code: 'UNKNOWN_ORGANIZATION',
      });
    }
    req.customerAuthOrganizationContext = ctx;
    next();
  } catch (err) {
    next(err);
  }
}

/** Production can never use the OTP-bypassing demo login route. */
function rejectProductionDemoLogin(_req, res, next) {
  if (config.isProd) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

module.exports = { requireKnownCustomerOrgRef, rejectProductionDemoLogin };
