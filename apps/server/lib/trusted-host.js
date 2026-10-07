'use strict';

const config = require('../config');
const { canonicalizeHostname } = require('./hostname-canonical');

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * Extract the trusted request host from the correct header based on the
 * configured proxy trust boundary.
 *
 * When `config.trustProxyHops > 0`, Express is already configured to
 * trust that many hops (`app.set('trust proxy', n)`), so the standard
 * `req.hostname` (which Express computes from `Host` after stripping
 * port) is trustworthy. We additionally honor `x-forwarded-host` only
 * under the same trust boundary because some load balancers set it.
 *
 * When `trustProxyHops === 0` (dev), we use only `req.headers.host`
 * and never honor `x-forwarded-host` — this prevents spoofing in dev.
 *
 * Always returns the host without port, lowercased, trailing-dot stripped.
 * Returns null on missing/empty/malformed.
 */
function extractTrustedHost(req) {
  const trustProxyHops = config.trustProxyHops;

  let raw = '';
  if (trustProxyHops > 0) {
    const fwd = req.headers['x-forwarded-host'];
    if (fwd) {
      raw = String(Array.isArray(fwd) ? fwd[0] : fwd)
        .split(',')[0]
        .trim();
    }
    if (!raw) {
      raw = String(req.headers.host || req.hostname || '').split(':')[0].trim();
    }
  } else {
    raw = String(req.headers.host || '').split(':')[0].trim();
  }

  if (!raw) return null;

  // Allow dev hosts through without canonicalization (canonicalizeHostname
  // rejects localhost because it doesn't match the hostname regex).
  const stripped = raw.replace(/\.$/, '').toLowerCase();
  if (DEV_HOSTS.has(stripped)) return stripped;

  try {
    const normalized = canonicalizeHostname(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

module.exports = { extractTrustedHost, DEV_HOSTS };