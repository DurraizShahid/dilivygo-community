'use strict';

/**
 * CSRF Protection Middleware
 * 
 * Implements a Double-Submit Cookie pattern for CSRF protection.
 * - Generates a random CSRF token and sets it as a cookie
 * - Validates that the X-CSRF-Token header matches the cookie value
 * - Exempts safe methods (GET, HEAD, OPTIONS) and specific routes (webhooks, health check)
 */

const crypto = require('crypto');
const config = require('../config');

// Cookie settings matching auth.controller.js for cross-origin support
const CSRF_COOKIE_BASE = {
  httpOnly: false,   // Must be readable by JavaScript to send in header
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
};

// Cookie name for CSRF token
const CSRF_COOKIE_NAME = 'csrf_token';
// Header name clients must send
const CSRF_HEADER_NAME = 'x-csrf-token';

// Routes exempt from CSRF validation (use startsWith matching)
const EXEMPT_PATHS = [
  '/api/webhooks/stripe',    // Stripe uses signature verification
  '/api/webhooks/resend',    // Resend uses Svix signature verification
  '/api/webhooks/twilio',    // Twilio uses X-Twilio-Signature verification
  '/api/saas/webhooks/clerk', // Clerk uses Svix signature verification
  '/api/health',             // Health check endpoint
  '/api/public/',            // Public read-only endpoints
  '/api/geocode',            // Public geocode
  '/api/reverse-geocode',    // Public reverse geocode
  '/api/route-directions',   // Public route polyline for tracking maps
  // App-builder (Electron dev launcher) endpoints are Bearer-authed only —
  // either a Clerk JWT (issue) or an opaque app-builder session token
  // (revoke). There are no cookies involved, so CSRF protection does not
  // apply (cross-site JS cannot read the bearer to forge the request).
  '/api/app-builder/',
  // GitHub Actions → EAS build completion (Bearer `EAS_BUILD_WEBHOOK_SECRET`)
  '/api/internal/eas-build-webhook',
];

// Safe HTTP methods that don't require CSRF validation
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if the request path is exempt from CSRF validation
 */
function isExemptPath(path) {
  return EXEMPT_PATHS.some(exempt => path.startsWith(exempt));
}

/**
 * CSRF token generation middleware
 * Sets a CSRF token cookie if one doesn't exist
 */
function csrfTokenGenerator(req, res, next) {
  // Check if client already has a valid CSRF token
  let csrfToken = req.cookies[CSRF_COOKIE_NAME];
  
  // Generate new token if none exists
  if (!csrfToken) {
    csrfToken = generateToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_BASE);
  }
  
  // Attach token to request for potential use in endpoints
  req.csrfToken = csrfToken;
  
  next();
}

/**
 * CSRF validation middleware
 * Validates CSRF token for state-changing requests
 */
function csrfValidator(req, res, next) {
  // Skip validation for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }
  
  // Skip validation for exempt paths
  if (isExemptPath(req.path)) {
    return next();
  }
  
  // In test environment, allow requests with the test CSRF token
  // This enables tests to work without requiring CSRF tokens in every request
  if (process.env.NODE_ENV === 'test') {
    const headerToken = req.headers[CSRF_HEADER_NAME];
    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    // If test provides token, validate it; otherwise skip (for legacy tests)
    if (!headerToken && !cookieToken) {
      return next();
    }
  }
  
  // Get token from cookie
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  
  // Get token from header
  const headerToken = req.headers[CSRF_HEADER_NAME];
  
  // Validate tokens exist and match
  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING',
      message: 'A valid CSRF token is required for this request. Please include the X-CSRF-Token header.',
    });
  }
  
  const cookieBuf = Buffer.from(String(cookieToken), 'utf8');
  const headerBuf = Buffer.from(String(headerToken), 'utf8');
  if (cookieBuf.length !== headerBuf.length) {
    return res.status(403).json({
      error: 'CSRF token mismatch',
      code: 'CSRF_TOKEN_INVALID',
      message: 'The CSRF token provided does not match. Please refresh your token and try again.',
    });
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    return res.status(403).json({
      error: 'CSRF token mismatch',
      code: 'CSRF_TOKEN_INVALID',
      message: 'The CSRF token provided does not match. Please refresh your token and try again.',
    });
  }
  
  next();
}

/**
 * Combined CSRF middleware that handles both token generation and validation
 */
function csrfProtection(req, res, next) {
  csrfTokenGenerator(req, res, (err) => {
    if (err) return next(err);
    csrfValidator(req, res, next);
  });
}

/**
 * Endpoint handler to get the current CSRF token
 * This is useful for SPAs to fetch the token on initialization
 */
function getCsrfToken(req, res) {
  // Generate token if not present (csrfTokenGenerator already ran)
  let csrfToken = req.csrfToken || req.cookies[CSRF_COOKIE_NAME];
  
  if (!csrfToken) {
    csrfToken = generateToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_BASE);
  }
  
  res.json({ csrfToken });
}

module.exports = {
  csrfProtection,
  csrfTokenGenerator,
  csrfValidator,
  getCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
};
