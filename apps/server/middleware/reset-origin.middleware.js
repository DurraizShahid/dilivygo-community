'use strict';

const config = require('../config');
const { resolveAuthHostScope } = require('../lib/host-scope');
const { extractTrustedHost } = require('../lib/trusted-host');

function forwardedHost(req) {
  return extractTrustedHost(req) || '';
}

function forwardedProtocol(req) {
  const raw = req.headers['x-forwarded-proto'] || req.protocol || '';
  const proto = String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim().toLowerCase();
  return proto === 'https' ? 'https' : config.isProd ? 'https' : 'http';
}

/**
 * Replace caller-controlled Origin with a server-trusted staff application
 * origin before password-reset links are generated.
 *
 * A tenant hostname is used only after resolveAuthHostScope proves that it is
 * registered to a real Dilivygo workspace. Direct API calls fall back to the
 * tenant-verified host from hostContext (Phase 05), then to the configured
 * vendor application URL.
 */
async function pinStaffResetOrigin(req, _res, next) {
  try {
    const scope = await resolveAuthHostScope(req);
    if (scope?.kind === 'staff') {
      // Prefer the verified host from hostContext (custom domains).
      const verifiedHost = req.hostContext?.host;
      if (verifiedHost) {
        const proto = forwardedProtocol(req);
        req.headers.origin = `${proto}://${verifiedHost}`;
        return next();
      }
      const host = forwardedHost(req);
      if (host) {
        req.headers.origin = `${forwardedProtocol(req)}://${host}`;
        return next();
      }
    }

    const configured = String(config.appUrls.vendor || '').trim().replace(/\/$/, '');
    if (!configured) {
      const err = new Error('Vendor application URL is not configured for password reset');
      err.statusCode = 503;
      throw err;
    }
    req.headers.origin = configured;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { pinStaffResetOrigin };
