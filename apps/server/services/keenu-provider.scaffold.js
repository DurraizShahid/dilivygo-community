'use strict';

/**
 * Keenu payment provider — SCAFFOLD / BLOCKED (fixture-only mock).
 *
 * Status: `missing` / `requires_provider_contract` (see
 * `integrations/status.json` and `docs/integrations/providers/keenu.md`).
 * No verified Keenu merchant API contract exists in-repo (discovery record
 * dated 2026-09-16: `grep -ri keenu` = zero hits; only the official
 * product/portal domains keenu.pk and merchant.keenu.pk are known).
 *
 * This module implements the shared payment capability spec against
 * deterministic in-memory fixtures so business logic, idempotency handling,
 * and callback-dedupe shapes can be built and tested BEFORE the contract
 * verifies:
 *
 *   Normalized statuses: 'pending'|'requires_action'|'succeeded'|'failed'|
 *                          'cancelled'|'refunded'|'unknown'
 *   createPayment({ organizationId, orderId, amountCents, currency,
 *                   idempotencyKey, method? }) -> { providerPaymentId, status, raw }
 *   queryPayment({ organizationId, providerPaymentId }) -> { status, raw }
 *   capturePayment/cancelPayment/refundPayment({ organizationId,
 *                   providerPaymentId, amountCents?, idempotencyKey? })
 *   verifyWebhookSignature(rawBody, signature) -> boolean
 *   Errors carry { statusCode, code }. Money is integer cents only.
 *
 * Honesty boundaries (kit global rules §4, §5, §11):
 * - NO network calls, NO real URLs, NO secrets. Nothing here touches Keenu.
 * - verifyWebhookSignature() throws PROVIDER_CONTRACT_REQUIRED because the
 *   real signing scheme is unverified. Tests exercise the
 *   verify-before-finalize shape through the explicitly-labeled FIXTURE
 *   callback path (mock HMAC, test-injected secret, never from env).
 * - capturePayment()/refundPayment() throw PROVIDER_CONTRACT_REQUIRED:
 *   whether Keenu supports separate capture or refund/void is an open
 *   question pending official docs (see provider doc §3). Moving money
 *   provider-side must not be simulated as real.
 * - cancelPayment() is implemented at fixture level: recording a local
 *   cancellation of a non-final payment needs no provider call, mirroring
 *   the user-abandon path.
 * - queryPayment() resolves against the fixture store with strict tenant
 *   isolation (unknown id OR other-org id -> identical 404, no oracle).
 * - A payment created under the 'timeout-unknown' fixture stays 'unknown'
 *   forever: no code path promotes 'unknown' to a final state without
 *   provider truth. Retries are safe by construction (idempotent replay
 *   returns the identical record; duplicate callbacks finalize once).
 * - NOT registered anywhere user-facing (no catalog entry, no route, no
 *   UI): feature-flagged by construction.
 */

const crypto = require('node:crypto');

/** Machine-readable gate shared with future live wiring. */
const PROVIDER_CONTRACT_REQUIRED = 'PROVIDER_CONTRACT_REQUIRED';

/**
 * Fixture-only HMAC secret placeholder. This is NOT a credential: it only
 * lets tests prove the verify-before-finalize callback shape with a mock
 * HMAC. Overridable per test via factory options; NEVER read from env and
 * never replaced with a real secret in this file.
 */
const FIXTURE_CALLBACK_SECRET_PLACEHOLDER = 'scaffold-fixture-only-NOT-A-REAL-CREDENTIAL';

/** Terminal states: once reached, callbacks replays must not re-finalize. */
const FINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'refunded']);

/** Fixture outcomes configurable per test (see factory options). */
const FIXTURE_OUTCOMES = ['success', 'declined', 'abandoned', 'timeout-unknown'];

/** Fixture outcome -> normalized payment status. */
const OUTCOME_STATUS = {
  success: 'succeeded',
  declined: 'failed',
  abandoned: 'cancelled',
  'timeout-unknown': 'unknown',
};

/** Fixture callback event -> normalized payment status. */
const CALLBACK_EVENT_STATUS = {
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
};

function integrationError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function contractRequired(method) {
  return integrationError(
    `Keenu provider contract not verified (${method}); live Keenu call blocked`,
    503,
    PROVIDER_CONTRACT_REQUIRED,
  );
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw integrationError(`Keenu scaffold: ${field} is required`, 400, 'KEENU_INVALID_REQUEST');
  }
  return value.trim();
}

/** Money is integer cents only — never floats, never major units. */
function assertAmountCents(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw integrationError('Keenu scaffold: amountCents must be a positive integer (minor units)', 400, 'KEENU_INVALID_AMOUNT');
  }
  return amountCents;
}

function fixtureRaw(record, extra) {
  return {
    fixture: true,
    provider: 'keenu',
    providerPaymentId: record.providerPaymentId,
    organizationId: record.organizationId,
    orderId: record.orderId,
    amountCents: record.amountCents,
    currency: record.currency,
    outcome: record.outcome,
    note: 'Deterministic scaffold fixture — not a Keenu API response.',
    ...(extra || {}),
  };
}

/**
 * Canonical fixture-callback payload bytes. The mock HMAC signs exactly
 * these bytes; verifiers must reconstruct them identically.
 */
function canonicalCallbackBytes({ organizationId, providerPaymentId, event }) {
  return Buffer.from(
    JSON.stringify({ organizationId, providerPaymentId, event }),
    'utf8',
  );
}

function signFixtureCallback(secret, payload) {
  return `sha256=${crypto.createHmac('sha256', secret).update(canonicalCallbackBytes(payload)).digest('hex')}`;
}

/**
 * Create a fixture-backed Keenu payment provider.
 *
 * @param {object} [options]
 * @param {'success'|'declined'|'abandoned'|'timeout-unknown'} [options.outcome='success']
 *   Deterministic fixture outcome applied to payments created by this instance.
 * @param {string} [options.fixtureCallbackSecret] Test-only mock-HMAC secret
 *   for the fixture callback path. Defaults to an obvious placeholder.
 */
function createKeenuPaymentProvider(options) {
  const opts = options || {};
  const outcome = opts.outcome || 'success';
  if (!FIXTURE_OUTCOMES.includes(outcome)) {
    throw integrationError(
      `Keenu scaffold: unknown fixture outcome '${outcome}'`,
      400,
      'KEENU_INVALID_REQUEST',
    );
  }
  const fixtureCallbackSecret = opts.fixtureCallbackSecret || FIXTURE_CALLBACK_SECRET_PLACEHOLDER;

  // Deterministic in-memory fixture store (per instance: tests stay isolated).
  let sequence = 0;
  const byId = new Map(); // providerPaymentId -> record
  const byIdempotency = new Map(); // `${organizationId}:${idempotencyKey}` -> providerPaymentId

  function publicResult(record, extra) {
    return {
      providerPaymentId: record.providerPaymentId,
      status: record.status,
      raw: fixtureRaw(record, extra),
    };
  }

  function resolveOwnedPayment(organizationId, providerPaymentId) {
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(providerPaymentId, 'providerPaymentId');
    const record = byId.get(providerPaymentId);
    // Identical 404 whether the id is unknown or belongs to another org:
    // tenant isolation by construction, no cross-tenant oracle.
    if (!record || record.organizationId !== organizationId) {
      throw integrationError('Keenu scaffold: payment not found', 404, 'KEENU_PAYMENT_NOT_FOUND');
    }
    return record;
  }

  function verifyFixtureSignature({ organizationId, providerPaymentId, event, signature }) {
    if (typeof signature !== 'string' || signature.length === 0) {
      throw integrationError('Keenu scaffold: callback signature is required', 401, 'KEENU_CALLBACK_SIGNATURE_INVALID');
    }
    const expected = signFixtureCallback(fixtureCallbackSecret, { organizationId, providerPaymentId, event });
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) {
      throw integrationError('Keenu scaffold: callback signature mismatch (tampered callback rejected)', 401, 'KEENU_CALLBACK_SIGNATURE_INVALID');
    }
  }

  const provider = {
    providerKey: 'keenu',
    scaffold: true,
    contractStatus: 'requires_provider_contract',

    /**
     * Fixture create. Duplicate createPayment with the same
     * (organizationId, idempotencyKey) returns the ORIGINAL fixture result —
     * no double-finalize, no second record.
     */
    createPayment(input) {
      const args = input || {};
      const organizationId = assertNonEmptyString(args.organizationId, 'organizationId');
      const orderId = assertNonEmptyString(args.orderId, 'orderId');
      const amountCents = assertAmountCents(args.amountCents);
      const currency = assertNonEmptyString(args.currency, 'currency').toUpperCase();
      const idempotencyKey = assertNonEmptyString(args.idempotencyKey, 'idempotencyKey');
      if (args.method !== undefined && (typeof args.method !== 'string' || args.method.trim().length === 0)) {
        throw integrationError('Keenu scaffold: method must be a non-empty string when provided', 400, 'KEENU_INVALID_REQUEST');
      }

      const idemKey = `${organizationId}:${idempotencyKey}`;
      const existingId = byIdempotency.get(idemKey);
      if (existingId) {
        const existing = byId.get(existingId);
        // Idempotent replay: identical result, finalizeCount untouched.
        return { ...publicResult(existing), idempotentReplay: true };
      }

      sequence += 1;
      const providerPaymentId = `keenu_fixture_${sequence}`;
      const status = OUTCOME_STATUS[outcome];
      const record = {
        providerPaymentId,
        organizationId,
        orderId,
        amountCents,
        currency,
        idempotencyKey,
        method: args.method ? args.method.trim() : null,
        outcome,
        status,
        // Only non-final fixture payments can still be finalized by a
        // (fixture) callback; 'unknown' NEVER self-promotes.
        finalized: status !== 'unknown',
        finalizeCount: status !== 'unknown' ? 1 : 0,
        callbackDeliveries: 0,
        createdAt: new Date().toISOString(),
      };
      byId.set(providerPaymentId, record);
      byIdempotency.set(idemKey, providerPaymentId);
      return publicResult(record);
    },

    /** Fixture query with strict tenant isolation (see resolveOwnedPayment). */
    queryPayment(input) {
      const args = input || {};
      const record = resolveOwnedPayment(args.organizationId, args.providerPaymentId);
      return { status: record.status, raw: fixtureRaw(record) };
    },

    /**
     * BLOCKED: whether Keenu supports a separate capture step is an open
     * question (provider doc §3). Capturing moves money provider-side, so it
     * must not be simulated as real.
     */
    capturePayment() {
      throw contractRequired('capturePayment');
    },

    /**
     * Fixture-level local cancel. A non-final payment transitions to
     * 'cancelled' exactly once; replays of an already-final payment return
     * the current status unchanged (safe retry, no double-finalize).
     */
    cancelPayment(input) {
      const args = input || {};
      const record = resolveOwnedPayment(args.organizationId, args.providerPaymentId);
      if (!record.finalized) {
        record.status = 'cancelled';
        record.finalized = true;
        record.finalizeCount += 1;
      }
      return publicResult(record);
    },

    /**
     * BLOCKED: refund/void support is unverified (provider doc §3) and moves
     * money provider-side. Retries must surface PROVIDER_CONTRACT_REQUIRED,
     * never a fabricated refund id.
     */
    refundPayment() {
      throw contractRequired('refundPayment');
    },

    /**
     * BLOCKED: the real Keenu callback/webhook signing scheme is unverified
     * (provider doc §3), so real-signature verification cannot be implemented.
     * Tests cover the verify-before-finalize shape via handleFixtureCallback.
     */
    verifyWebhookSignature() {
      throw contractRequired('verifyWebhookSignature');
    },

    /**
     * FIXTURE-ONLY callback handler (test double for the future real webhook
     * handler). Verifies the mock-HMAC signature FIRST, then finalizes at
     * most once: duplicate deliveries return the current status with
     * `deduped: true` and never increment finalizeCount.
     */
    handleFixtureCallback(input) {
      const args = input || {};
      const organizationId = assertNonEmptyString(args.organizationId, 'organizationId');
      const providerPaymentId = assertNonEmptyString(args.providerPaymentId, 'providerPaymentId');
      if (!Object.prototype.hasOwnProperty.call(CALLBACK_EVENT_STATUS, args.event)) {
        throw integrationError('Keenu scaffold: unknown fixture callback event', 400, 'KEENU_INVALID_REQUEST');
      }
      verifyFixtureSignature({
        organizationId,
        providerPaymentId,
        event: args.event,
        signature: args.signature,
      });
      const record = resolveOwnedPayment(organizationId, providerPaymentId);
      record.callbackDeliveries += 1;
      if (record.finalized || FINAL_STATUSES.has(record.status)) {
        return { ...publicResult(record), deduped: true };
      }
      record.status = CALLBACK_EVENT_STATUS[args.event];
      record.finalized = true;
      record.finalizeCount += 1;
      return { ...publicResult(record), deduped: false };
    },

    /** Test helper: sign a fixture callback with this instance's secret. */
    signFixtureCallback(payload) {
      return signFixtureCallback(fixtureCallbackSecret, {
        organizationId: assertNonEmptyString(payload.organizationId, 'organizationId'),
        providerPaymentId: assertNonEmptyString(payload.providerPaymentId, 'providerPaymentId'),
        event: payload.event,
      });
    },
  };

  return provider;
}

module.exports = {
  createKeenuPaymentProvider,
  PROVIDER_CONTRACT_REQUIRED,
  FIXTURE_OUTCOMES,
  FIXTURE_CALLBACK_SECRET_PLACEHOLDER,
};
