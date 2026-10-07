'use strict';

const { createHash } = require('crypto');
const rateLimitPackage = require('express-rate-limit');
const rateLimit = rateLimitPackage.rateLimit || rateLimitPackage;
const ipKeyGenerator = rateLimitPackage.ipKeyGenerator || ((ip) => String(ip || 'unknown'));
const config = require('../config');
const { createRedisRateLimitStore } = require('../lib/redis-rate-limit-store');

const defaultHandler = (req, res) => {
  res.status(429).json({
    error: 'Too many requests, please try again later.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

function redisStore(prefix) {
  const store = createRedisRateLimitStore(prefix);
  return store ? { store } : {};
}

function ipKey(req) {
  return ipKeyGenerator(req.ip);
}

function opaqueRateKey(value) {
  const normalized = String(value || '').trim().toLowerCase().slice(0, 512);
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function shouldBypass(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const token = config.rateLimit.bypassToken;
  if (!token) return false;
  return req.headers['x-load-test-token'] === token;
}

/** Global safety net: intentionally per network identity. */
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.global.windowMs,
  max: config.rateLimit.global.max,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:global'),
});

function authIdentifier(req) {
  return opaqueRateKey(
    req.body?.email ||
    req.body?.phone ||
    req.body?.username ||
    req.body?.identifier ||
    '',
  );
}

/**
 * Authentication attempts are keyed by BOTH network identity and a one-way
 * digest of the account identifier. This blocks targeted brute force without
 * putting raw email/phone values into Redis keys or allowing a recipient-only
 * key to be exhausted remotely as an account lockout primitive.
 */
const authLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  keyGenerator: (req) => {
    const ident = authIdentifier(req);
    return ident ? `${ipKey(req)}:${ident}` : ipKey(req);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:auth'),
});

function authenticatedActorKey(req) {
  const actorId =
    req.customer?.id ||
    req.user?.id ||
    req.superadmin?.id ||
    req.clerkUser?.id ||
    req.auth?.userId ||
    null;
  const tenant =
    req.organizationId ||
    req.saasOrganizationId ||
    req.projectRef ||
    '_platform';
  if (actorId) return `${String(tenant)}:${String(actorId)}`;
  return `ip:${ipKey(req)}`;
}

/** Payment API work is expensive and must be limited per authenticated actor. */
const paymentLimiter = rateLimit({
  windowMs: config.rateLimit.payments.windowMs,
  max: config.rateLimit.payments.max,
  keyGenerator: authenticatedActorKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:payments'),
});

function otpScopeFromRequest(req) {
  const raw = typeof req.body?.projectRef === 'string' ? req.body.projectRef.trim() : '';
  return raw ? raw.toLowerCase() : '_marketplace';
}

/** OTP send: 3 requests per tenant+recipient digest per 15 minutes. */
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const channel = req.body?.channel || (req.body?.email ? 'email' : 'phone');
    const recipient = channel === 'email' ? req.body?.email : req.body?.phone;
    const scope = otpScopeFromRequest(req);
    const recipientKey = opaqueRateKey(recipient);
    return recipientKey
      ? `${scope}:${channel}:${recipientKey}`
      : `${scope}:${ipKey(req)}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  ...redisStore('rl:otp_send'),
});

/** SaaS-specific identity key so one office user does not throttle colleagues. */
function saasUserKey(req) {
  const clerkId = req.clerkUser?.id || req.auth?.userId || '';
  const orgId = req.saasOrganizationId || '';
  if (clerkId) return `saas:${clerkId}:${orgId}`;
  return `ip:${ipKey(req)}`;
}

const saasWsTicketLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_ws_ticket'),
});

const saasStaffInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_staff_invite'),
});

const saasBillingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_billing'),
});

/** Rare account/provisioning mutations such as workspaces, OAuth profiles, and billing setup. */
const saasProvisioningLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_provisioning'),
});

/**
 * Marketing provider operations are normal product usage, not provisioning.
 * Keep enough headroom for an active social manager while preventing an owner
 * or compromised session from burning through external provider quota.
 */
const saasMarketingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_marketing'),
});

const saasTestNotificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:saas_test_notification'),
});

const cxDistributionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: saasUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:cx_distribution'),
});

/** AI assistant: model calls are expensive, limit per authenticated actor+tenant. */
const aiLimiter = rateLimit({
  windowMs: config.rateLimit.ai.windowMs,
  max: config.rateLimit.ai.max,
  keyGenerator: authenticatedActorKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:ai'),
});

const cxPublicSubmitLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const tokenPart = req.params?.token ? String(req.params.token).slice(0, 20) : '';
    const key = opaqueRateKey(tokenPart);
    return key ? `${ipKey(req)}:${key}` : ipKey(req);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: defaultHandler,
  skip: shouldBypass,
  ...redisStore('rl:cx_public_submit'),
});

module.exports = {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  otpSendLimiter,
  aiLimiter,
  saasWsTicketLimiter,
  saasStaffInviteLimiter,
  saasBillingLimiter,
  saasProvisioningLimiter,
  saasMarketingLimiter,
  saasTestNotificationLimiter,
  cxDistributionLimiter,
  cxPublicSubmitLimiter,
  authenticatedActorKey,
  opaqueRateKey,
};
