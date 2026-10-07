'use strict';

/**
 * Hostname from browser `Origin` or `Referer` (first party), for session hints.
 * @param {import('express').Request} req
 * @returns {string}
 */
function pickBrowserSiteHostname(req) {
  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();
  try {
    if (origin) return new URL(origin).hostname;
  } catch (_) {
    /* ignore */
  }
  try {
    if (referer) return new URL(referer).hostname;
  } catch (_) {
    /* ignore */
  }
  return '';
}

/**
 * True when the browser host is an org customer storefront
 * (`{slug}.customer.{SAAS_DNS_APEX}`), used to prefer `customer_session` over
 * `admin_session` when both cookies exist on the API host.
 *
 * @param {string} hostname
 * @param {string} [dnsApex]
 * @returns {boolean}
 */
function originHostLooksLikeCustomerSurface(hostname, dnsApex) {
  const h = String(hostname || '').split(':')[0].trim().toLowerCase();
  if (!h) return false;
  const apex = String(dnsApex || '').trim().toLowerCase();
  if (apex) {
    const suffix = `.customer.${apex}`;
    if (h.endsWith(suffix) && h.length > suffix.length) return true;
  }
  // Dev / tests (no apex): e.g. `brand-a.customer.test`
  if (!apex && h.includes('.customer.')) return true;
  return false;
}

module.exports = { pickBrowserSiteHostname, originHostLooksLikeCustomerSurface };
