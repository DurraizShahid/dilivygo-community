'use strict';

/**
 * Messaging Privacy & Error Sanitizer.
 *
 * Provides:
 *   - Recipient masking (email, phone, device/push tokens).
 *   - Cryptographic SHA-256 diagnostic reference derivation.
 *   - Comprehensive provider error sanitization & length bounding.
 *
 * Guarantees:
 *   - Zero credential / secret / token leakage in diagnostic errors or responses.
 *   - Deterministic diagnostic references that do not leak correlation key fragments or PII.
 *   - Bounded error string lengths (max 2000 chars).
 */

const crypto = require('crypto');
const config = require('../config');

const LAST_ERROR_MAX = 2000;

const SENSITIVE_KEY_PATTERN = /authorization|auth|token|secret|password|api[_-]?key|credential|cookie|private[_-]?key|client[_-]?secret|webhook[_-]?secret/i;

/**
 * Mask an email address for safe operational display.
 * E.g. 'john.doe@example.com' -> 'jo***@example.com'
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) return '***';

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (local.length <= 1) {
    return `*@${domain}`;
  }
  if (local.length === 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Mask a phone number for safe operational display.
 * E.g. '+15551234567' -> '+1******4567'
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 4) return '****';
  if (trimmed.length < 8) {
    return `${trimmed[0]}***${trimmed.slice(-1)}`;
  }

  // Format: keep first 2 chars, 6 asterisks, keep last 4 chars
  const prefix = trimmed.slice(0, 2);
  const suffix = trimmed.slice(-4);
  return `${prefix}******${suffix}`;
}

/**
 * Mask a device / push token for safe operational display.
 * Completely redacts bearer-like device credentials to eliminate device addressing token leakage.
 */
function maskPushToken(token) {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (trimmed.length === 0) return null;
  return '[REDACTED_DEVICE_TOKEN]';
}

/**
 * Generate a deterministic, keyed HMAC-SHA256 diagnostic reference
 * from a message correlation key or identifier.
 *
 * Uses domain separation ('dilivygo:messaging-diagnostic-ref:v1:<identifier>')
 * and a server-side HMAC secret to prevent offline dictionary/rainbow-table
 * recovery of low-entropy identifiers (phone numbers, sequential IDs, emails).
 *
 * @param {string|number} identifier
 * @param {string} [secretOverride] - Optional secret override for testing or rotation
 * @returns {string|null}
 */
function createDiagnosticRef(identifier, secretOverride = null) {
  if (identifier === null || identifier === undefined) return null;
  const raw = String(identifier).trim();
  if (raw.length === 0) return null;

  const secret =
    secretOverride ||
    config?.messaging?.diagnosticRefSecret ||
    config?.session?.secret ||
    'dev-messaging-ref-secret-minimum-32-chars!!';
  const domainSeparated = `dilivygo:messaging-diagnostic-ref:v1:${raw}`;
  const hmac = crypto.createHmac('sha256', secret).update(domainSeparated).digest('hex');
  return `ref_${hmac.slice(0, 16)}`;
}

/**
 * Backward-compatible alias for createDiagnosticRef.
 */
function maskCorrelationKey(key, secretOverride = null) {
  return createDiagnosticRef(key, secretOverride);
}

/**
 * Deep sanitize an object or array by redacting sensitive keys and values.
 */
function deepSanitizeObject(val, depth = 0) {
  if (depth > 6 || val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => deepSanitizeObject(item, depth + 1));
  }
  const result = {};
  for (const [key, value] of Object.entries(val)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = sanitizeStringPatterns(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = deepSanitizeObject(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Redact sensitive patterns inside a string.
 */
function sanitizeStringPatterns(text) {
  if (!text || typeof text !== 'string') return '';

  let s = text;

  // 1. PEM private keys
  s = s.replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]');

  // 2. JWT tokens
  s = s.replace(/\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');

  // 3. Authorization headers (Bearer / Basic)
  s = s.replace(/Authorization:\s*(Bearer|Basic)\s+[^\s,;]+/gi, 'Authorization: $1 [REDACTED]');
  s = s.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  s = s.replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');

  // 4. URL query parameters with secrets (e.g. ?api_key=... or &token=...)
  s = s.replace(/([?&])(api[_-]?key|apiKey|token|secret|access_token|auth)=([^&\s]+)/gi, '$1$2=[REDACTED]');

  // 5. Key-value secret assignments in text or JSON fragments
  s = s.replace(
    /(api[_-]?key|apiKey|secret|token|password|credential|access_token|private_key|client_secret)\s*[:=]\s*["']?[A-Za-z0-9-_./~+]{6,}["']?/gi,
    '$1=[REDACTED]'
  );

  // 6. Cookie headers
  s = s.replace(/set-cookie:\s*[^;\r\n]+/gi, 'set-cookie: [REDACTED]');
  s = s.replace(/cookie:\s*[^;\r\n]+/gi, 'cookie: [REDACTED]');

  // 7. Mask email addresses in error messages
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => maskEmail(match));

  // 8. Mask E.164 phone numbers in error messages
  s = s.replace(/\+[1-9]\d{6,14}\b/g, (match) => maskPhone(match));

  return s;
}

/**
 * Sanitize a provider error for persistence and operational API exposure.
 *
 * Preserves:
 *   - Provider name / code / HTTP status.
 *   - Safe human-readable error descriptions.
 *
 * Redacts:
 *   - All secrets, tokens, credentials, auth headers, private keys, cookies.
 *   - Recipient PII (emails, phone numbers).
 *
 * Bounds:
 *   - Limits output length to `maxLength` (defaults to LAST_ERROR_MAX = 2000).
 */
function sanitizeProviderError(rawError, maxLength = LAST_ERROR_MAX) {
  if (rawError == null) return null;

  let text = '';

  if (typeof rawError === 'string') {
    text = sanitizeStringPatterns(rawError);
  } else if (rawError instanceof Error) {
    const parts = [];
    if (rawError.code) parts.push(`[${rawError.code}]`);
    if (rawError.statusCode || rawError.status) {
      parts.push(`(HTTP ${rawError.statusCode || rawError.status})`);
    }
    const msg = rawError.message || String(rawError);
    parts.push(sanitizeStringPatterns(msg));
    text = parts.join(' ');
  } else if (typeof rawError === 'object') {
    const sanitizedObj = deepSanitizeObject(rawError);
    if (rawError.code || rawError.message) {
      const parts = [];
      if (rawError.code) parts.push(`[${rawError.code}]`);
      if (rawError.statusCode || rawError.status) {
        parts.push(`(HTTP ${rawError.statusCode || rawError.status})`);
      }
      if (rawError.message) {
        parts.push(sanitizeStringPatterns(rawError.message));
      }
      text = parts.join(' ');
    } else {
      try {
        text = JSON.stringify(sanitizedObj);
      } catch {
        text = String(rawError);
      }
    }
  } else {
    text = sanitizeStringPatterns(String(rawError));
  }

  // Length bounding
  const limit = typeof maxLength === 'number' && maxLength > 0 ? maxLength : LAST_ERROR_MAX;
  if (text.length > limit) {
    text = text.slice(0, limit);
  }

  return text;
}

module.exports = {
  LAST_ERROR_MAX,
  maskEmail,
  maskPhone,
  maskPushToken,
  createDiagnosticRef,
  maskCorrelationKey,
  sanitizeProviderError,
  deepSanitizeObject,
};
