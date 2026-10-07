'use strict';

/**
 * Transient network-failure classification.
 *
 * `fetch` (undici) collapses every socket-level problem into a single opaque
 * `TypeError: fetch failed` and hides the actionable detail in `error.cause`.
 * Left alone that surfaces as a bare HTTP 500 with no explanation, which is
 * indistinguishable from a genuine code bug. These helpers unwrap the cause so
 * callers can log the real reason and decide whether an outage is retryable.
 *
 * Transient signals (bubble up through undici's `fetch failed`):
 *   - `ConnectTimeoutError` / `SocketError` / `AbortError` (undici)
 *   - `ECONNRESET` / `ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` / `EAI_AGAIN`
 *   - Generic "fetch failed" with a network-shaped cause
 *
 * These happen whenever the dev laptop sleeps, Supabase has a brief hiccup, or
 * Railway egress flaps — reporting every occurrence to Sentry as an unhandled
 * exception buries real regressions in noise.
 */

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const TRANSIENT_NAMES = new Set(['ConnectTimeoutError', 'SocketError', 'AbortError']);

/**
 * Walk the `cause` chain looking for a network-shaped failure.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientFetchError(err) {
  const check = (e) => {
    if (!e) return false;
    if (e.code && TRANSIENT_CODES.has(e.code)) return true;
    if (e.name && TRANSIENT_NAMES.has(e.name)) return true;
    const msg = String(e.message || '');
    if (/fetch failed/i.test(msg) && e.cause) return check(e.cause);
    if (/(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Connect Timeout)/.test(msg)) {
      return true;
    }
    return false;
  };
  return check(err);
}

/**
 * Best-effort root-cause label for logs, e.g. `ECONNREFUSED`.
 *
 * @param {unknown} err
 * @returns {string} the deepest `code`/`name` found, or the error name
 */
function networkErrorCode(err) {
  let current = err;
  let fallback = null;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code) fallback = current.code;
    else if (current.name && fallback == null) fallback = current.name;
    current = current.cause;
  }
  return fallback || 'UNKNOWN';
}

module.exports = { isTransientFetchError, networkErrorCode };
