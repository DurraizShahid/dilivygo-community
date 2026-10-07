'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { pickBrowserSiteHostname, originHostLooksLikeCustomerSurface } = require('../lib/customer-surface-origin');
const { getAdminSession, getCustomerSession, getSuperadminSession } = require('../services/session.service');

function isSuperadminApiPath(req) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return path.startsWith('/api/superadmin');
}

/**
 * Parse session cookie and attach identity to req.
 *
 * Superadmin cookie is only preferred on `/api/superadmin/*`. Otherwise staff/customer
 * cookies win first so vendor/admin APIs work when the same browser also has a
 * `superadmin_session` (e.g. after using the platform dashboard).
 *
 * When `Authorization: Bearer` is present and verifies, it wins over admin/customer
 * cookies so customer web (JWT in localStorage + fetch) works in the same browser
 * as vendor/admin cookie sessions during local dev.
 *
 * When Bearer is absent/invalid and **both** `admin_session` and `customer_session`
 * exist (same API host, e.g. `*.railway.app`), default order would pick **staff**
 * first and break customer-only flows (support chat polling, cookie-only session).
 * Customer web and customer mobile send `X-Dilivygo-Actor: customer` on every API
 * request so we resolve **customer_session** first in that case. As a fallback,
 * when `Origin`/`Referer` is a `{slug}.customer.{SAAS_DNS_APEX}` storefront (browser
 * CORS), we also prefer the customer cookie so older bundles / proxies without the
 * header still authenticate correctly. Vendor apps omit the header and use non-customer
 * origins, so staff-first behaviour is preserved there.
 */
async function parseSession(req, res, next) {
  try {
    const superadminSid = req.cookies?.superadmin_session;
    const adminSid = req.cookies?.admin_session;
    const customerSid = req.cookies?.customer_session;
    const preferSuperadminCookie = isSuperadminApiPath(req);

    if (preferSuperadminCookie && superadminSid) {
      const session = await getSuperadminSession(superadminSid);
      if (session) {
        req.superadmin = session;
        req.superadminSessionId = superadminSid;
        return next();
      }
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, config.jwt.secret);
        if (payload.type === 'superadmin') req.superadmin = payload;
        else if (payload.type === 'admin') req.user = payload;
        else if (payload.type === 'customer') req.customer = payload;
        if (req.superadmin || req.user || req.customer) {
          return next();
        }
      } catch {
        // Invalid JWT — fall through to cookies
      }
    }

    const actorHeader = String(req.headers['x-dilivygo-actor'] || '').trim().toLowerCase();
    const siteHost = pickBrowserSiteHostname(req);
    const fromCustomerOrigin = originHostLooksLikeCustomerSurface(
      siteHost,
      config.saas?.dnsApex || ''
    );
    const preferCustomerCookie =
      !!customerSid && (actorHeader === 'customer' || fromCustomerOrigin);

    if (preferCustomerCookie) {
      const session = await getCustomerSession(customerSid);
      if (session) {
        req.customer = session;
        req.customerSessionId = customerSid;
        return next();
      }
    }

    if (adminSid) {
      const session = await getAdminSession(adminSid);
      if (session) {
        req.user = session;
        req.sessionId = adminSid;
        return next();
      }
    }

    if (customerSid) {
      const session = await getCustomerSession(customerSid);
      if (session) {
        req.customer = session;
        req.customerSessionId = customerSid;
        return next();
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function requireCustomer(req, res, next) {
  if (!req.customer) {
    return res.status(401).json({ error: 'Customer authentication required' });
  }
  next();
}

function requireAnyAuth(req, res, next) {
  if (!req.user && !req.customer) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.superadmin) {
    return res.status(401).json({ error: 'Superadmin authentication required' });
  }
  next();
}

function getCallerId(req) {
  return req.superadmin?.id || req.user?.id || req.customer?.id || null;
}

function getCallerRole(req) {
  if (req.superadmin) return 'superadmin';
  if (req.user) return req.user.role;
  if (req.customer) return 'customer';
  return null;
}

module.exports = {
  parseSession,
  requireAdmin,
  requireRole,
  requireCustomer,
  requireAnyAuth,
  requireSuperadmin,
  getCallerId,
  getCallerRole,
};
