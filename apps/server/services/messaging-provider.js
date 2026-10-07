'use strict';

/**
 * Canonical messaging capability — Resend / Twilio / FCM reference implementation (Phase 06).
 *
 * Business code (including notification.service.js and the OTP flows in
 * auth.controller.js) must program against THIS interface via the thin
 * wrappers in `email.service.js` / `sms.service.js` / `push.service.js`,
 * never against `resend` / `twilio` / `firebase-admin` directly.
 *
 * Capability surface (per channel):
 *   sendEmail({ organizationId, to, subject, html, text, correlationId, template? })
 *   sendSms({ organizationId, to, body, correlationId })
 *   sendPush({ organizationId, token, title, body, data?, correlationId })
 *   sendPushBatch({ organizationId, tokens, title, body, data?, correlationId })
 *     → { providerMessageId, status: 'queued'|'sent'|'failed', raw? }
 *        ('queued' = provider accepted for async delivery — Resend email and
 *         Twilio SMS; 'sent' = provider confirmed synchronously — FCM.)
 *
 * Failure contract:
 *   - Every thrown error carries `{ statusCode, code }` (HTTP-style, same
 *     convention as services/payment-provider.js). Permanent validation
 *     failures are 4xx; transport/outage failures are 5xx/503.
 *   - `isRetryable(err)` classifies permanent-vs-transient: 429/5xx/network/
 *     unknown → retryable; other 4xx + known-permanent provider codes (Twilio
 *     21211/21610/21614/21408/20003, FCM unregistered/invalid-registration)
 *     → permanent. Unknown errors default to retryable, matching
 *     lib/external-retry.js `shouldRetryHttpStatus`.
 *   - Invalid FCM tokens surface the special code `PUSH_INVALID_TOKEN`
 *     (never retried; the push wrapper removes the token — existing behavior).
 *
 * Idempotency / OTP safety:
 *   - Every send takes an explicit `correlationId`. When omitted, a stable
 *     key is derived from (channel, recipient digest, content digest, 15-min
 *     window) — identical retries of the same logical message within one OTP
 *     rate-limit window share a key, so queue/process retries cannot
 *     double-send, while a genuinely new OTP code (different content) yields
 *     a new key and still delivers. OTP callers SHOULD pass an explicit
 *     `otp:{org}:{channel}:{recipient-digest}:{window}` key (see
 *     `buildOtpCorrelationKey`) once controllers are touched — auth.controller
 *     is out of scope for this phase, so the derived default applies today.
 *   - Duplicate suppression is two-layer: (1) in-memory recent-success cache
 *     (same process, 15-min TTL, success results only — failures are never
 *     cached so legitimate retries still send); (2) `message_deliveries`
 *     pre-check + UNIQUE(correlation_key) for cross-process safety. Layer 2
 *     degrades silently when the table is missing (migration 115 unapplied):
 *     the send still proceeds, layer 1 still protects the process.
 *   - NOTE: the installed Resend SDK (v3 `CreateEmailRequestOptions`) exposes
 *     no idempotency-key option, and Twilio SMS has no provider-side send
 *     idempotency — there is intentionally NO provider-native dedupe here.
 *     Do not invent SDK options; the correlation-key layers above are the
 *     duplicate-safety mechanism.
 *
 * Delivery records:
 *   - Every adapter outcome best-effort writes a `message_deliveries` row
 *     (migration 115): provider, provider_message_id, status, attempts,
 *     truncated last_error. Writes NEVER fail the send — they warn and
 *     continue, and tolerate a missing table (pre-migration deploy order).
 *   - Retries inside one send collapse into a single row (attempts counter).
 *
 * Provider health (honest, in-memory):
 *   - `getProviderHealth()` reports per channel
 *     `{ provider, configured, status, lastSuccessAt, lastFailureAt,
 *        lastErrorCode, consecutiveFailures }` where status is one of
 *     'unconfigured' | 'unknown' | 'healthy' | 'degraded' | 'down'.
 *   - A configured-but-never-used channel reports 'unknown' — NEVER healthy
 *     without a real successful send. 'degraded' after any recent failure,
 *     'down' after 5 consecutive failures.
 *
 * Fallback routing policy (explicit, no silent double-send):
 *   - Per-channel single primary: email → Resend, SMS → Twilio, push → FCM.
 *     There is NO automatic cross-provider failover: no secondary email/SMS
 *     provider is configured, and automatic re-send through a different
 *     provider is not provably duplicate-safe, so it is doc-only.
 *   - Manual failover: rotate `EMAIL_API_KEY` / `TWILIO_*` /
 *     `FIREBASE_SERVICE_ACCOUNT_JSON` and redeploy; in-flight 'queued'
 *     messages remain provider-side. Provider outage surfaces as 503
 *     `{statusCode, code}` errors plus 'degraded'/'down' health — operators
 *     fail over deliberately, never implicitly.
 *
 * PII discipline: phone numbers, email addresses, and message bodies NEVER
 * reach logs — only channel, correlationKey, provider ids, status codes, and
 * error codes. Recipient identity inside correlation keys is a one-way
 * SHA-256 digest, safe to log.
 *
 * Secrets: EMAIL_API_KEY / TWILIO_* / FIREBASE_SERVICE_ACCOUNT_JSON /
 * RESEND_WEBHOOK_SECRET stay server-only (config/process.env). Never logged,
 * never returned in results (`raw` carries provider ids only).
 *
 * Env vars (all pre-existing except the last):
 *   EMAIL_PROVIDER= resend (only implemented provider) | EMAIL_API_KEY |
 *   EMAIL_FROM_ADDRESS | TWILIO_ACCOUNT_SID | TWILIO_AUTH_TOKEN |
 *   TWILIO_PHONE_NUMBER | FIREBASE_SERVICE_ACCOUNT_JSON |
 *   RESEND_WEBHOOK_SECRET (NEW — Svix endpoint secret for the delivery/
 *   bounce/complaint callback in controllers/messaging-webhook.controller.js).
 */

const crypto = require('crypto');

const config = require('../config');
const logger = require('../lib/logger');
const { retryExternal } = require('../lib/external-retry');
const { sanitizeProviderError, LAST_ERROR_MAX } = require('../lib/messaging-sanitizer');

// ─── Error contract ───────────────────────────────────────────────────────────

function messagingError(message, { statusCode = 502, code = 'MESSAGING_PROVIDER_ERROR' } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** Ensure every thrown error carries `{ statusCode, code }` (never PII). */
function normalizeMessagingError(err, fallbackCode = 'MESSAGING_PROVIDER_ERROR') {
  if (err && typeof err.statusCode === 'number' && typeof err.code === 'string') return err;
  const statusCode = (err && (err.status ?? err.statusCode)) || 502;
  const code = (err && typeof err.code === 'string' && err.code) || fallbackCode;
  const wrapped = new Error((err && err.message) || 'Messaging provider call failed');
  wrapped.statusCode = typeof statusCode === 'number' ? statusCode : 502;
  wrapped.code = code;
  // Preserve a numeric provider code (e.g. raw Twilio SDK `code`) for
  // classification without overloading the string `code` contract.
  const providerCode = providerCodeOf(err);
  if (providerCode !== null) wrapped.providerCode = providerCode;
  if (err && err.stack) wrapped.stack = err.stack;
  return wrapped;
}

// ─── Failure classification ───────────────────────────────────────────────────

/**
 * Twilio API error codes that are permanent for the (account, recipient)
 * pair — retrying the identical request cannot succeed. Non-exhaustive;
 * HTTP status takes precedence when present. Source: Twilio REST API error
 * dictionary (stable, long-lived codes).
 */
const PERMANENT_TWILIO_CODES = new Set([
  20003, // Authentication error (bad credentials — fix config, don't retry)
  21211, // Invalid 'To' phone number
  21610, // Recipient unsubscribed / blacklisted
  21614, // 'To' is not a valid mobile number
  21408, // SMS not enabled for the destination region on this account
]);

/** FCM codes meaning the registration token is dead — remove, don't retry. */
const INVALID_PUSH_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

/** FCM codes that are transient even though they carry no HTTP status. */
const TRANSIENT_PUSH_CODES = new Set([
  'messaging/unavailable',
  'messaging/internal-error',
  'messaging/server-timeout',
]);

function providerCodeOf(err) {
  if (!err || typeof err !== 'object') return null;
  if (typeof err.providerCode === 'number') return err.providerCode;
  if (typeof err.twilioCode === 'number') return err.twilioCode;
  // Raw Twilio SDK errors carry the numeric API code in `code`.
  if (typeof err.code === 'number') return err.code;
  return null;
}

function httpStatusOf(err) {
  if (!err || typeof err !== 'object') return null;
  const s = err.status ?? err.statusCode;
  if (typeof s === 'number') return s;
  // Some SDKs put the numeric HTTP status in `code`.
  if (typeof err.code === 'number' && err.code >= 100 && err.code < 600) return err.code;
  return null;
}

/**
 * True when the registration token is dead. Checks both top-level and
 * per-response (`sendEachForMulticast` response `error`) shapes.
 */
function isInvalidPushToken(err) {
  if (!err || typeof err !== 'object') return false;
  if (INVALID_PUSH_TOKEN_CODES.has(err.code)) return true;
  if (INVALID_PUSH_TOKEN_CODES.has(err?.error?.code)) return true;
  if (err.code === 'PUSH_INVALID_TOKEN') return true;
  return false;
}

/**
 * Permanent-vs-transient classification. Retryable: 429, 5xx, network/
 * unknown failures (ECONNRESET, ETIMEDOUT, EAI_AGAIN, socket hang up…),
 * transient FCM codes. Permanent: other 4xx, known-permanent Twilio codes,
 * invalid FCM tokens.
 */
function isRetryable(err) {
  if (!err) return false;
  if (isInvalidPushToken(err)) return false;
  if (err.code === 'PUSH_INVALID_TOKEN') return false;
  const twilioCode = providerCodeOf(err);
  if (twilioCode !== null && PERMANENT_TWILIO_CODES.has(twilioCode)) return false;
  if (err.code && TRANSIENT_PUSH_CODES.has(err.code)) return true;
  const status = httpStatusOf(err);
  if (status === null) return true; // unknown/network failure — retryable by convention
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status >= 400) return false;
  return true;
}

/**
 * p-retry v6 invokes `shouldRetry`/`onFailedAttempt` with the thrown error
 * itself (a FailedAttemptError: the error plus `attemptNumber`/`retriesLeft`
 * fields) — NOT a `{ error }` context object. This extractor accepts both
 * shapes so the predicate stays correct regardless of which convention the
 * retry wrapper forwards.
 */
function retryErrorOf(ctx) {
  if (ctx && typeof ctx === 'object' && ctx.error instanceof Error) return ctx.error;
  if (ctx && typeof ctx === 'object' && ctx.error && typeof ctx.error === 'object') return ctx.error;
  return ctx;
}

function shouldRetryMessaging(ctx) {
  return isRetryable(retryErrorOf(ctx));
}

// ─── Correlation keys / idempotency ───────────────────────────────────────────

/** Idempotency window: matches the OTP rate-limit window (15 min). */
const IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000;
const CORRELATION_KEY_MAX = 255;

/** Default retry lease duration: 60s is appropriate for provider HTTP calls with retries. */
const RETRY_LEASE_DURATION_MS = 60 * 1000;
let _currentLeaseDurationMs = RETRY_LEASE_DURATION_MS;

function _setRetryLeaseDurationMs(ms) {
  _currentLeaseDurationMs = ms;
}

function _getRetryLeaseDurationMs() {
  return _currentLeaseDurationMs;
}

function generateWorkerId() {
  return `${process.pid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
}

function shaHex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Current window bucket — same logical message in one window shares a key. */
function currentWindow() {
  return Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
}

function recipientDigest(recipient) {
  return shaHex(String(recipient).trim().toLowerCase()).slice(0, 32);
}

/**
 * Stable default key when the caller passes no explicit correlationId:
 * same channel + same recipient + same content within one window → same key
 * (queue retries can't double-send); any new content (e.g. a fresh OTP code)
 * → new key (still delivers). Recipient is a one-way digest — safe to log.
 */
function deriveCorrelationKey({ channel, recipient, fingerprint }) {
  const contentDigest = shaHex(String(fingerprint ?? '')).slice(0, 32);
  return `${channel}:${recipientDigest(recipient)}:${contentDigest}:${currentWindow()}`;
}

/**
 * Explicit OTP key shape `otp:{org}:{channel}:{recipient-digest}:{window}`.
 * Controllers SHOULD pass this once they are touched; until then the derived
 * default above applies. Exported for that follow-up and for tests.
 */
function buildOtpCorrelationKey({ organizationId = null, channel, recipient }) {
  if (!channel || !recipient) {
    throw messagingError('buildOtpCorrelationKey requires channel and recipient', {
      statusCode: 400,
      code: 'MESSAGING_INVALID_CORRELATION',
    });
  }
  const org = organizationId ? String(organizationId) : 'platform';
  return `otp:${org}:${channel}:${recipientDigest(recipient)}:${currentWindow()}`;
}

function resolveCorrelationKey(explicit, derived) {
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().slice(0, CORRELATION_KEY_MAX);
  }
  return derived;
}

// In-memory recent-success cache: same-process duplicate suppression even
// when `message_deliveries` is unavailable. Successes only — failures are
// never cached so legitimate retries still send. Bounded + TTL'd.
const _recentSends = new Map();
const RECENT_SENDS_MAX = 1000;

function rememberSend(correlationKey, result) {
  try {
    if (_recentSends.size >= RECENT_SENDS_MAX) {
      const oldest = _recentSends.keys().next().value;
      _recentSends.delete(oldest);
    }
    _recentSends.set(correlationKey, {
      result,
      expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS,
    });
  } catch {
    // Cache is best-effort; never fail a send on it.
  }
}

function recallSend(correlationKey) {
  try {
    const entry = _recentSends.get(correlationKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      _recentSends.delete(correlationKey);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

/** Test hook: clear the in-memory dedupe cache between cases. */
function _clearRecentSends() {
  _recentSends.clear();
}

// ─── Delivery records (best-effort, never throw) ──────────────────────────────

function truncateLastError(value) {
  return sanitizeProviderError(value, LAST_ERROR_MAX);
}

async function findDeliveryByCorrelationKey(correlationKey) {
  try {
    const { select } = require('../lib/supabase');
    const rows = await select('message_deliveries', {
      select: 'id,organization_id,channel,correlation_key,provider,provider_message_id,status,attempts,last_error,retry_started_at,retry_lease_expires_at,retry_owner',
      filters: { correlation_key: correlationKey },
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch {
    // Table missing (migration 115 unapplied) or DB down: degrade to
    // send-through; the in-memory cache still protects this process.
    return null;
  }
}

/**
 * Atomically claim delivery ownership before external provider execution.
 *
 * Scenarios:
 * 1. Existing row is sent/queued -> returns claimed: false, duplicate suppression.
 * 2. Existing row is retrying with active lease -> returns claimed: false, duplicate suppression.
 * 3. Existing row is retrying with expired lease -> CAS update to reclaim lease.
 * 4. Existing row is failed -> CAS update failed -> retrying to claim.
 * 5. No existing row -> atomic INSERT of claim row. If 409 conflict, inspect winning row.
 */
async function claimDeliveryOwnership({
  organizationId = null,
  channel,
  correlationKey,
  provider,
  workerId,
  leaseMs = _getRetryLeaseDurationMs(),
}) {
  const { select, insert, update } = require('../lib/supabase');
  const now = new Date();
  const retryStartedAt = now.toISOString();
  const retryLeaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();

  // 1. Check existing row by correlationKey
  let existing = null;
  try {
    existing = await findDeliveryByCorrelationKey(correlationKey);
  } catch {
    existing = null;
  }

  // 2. Row exists in durable ledger:
  if (existing && existing.status) {
    // A. Terminal success or queued: duplicate suppression
    if (existing.status === 'sent' || existing.status === 'queued') {
      return { claimed: false, reason: 'duplicate', current: existing };
    }

    // B. Retrying with active lease: suppress duplicate attempt
    if (existing.status === 'retrying') {
      const expiresAtMs = existing.retry_lease_expires_at
        ? new Date(existing.retry_lease_expires_at).getTime()
        : 0;
      if (expiresAtMs > now.getTime()) {
        return { claimed: false, reason: 'active_lease', current: existing };
      }

      // Expired lease: atomic CAS reclamation
      const patch = {
        provider,
        status: 'retrying',
        retry_started_at: retryStartedAt,
        retry_lease_expires_at: retryLeaseExpiresAt,
        retry_owner: workerId,
        updated_at: retryStartedAt,
      };
      try {
        const filter = {
          id: existing.id,
          status: 'retrying',
        };
        if (existing.retry_lease_expires_at) {
          filter.retry_lease_expires_at = existing.retry_lease_expires_at;
        }
        const updated = await update('message_deliveries', patch, filter);
        const didUpdate = Array.isArray(updated)
          ? updated.length > 0
          : Boolean(updated && Object.keys(updated).length > 0);
        if (didUpdate) {
          return {
            claimed: true,
            reason: 'recovered_expired_lease',
            current: Array.isArray(updated) ? updated[0] : { ...existing, ...patch },
          };
        }
      } catch (err) {
        logger.warn('messaging retry claim of expired lease failed', { id: existing.id, error: err.message });
      }

      const raced = await findDeliveryByCorrelationKey(correlationKey);
      return { claimed: false, reason: 'race_lost', current: raced || existing };
    }

    // C. Failed delivery: atomic CAS claim failed -> retrying
    if (existing.status === 'failed') {
      const patch = {
        provider,
        status: 'retrying',
        retry_started_at: retryStartedAt,
        retry_lease_expires_at: retryLeaseExpiresAt,
        retry_owner: workerId,
        updated_at: retryStartedAt,
      };
      try {
        const updated = await update('message_deliveries', patch, {
          id: existing.id,
          status: 'failed',
        });
        const didUpdate = Array.isArray(updated)
          ? updated.length > 0
          : Boolean(updated && Object.keys(updated).length > 0);
        if (didUpdate) {
          return {
            claimed: true,
            reason: 'retry_claim',
            current: Array.isArray(updated) ? updated[0] : { ...existing, ...patch },
          };
        }
      } catch (err) {
        logger.warn('messaging retry claim of failed delivery failed', { id: existing.id, error: err.message });
      }

      const raced = await findDeliveryByCorrelationKey(correlationKey);
      return { claimed: false, reason: 'race_lost', current: raced || existing };
    }

    return { claimed: false, reason: 'unknown_status', current: existing };
  }

  // 3. First send (no existing row found): atomic initial INSERT of claim row
  const claimId = crypto.randomUUID();
  const claimRow = {
    id: claimId,
    ...baseDeliveryRow({ organizationId, channel, correlationKey, provider }),
    status: 'retrying',
    attempts: 0,
    retry_started_at: retryStartedAt,
    retry_lease_expires_at: retryLeaseExpiresAt,
    retry_owner: workerId,
  };

  try {
    const inserted = await insert('message_deliveries', [claimRow]);
    const row = Array.isArray(inserted) && inserted.length > 0 && inserted[0] && inserted[0].id
      ? inserted[0]
      : { ...claimRow, ...(inserted && inserted[0] ? inserted[0] : {}) };
    return {
      claimed: true,
      reason: 'initial_claim',
      current: row,
    };
  } catch (err) {
    const isConflict = err && (err.status === 409 || err.statusCode === 409 || (err.message && err.message.includes('unique')));
    if (!isConflict) {
      // Missing table or DB unavailable: fallback non-blocking
      logger.warn('message_deliveries initial claim insert failed (non-blocking fallback)', {
        correlationKey,
        error: err && err.message ? truncateLastError(err.message) : String(err),
      });
      return {
        claimed: true,
        reason: 'storage_unavailable_fallback',
        current: null,
      };
    }

    // 409 Conflict: concurrent worker won insert
    logger.info('messaging initial claim insert conflict (concurrent worker won insert)', { correlationKey });
    const raced = await findDeliveryByCorrelationKey(correlationKey);
    if (!raced) {
      return { claimed: false, reason: 'conflict_not_found', current: null };
    }
    if (raced.status === 'sent' || raced.status === 'queued') {
      return { claimed: false, reason: 'duplicate', current: raced };
    }
    if (raced.status === 'retrying') {
      const expiresAtMs = raced.retry_lease_expires_at ? new Date(raced.retry_lease_expires_at).getTime() : 0;
      if (expiresAtMs > now.getTime()) {
        return { claimed: false, reason: 'active_lease', current: raced };
      }
    }
    if (raced.status === 'failed') {
      const patch = {
        provider,
        status: 'retrying',
        retry_started_at: retryStartedAt,
        retry_lease_expires_at: retryLeaseExpiresAt,
        retry_owner: workerId,
        updated_at: retryStartedAt,
      };
      try {
        const updated = await update('message_deliveries', patch, {
          id: raced.id,
          status: 'failed',
        });
        const didUpdate = Array.isArray(updated)
          ? updated.length > 0
          : Boolean(updated && Object.keys(updated).length > 0);
        if (didUpdate) {
          return {
            claimed: true,
            reason: 'retry_claim_after_409',
            current: Array.isArray(updated) ? updated[0] : { ...raced, ...patch },
          };
        }
      } catch (err) {
        logger.warn('messaging retry claim after 409 failed', { id: raced.id, error: err.message });
      }
    }
    return { claimed: false, reason: 'race_lost', current: raced };
  }
}

/**
 * Reconcile delivery outcome after external provider execution.
 * Releases the retry lease and transitions status to sent, queued, or failed.
 */
async function reconcileClaimOutcome({
  claim,
  workerId,
  organizationId,
  channel,
  correlationKey,
  provider,
  status,
  providerMessageId = null,
  attempts = 1,
  lastError = null,
}) {
  const { select, update } = require('../lib/supabase');
  const now = new Date().toISOString();

  // If storage was unavailable during claim, fallback to best-effort record
  if (!claim || !claim.id) {
    return await recordOrReconcileDelivery({
      existing: null,
      organizationId,
      channel,
      correlationKey,
      provider,
      status,
      providerMessageId,
      attempts,
      lastError,
    });
  }

  const prevAttempts = (Number.isInteger(claim.attempts) ? claim.attempts : 0);
  const totalAttempts = Math.max(1, prevAttempts + attempts);

  const patch = {
    provider,
    provider_message_id: providerMessageId ? String(providerMessageId) : null,
    status,
    attempts: totalAttempts,
    last_error: status === 'failed' ? truncateLastError(lastError) : null,
    retry_started_at: null,
    retry_lease_expires_at: null,
    retry_owner: null,
    updated_at: now,
  };
  if (status === 'sent') {
    patch.delivered_at = now;
  }

  // CAS update: row must still be in 'retrying' state and owned by this worker
  try {
    const updated = await update('message_deliveries', patch, {
      id: claim.id,
      status: 'retrying',
      retry_owner: workerId,
    });
    const didUpdate = Array.isArray(updated)
      ? updated.length > 0
      : Boolean(updated && Object.keys(updated).length > 0);
    if (didUpdate) {
      return Array.isArray(updated) ? updated[0] : { ...claim, ...patch };
    }
  } catch (err) {
    logger.warn('reconcileClaimOutcome update error (non-blocking)', {
      id: claim.id,
      correlationKey,
      error: err && err.message ? truncateLastError(err.message) : String(err),
    });
  }

  // CAS update missed (e.g. lease expired and stolen by another worker, or already completed).
  // Check current status: NEVER downgrade sent/queued to failed!
  try {
    const rows = await select('message_deliveries', {
      select: 'id,status,retry_owner',
      filters: { id: claim.id },
      limit: 1,
    });
    if (rows && rows[0]) {
      const current = rows[0];
      if (current.status === 'sent' || current.status === 'queued') {
        logger.info('message_deliveries outcome ignored: already succeeded/queued', { id: claim.id, status: current.status });
        return current;
      }
    }
  } catch {
    // Ignore re-read failure
  }
  return null;
}

async function recordOrReconcileDelivery({
  existing = null,
  organizationId = null,
  channel,
  correlationKey,
  provider,
  status,
  providerMessageId = null,
  attempts = 1,
  lastError = null,
}) {
  const { select, insert, update } = require('../lib/supabase');
  const MAX_CAS_RETRIES = 3;

  if (existing && existing.id) {
    let current = existing;
    for (let i = 0; i < MAX_CAS_RETRIES; i++) {
      // If the row was concurrently transitioned to queued or sent, preserve that success
      if (current.status === 'sent' || current.status === 'queued') {
        logger.info('message_deliveries retry reconciliation: row already active/successful', {
          id: current.id,
          status: current.status,
          correlationKey,
        });
        return current;
      }

      const prevAttempts = (Number.isInteger(current.attempts) ? current.attempts : 0);
      const totalAttempts = prevAttempts + attempts;

      const patch = {
        provider,
        provider_message_id: providerMessageId ? String(providerMessageId) : null,
        status,
        attempts: totalAttempts,
        last_error: status === 'failed' ? truncateLastError(lastError) : null,
        updated_at: new Date().toISOString(),
      };

      try {
        const updated = await update('message_deliveries', patch, {
          id: current.id,
          status: current.status,
        });
        const didUpdate = Array.isArray(updated)
          ? updated.length > 0
          : Boolean(updated && Object.keys(updated).length > 0);
        if (didUpdate) {
          return Array.isArray(updated) ? updated[0] : { ...current, ...patch };
        }
      } catch (err) {
        logger.warn('message_deliveries retry update failed (non-blocking)', {
          id: current.id,
          correlationKey,
          error: err && err.message ? truncateLastError(err.message) : String(err),
        });
        return null;
      }

      // CAS missed — status or row changed concurrently. Re-read by id.
      try {
        const rows = await select('message_deliveries', {
          select: 'id,organization_id,channel,correlation_key,provider,provider_message_id,status,attempts,last_error',
          filters: { id: current.id },
          limit: 1,
        });
        if (!rows || rows.length === 0) {
          break;
        }
        current = rows[0];
      } catch {
        break;
      }
    }
    return null;
  }

  // First attempt (no existing row observed): attempt normal INSERT
  const row = {
    ...baseDeliveryRow({ organizationId, channel, correlationKey, provider }),
    provider_message_id: providerMessageId ? String(providerMessageId) : null,
    status,
    attempts,
    last_error: status === 'failed' ? truncateLastError(lastError) : null,
  };

  try {
    const inserted = await insert('message_deliveries', [row]);
    return Array.isArray(inserted) ? inserted[0] : (inserted || row);
  } catch (err) {
    const conflict = err && (err.status === 409 || err.statusCode === 409);
    if (!conflict) {
      logger.warn('message_deliveries record failed (non-blocking)', {
        channel,
        correlationKey,
        status,
        error: err && err.message ? truncateLastError(err.message) : String(err),
      });
      return null;
    }

    // 409 = UNIQUE(correlation_key) conflict from a concurrent insert race.
    // Query the winning row: if it is failed, reconcile it with our result!
    logger.info('message_deliveries duplicate insert conflict (reconciling)', {
      channel,
      correlationKey,
      status,
    });

    try {
      const racedExisting = await findDeliveryByCorrelationKey(correlationKey);
      if (racedExisting && racedExisting.status === 'failed') {
        return await recordOrReconcileDelivery({
          existing: racedExisting,
          organizationId,
          channel,
          correlationKey,
          provider,
          status,
          providerMessageId,
          attempts,
          lastError,
        });
      }
      return racedExisting;
    } catch {
      return null;
    }
  }
}

async function recordDelivery(row, existing = null) {
  return recordOrReconcileDelivery({
    existing,
    organizationId: row.organization_id || null,
    channel: row.channel,
    correlationKey: row.correlation_key,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id || null,
    attempts: row.attempts || 1,
    lastError: row.last_error || null,
  });
}

async function updateDeliveryStatus({ correlationKey = null, providerMessageId = null, status, lastError = null }) {
  // Never issue an unscoped UPDATE (empty filters would touch every row).
  if (!correlationKey && !providerMessageId) return false;
  try {
    const { select, update } = require('../lib/supabase');
    const filters = correlationKey ? { correlation_key: correlationKey } : { provider_message_id: providerMessageId };

    // Terminal & out-of-order safety: inspect current row state if present
    let current = null;
    try {
      const rows = await select('message_deliveries', {
        select: 'id,status,last_error',
        filters,
        limit: 1,
      });
      current = (rows && rows[0]) || null;
    } catch {
      // Degrade gracefully if select fails or table is unavailable
      current = null;
    }

    if (current && current.status) {
      const currentStatus = current.status;
      // 1. Never downgrade terminal states (sent or failed) to queued
      if ((currentStatus === 'sent' || currentStatus === 'failed') && status === 'queued') {
        logger.info('message_deliveries update ignored: terminal downgrade to queued blocked', {
          currentStatus,
          incomingStatus: status,
          correlationKey,
          providerMessageId,
        });
        return true;
      }
      // 2. Preserve terminal failure over late sent
      if (currentStatus === 'failed' && status === 'sent') {
        logger.info('message_deliveries update ignored: late sent after terminal failure blocked', {
          correlationKey,
          providerMessageId,
        });
        return true;
      }
    }

    const patch = {
      status,
      last_error: lastError ? truncateLastError(lastError) : (status === 'sent' ? null : (current ? current.last_error : null)),
      updated_at: new Date().toISOString(),
    };
    if (correlationKey) {
      await update('message_deliveries', patch, { correlation_key: correlationKey });
    } else if (providerMessageId) {
      await update('message_deliveries', patch, { provider_message_id: providerMessageId });
    }
    return true;
  } catch (err) {
    logger.warn('message_deliveries update failed (non-blocking)', {
      status: status || null,
      error: err && err.message ? truncateLastError(err.message) : String(err),
    });
    return false;
  }
}

async function applyProviderDeliveryStatus({ provider, providerMessageId, status, lastError = null }) {
  if (!provider || typeof provider !== 'string' || !provider.trim()) {
    const err = new Error('provider is required');
    err.statusCode = 400;
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  if (!providerMessageId || typeof providerMessageId !== 'string' || !providerMessageId.trim()) {
    const err = new Error('providerMessageId is required');
    err.statusCode = 400;
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  const CANONICAL_DELIVERY_STATUSES = ['queued', 'sent', 'failed'];
  if (!status || !CANONICAL_DELIVERY_STATUSES.includes(status)) {
    const err = new Error(`Invalid delivery status: ${status}. Expected one of: ${CANONICAL_DELIVERY_STATUSES.join(', ')}`);
    err.statusCode = 400;
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  const { select, update } = require('../lib/supabase');
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedMessageId = providerMessageId.trim();

  // Query message_deliveries using BOTH provider and provider_message_id with limit 2
  const rows = await select('message_deliveries', {
    select: 'id,status,last_error',
    filters: {
      provider: normalizedProvider,
      provider_message_id: normalizedMessageId,
    },
    limit: 2,
  });

  if (!rows || rows.length === 0) {
    return { matched: false };
  }

  if (rows.length > 1) {
    const err = new Error(`Ambiguous provider message ID: multiple rows found for provider ${normalizedProvider} and ID ${normalizedMessageId}`);
    err.code = 'MESSAGE_DELIVERY_PROVIDER_ID_AMBIGUOUS';
    err.statusCode = 500;
    throw err;
  }

  let currentRow = rows[0];

  function isBlockedDeliveryTransition(currentStatus, targetStatus) {
    if ((currentStatus === 'sent' || currentStatus === 'failed') && targetStatus === 'queued') {
      return true;
    }
    if (currentStatus === 'failed' && targetStatus === 'sent') {
      return true;
    }
    return false;
  }

  const MAX_CAS_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const currentStatus = currentRow.status;

    // Blocked transitions: safely ignore
    if (isBlockedDeliveryTransition(currentStatus, status)) {
      logger.info('message_deliveries callback transition blocked (safe ignore)', {
        id: currentRow.id,
        currentStatus,
        targetStatus: status,
        provider: normalizedProvider,
        providerMessageId: normalizedMessageId,
      });
      return { matched: true, applied: false, status: currentStatus };
    }

    // Requested state already satisfied (e.g. duplicate sent -> sent, failed -> failed, queued -> queued)
    if (currentStatus === status) {
      return { matched: true, applied: false, status: currentStatus, idempotent: true };
    }

    const patch = {
      status,
      last_error: status === 'failed'
        ? (lastError ? truncateLastError(lastError) : (currentRow.last_error || null))
        : (status === 'sent' ? null : currentRow.last_error),
      updated_at: new Date().toISOString(),
    };

    // Strict CAS update: predicate must include BOTH id and currentStatus
    const updated = await update('message_deliveries', patch, {
      id: currentRow.id,
      status: currentStatus,
    });

    const didUpdate = Array.isArray(updated) ? updated.length > 0 : Boolean(updated && Object.keys(updated).length > 0);
    if (didUpdate) {
      const updatedRow = Array.isArray(updated) ? updated[0] : (updated || { ...currentRow, ...patch });
      return {
        matched: true,
        applied: true,
        status,
        row: updatedRow,
      };
    }

    // CAS missed — status changed concurrently. Re-read by id.
    const reReadRows = await select('message_deliveries', {
      select: 'id,status,last_error',
      filters: { id: currentRow.id },
      limit: 1,
    });

    if (!reReadRows || reReadRows.length === 0) {
      return { matched: false };
    }

    currentRow = reReadRows[0];
  }

  const casErr = new Error(`CAS update failed after ${MAX_CAS_ATTEMPTS} attempts for message_deliveries id ${currentRow.id}`);
  casErr.statusCode = 500;
  casErr.code = 'MESSAGE_DELIVERY_CAS_EXHAUSTED';
  throw casErr;
}

function baseDeliveryRow({ organizationId, channel, correlationKey, provider }) {
  return {
    organization_id: organizationId || null,
    channel,
    correlation_key: correlationKey || null,
    provider,
    provider_message_id: null,
    status: 'queued',
    attempts: 1,
    last_error: null,
  };
}

// ─── Provider health (in-memory, honest) ──────────────────────────────────────

const _health = {
  email: { provider: 'resend', lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, consecutiveFailures: 0 },
  sms: { provider: 'twilio', lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, consecutiveFailures: 0 },
  push: { provider: 'fcm', lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, consecutiveFailures: 0 },
};

const DOWN_AFTER_CONSECUTIVE_FAILURES = 5;

function markSuccess(channel) {
  const h = _health[channel];
  if (!h) return;
  h.lastSuccessAt = new Date().toISOString();
  h.consecutiveFailures = 0;
}

function markFailure(channel, err) {
  const h = _health[channel];
  if (!h) return;
  h.lastFailureAt = new Date().toISOString();
  const code = err && typeof err.code !== 'undefined' ? String(err.code).slice(0, 120) : 'unknown';
  h.lastErrorCode = code;
  h.consecutiveFailures += 1;
}

function isChannelConfigured(channel) {
  if (channel === 'email') {
    return Boolean(
      config.email &&
      config.email.enabled &&
      config.email.provider === 'resend' &&
      config.email.apiKey &&
      config.email.fromAddress
    );
  }
  if (channel === 'sms') {
    return Boolean(
      config.twilio &&
      config.twilio.enabled &&
      config.twilio.accountSid &&
      config.twilio.authToken &&
      config.twilio.phoneNumber
    );
  }
  if (channel === 'push') {
    if (!config.firebase || !config.firebase.enabled || !config.firebase.serviceAccountJson) return false;
    try {
      const parsed = typeof config.firebase.serviceAccountJson === 'string'
        ? JSON.parse(config.firebase.serviceAccountJson)
        : config.firebase.serviceAccountJson;
      return Boolean(parsed && typeof parsed === 'object');
    } catch {
      return false;
    }
  }
  return false;
}

function channelHealth(channel) {
  const h = _health[channel];
  const configured = isChannelConfigured(channel);
  let status = 'unknown';
  if (!configured) {
    status = 'unconfigured';
  } else if (h.consecutiveFailures >= DOWN_AFTER_CONSECUTIVE_FAILURES) {
    status = 'down';
  } else if (h.consecutiveFailures > 0) {
    status = 'degraded';
  } else if (h.lastSuccessAt) {
    status = 'healthy';
  }
  // 'unknown' = configured but no traffic yet. Deliberately never 'healthy'
  // without a real successful send (no fake Healthy).
  return {
    provider: h.provider,
    configured,
    status,
    lastSuccessAt: h.lastSuccessAt,
    lastFailureAt: h.lastFailureAt,
    lastErrorCode: h.lastErrorCode,
    consecutiveFailures: h.consecutiveFailures,
  };
}

function getProviderHealth() {
  return {
    email: channelHealth('email'),
    sms: channelHealth('sms'),
    push: channelHealth('push'),
  };
}

/** Test hook: reset in-memory health between cases. */
function _resetHealth() {
  for (const channel of Object.keys(_health)) {
    _health[channel].lastSuccessAt = null;
    _health[channel].lastFailureAt = null;
    _health[channel].lastErrorCode = null;
    _health[channel].consecutiveFailures = 0;
  }
}

// ─── Generic send pipeline ────────────────────────────────────────────────────

/**
 * Idempotent send: memory recall → DB pre-check → provider call (with
 * permanent-vs-transient retry) → delivery record → remember success.
 * `attemptSend` must resolve `{ providerMessageId, raw? }` or throw.
 * Throws normalized `{ statusCode, code }` errors; never throws for
 * bookkeeping failures.
 */
async function sendWithIdempotency({
  channel,
  correlationKey,
  organizationId,
  provider,
  terminalStatus,
  defaultErrorCode,
  attemptSend,
}) {
  const cached = recallSend(correlationKey);
  if (cached) {
    logger.info('messaging duplicate suppressed (memory)', { channel, correlationKey });
    return { ...cached, duplicate: true };
  }

  const workerId = generateWorkerId();
  const leaseMs = _getRetryLeaseDurationMs();

  // Atomically claim delivery ownership before provider call
  const claim = await claimDeliveryOwnership({
    organizationId,
    channel,
    correlationKey,
    provider,
    workerId,
    leaseMs,
  });

  if (!claim.claimed) {
    logger.info('messaging duplicate suppressed (claimed by another worker or completed)', {
      channel,
      correlationKey,
      status: claim.current ? claim.current.status : 'in_progress',
      reason: claim.reason,
    });
    const result = {
      messageId: (claim.current && (claim.current.provider_message_id || claim.current.id)) || null,
      providerMessageId: (claim.current && claim.current.provider_message_id) || null,
      status: (claim.current && claim.current.status) || 'retrying',
      raw: null,
      duplicate: true,
    };
    if (claim.current && (claim.current.status === 'sent' || claim.current.status === 'queued')) {
      rememberSend(correlationKey, result);
    }
    return result;
  }

  let attempts = 1;
  try {
    const { providerMessageId, raw = null } = await retryExternal(attemptSend, {
      shouldRetry: shouldRetryMessaging,
      onFailedAttempt: (ctx) => {
        const failedErr = retryErrorOf(ctx);
        attempts = (ctx.attemptNumber || attempts) + 1;
        // PII-free: channel + correlation key + error code only.
        logger.warn('messaging send attempt failed, retrying', {
          channel,
          correlationKey,
          attempt: ctx.attemptNumber,
          retriesLeft: ctx.retriesLeft,
          code: failedErr && failedErr.code !== undefined ? String(failedErr.code).slice(0, 120) : null,
        });
      },
    });

    markSuccess(channel);
    const result = { providerMessageId: providerMessageId || null, status: terminalStatus, raw };
    await reconcileClaimOutcome({
      claim: claim.current,
      workerId,
      organizationId,
      channel,
      correlationKey,
      provider,
      status: terminalStatus,
      providerMessageId: providerMessageId ? String(providerMessageId) : null,
      attempts,
      lastError: null,
    });
    rememberSend(correlationKey, result);
    logger.info('messaging sent', { channel, correlationKey, providerMessageId: result.providerMessageId });
    return result;
  } catch (err) {
    markFailure(channel, err);
    const normalized = normalizeMessagingError(err, defaultErrorCode);
    await reconcileClaimOutcome({
      claim: claim.current,
      workerId,
      organizationId,
      channel,
      correlationKey,
      provider,
      status: 'failed',
      providerMessageId: null,
      attempts,
      lastError: truncateLastError(normalized.message),
    });
    throw normalized;
  }
}

// ─── Email (Resend) ───────────────────────────────────────────────────────────

let _resendClient = null;

function getResendClient() {
  if (_resendClient) return _resendClient;
  if (!config.email || !config.email.enabled) return null;
  if (config.email.provider !== 'resend') return null;
  const { Resend } = require('resend');
  _resendClient = new Resend(config.email.apiKey);
  return _resendClient;
}

/** Test hook: drop the cached Resend client so config changes take effect. */
function _resetClients() {
  _resendClient = null;
  _twilioClient = null;
  _fcmMessaging = null;
}

async function sendEmail({ organizationId = null, to, subject, html, text, correlationId = null } = {}) {
  if (!to || !String(to).trim()) {
    throw messagingError('sendEmail requires a recipient', { statusCode: 400, code: 'EMAIL_INVALID_RECIPIENT' });
  }
  const client = getResendClient();
  if (!client) {
    throw messagingError('Email provider is not configured', { statusCode: 503, code: 'EMAIL_PROVIDER_UNAVAILABLE' });
  }
  const key = resolveCorrelationKey(
    correlationId,
    deriveCorrelationKey({ channel: 'email', recipient: to, fingerprint: `${subject ?? ''}\n${text ?? html ?? ''}` }),
  );
  return sendWithIdempotency({
    channel: 'email',
    correlationKey: key,
    organizationId,
    provider: 'resend',
    // Resend accepts for async delivery; bounces/complaints arrive via the
    // Svix-signed webhook (controllers/messaging-webhook.controller.js).
    terminalStatus: 'queued',
    defaultErrorCode: 'EMAIL_PROVIDER_ERROR',
    attemptSend: async () => {
      // NOTE: the installed Resend SDK resolves `{ data, error }` — API
      // errors do NOT throw, so inspect `error` explicitly.
      // Pass provider-native idempotency keys (Idempotency-Key and X-Entity-Ref-ID).
      const res = await client.emails.send(
        {
          from: config.email.fromAddress,
          to,
          subject,
          html,
          text,
          headers: {
            'X-Entity-Ref-ID': key,
          },
        },
        {
          idempotencyKey: key,
        },
      );
      if (res && res.error) {
        const apiErr = new Error(res.error.message || 'Resend send failed');
        apiErr.statusCode = res.error.statusCode;
        apiErr.code = 'EMAIL_PROVIDER_ERROR';
        throw apiErr;
      }
      const id = (res && res.data && res.data.id) || null;
      return { providerMessageId: id, raw: { id } };
    },
  });
}

// ─── SMS (Twilio) ─────────────────────────────────────────────────────────────

let _twilioClient = null;

function getTwilioClient() {
  if (_twilioClient) return _twilioClient;
  if (!config.twilio || !config.twilio.enabled) return null;
  const twilio = require('twilio');
  _twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  return _twilioClient;
}

function getTwilioStatusCallbackUrl() {
  const base = (config.publicServerUrl || (config.isProd ? '' : 'http://localhost:8080')).replace(/\/$/, '');
  return base ? `${base}/api/webhooks/twilio/status` : null;
}

async function sendSms({ organizationId = null, to, body, correlationId = null } = {}) {
  if (!to || !String(to).trim()) {
    throw messagingError('sendSms requires a recipient', { statusCode: 400, code: 'SMS_INVALID_RECIPIENT' });
  }
  const client = getTwilioClient();
  if (!client) {
    throw messagingError('SMS provider is not configured', { statusCode: 503, code: 'SMS_PROVIDER_UNAVAILABLE' });
  }
  const key = resolveCorrelationKey(
    correlationId,
    deriveCorrelationKey({ channel: 'sms', recipient: to, fingerprint: body }),
  );
  return sendWithIdempotency({
    channel: 'sms',
    correlationKey: key,
    organizationId,
    provider: 'twilio',
    terminalStatus: 'queued',
    defaultErrorCode: 'SMS_PROVIDER_ERROR',
    attemptSend: async () => {
      const createParams = {
        from: config.twilio.phoneNumber,
        to,
        body,
      };
      const statusCallback = getTwilioStatusCallbackUrl();
      if (statusCallback) {
        createParams.statusCallback = statusCallback;
      }
      const message = await client.messages.create(createParams);
      return { providerMessageId: message.sid || null, raw: { sid: message.sid || null } };
    },
  });
}

// ─── Push (FCM) ───────────────────────────────────────────────────────────────

let _fcmMessaging = null;

function getFcmMessaging() {
  if (_fcmMessaging) return _fcmMessaging;
  if (!config.firebase || !config.firebase.enabled) return null;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(config.firebase.serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    _fcmMessaging = admin.messaging();
    return _fcmMessaging;
  } catch {
    // Init failure (bad JSON/credentials) → treat as unconfigured; the
    // wrapper falls back exactly like the pre-Phase-06 code did.
    return null;
  }
}

function toFcmData(data) {
  return Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)]));
}

function invalidTokensFromBatchResponse(tokens, response) {
  const stale = [];
  const responses = (response && response.responses) || [];
  tokens.forEach((token, i) => {
    const r = responses[i];
    if (r && !r.success && isInvalidPushToken(r.error)) stale.push(token);
  });
  return stale;
}

async function sendPush({ organizationId = null, token, title, body, data = {}, correlationId = null } = {}) {
  if (!token || !String(token).trim()) {
    throw messagingError('sendPush requires a device token', { statusCode: 400, code: 'PUSH_INVALID_ARGUMENT' });
  }
  const messaging = getFcmMessaging();
  if (!messaging) {
    throw messagingError('Push provider is not configured', { statusCode: 503, code: 'PUSH_PROVIDER_UNAVAILABLE' });
  }
  const key = resolveCorrelationKey(
    correlationId,
    deriveCorrelationKey({ channel: 'push', recipient: token, fingerprint: `${title ?? ''}\n${body ?? ''}` }),
  );
  try {
    return await sendWithIdempotency({
      channel: 'push',
      correlationKey: key,
      organizationId,
      provider: 'fcm',
      // FCM confirms synchronously with a message id.
      terminalStatus: 'sent',
      defaultErrorCode: 'PUSH_PROVIDER_ERROR',
      attemptSend: async () => {
        try {
          const id = await messaging.send({
            token,
            notification: { title, body },
            data: toFcmData(data),
          });
          return { providerMessageId: id || null, raw: { id: id || null } };
        } catch (err) {
          if (isInvalidPushToken(err)) {
            const invalid = messagingError('Push token is no longer registered', {
              statusCode: 410,
              code: 'PUSH_INVALID_TOKEN',
            });
            invalid.providerCode = err.code;
            throw invalid;
          }
          throw err;
        }
      },
    });
  } catch (err) {
    // Preserve the special invalid-token code through normalization (it
    // already carries { statusCode, code }, so it passes through intact).
    throw normalizeMessagingError(err, 'PUSH_PROVIDER_ERROR');
  }
}

/**
 * Multicast send. Returns the ORIGINAL provider batch response shape in
 * `raw` (so existing promo-campaign counters keep working) plus a canonical
 * summary: `{ status, successCount, failureCount, invalidTokens, raw }`.
 * One summary delivery row per batch — per-token rows would be 500 inserts
 * per campaign batch for no operational gain.
 */
async function sendPushBatch({ organizationId = null, tokens, title, body, data = {}, correlationId = null } = {}) {
  if (!Array.isArray(tokens) || !tokens.length) {
    throw messagingError('sendPushBatch requires a non-empty tokens array', {
      statusCode: 400,
      code: 'PUSH_INVALID_ARGUMENT',
    });
  }
  const messaging = getFcmMessaging();
  if (!messaging) {
    throw messagingError('Push provider is not configured', { statusCode: 503, code: 'PUSH_PROVIDER_UNAVAILABLE' });
  }
  const key = resolveCorrelationKey(
    correlationId,
    deriveCorrelationKey({
      channel: 'push-batch',
      recipient: `${tokens.length}`,
      fingerprint: `${title ?? ''}\n${body ?? ''}\n${tokens.length}\n${shaHex([...tokens].sort().join(',')).slice(0, 32)}`,
    }),
  );

  const cached = recallSend(key);
  if (cached) {
    logger.info('messaging duplicate suppressed (memory)', { channel: 'push-batch', correlationKey: key });
    return { ...cached, duplicate: true };
  }
  const workerId = generateWorkerId();
  const leaseMs = _getRetryLeaseDurationMs();

  const claim = await claimDeliveryOwnership({
    organizationId,
    channel: 'push',
    correlationKey: key,
    provider: 'fcm',
    workerId,
    leaseMs,
  });

  if (!claim.claimed) {
    logger.info('messaging push batch duplicate suppressed', { channel: 'push-batch', correlationKey: key });
    const dup = {
      status: (claim.current && claim.current.status) || 'sent',
      successCount: null,
      failureCount: null,
      invalidTokens: [],
      raw: null,
      duplicate: true,
    };
    if (claim.current && (claim.current.status === 'sent' || claim.current.status === 'queued')) {
      rememberSend(key, dup);
    }
    return dup;
  }

  let attempts = 1;
  try {
    const response = await retryExternal(
      () => messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: toFcmData(data),
      }),
      {
        shouldRetry: shouldRetryMessaging,
        onFailedAttempt: (ctx) => {
          attempts = (ctx.attemptNumber || attempts) + 1;
          logger.warn('messaging send attempt failed, retrying', {
            channel: 'push-batch',
            correlationKey: key,
            tokenCount: tokens.length,
            attempt: ctx.attemptNumber,
            retriesLeft: ctx.retriesLeft,
          });
        },
      },
    );
    const invalidTokens = invalidTokensFromBatchResponse(tokens, response);
    const successCount = response.successCount || 0;
    const failureCount = response.failureCount || 0;
    const status = failureCount === 0 ? 'sent' : 'failed';
    markSuccess('push');
    const summary = {
      status,
      successCount,
      failureCount,
      invalidTokens,
      raw: response,
    };
    await reconcileClaimOutcome({
      claim: claim.current,
      workerId,
      organizationId,
      channel: 'push',
      correlationKey: key,
      provider: 'fcm',
      status,
      providerMessageId: null,
      attempts,
      lastError: failureCount > 0 ? truncateLastError(`${failureCount}/${tokens.length} batch sends failed`) : null,
    });
    if (status === 'sent') rememberSend(key, summary);
    logger.info('messaging push batch sent', {
      correlationKey: key,
      tokenCount: tokens.length,
      successCount,
      failureCount,
      invalidTokenCount: invalidTokens.length,
    });
    return summary;
  } catch (err) {
    markFailure('push', err);
    const normalized = normalizeMessagingError(err, 'PUSH_PROVIDER_ERROR');
    await reconcileClaimOutcome({
      claim: claim.current,
      workerId,
      organizationId,
      channel: 'push',
      correlationKey: key,
      provider: 'fcm',
      status: 'failed',
      providerMessageId: null,
      attempts,
      lastError: truncateLastError(normalized.message),
    });
    throw normalized;
  }
}

module.exports = {
  // Capability sends
  sendEmail,
  sendSms,
  sendPush,
  sendPushBatch,
  // Failure classification
  isRetryable,
  isInvalidPushToken,
  shouldRetryMessaging,
  // Correlation / idempotency helpers
  deriveCorrelationKey,
  buildOtpCorrelationKey,
  resolveCorrelationKey,
  IDEMPOTENCY_WINDOW_MS,
  // Provider health
  getProviderHealth,
  isChannelConfigured,
  getTwilioStatusCallbackUrl,
  // Delivery-record helpers (also used by the webhook callback)
  updateDeliveryStatus,
  applyProviderDeliveryStatus,
  findDeliveryByCorrelationKey,
  claimDeliveryOwnership,
  reconcileClaimOutcome,
  DEFAULT_RETRY_LEASE_MS: RETRY_LEASE_DURATION_MS,
  // Errors
  messagingError,
  normalizeMessagingError,
  // Error sanitization
  sanitizeProviderError,
  LAST_ERROR_MAX,
  // Test hooks
  _resetClients,
  _clearRecentSends,
  _resetHealth,
  _health,
  _setRetryLeaseDurationMs,
  _getRetryLeaseDurationMs,
};
