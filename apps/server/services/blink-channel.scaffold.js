'use strict';

/**
 * Blink / Blink Co order-channel — SCAFFOLD / BLOCKED (fixture-only mock).
 *
 * Status: `requires_provider_contract` (see `docs/integrations/inventory.md`
 * and `docs/integrations/providers/blink-co.md`). Implements the canonical
 * `OrderChannelProvider` surface from `services/order-channel-capability.js`
 * against deterministic in-memory fixtures so branch mapping, menu import,
 * stock/price sync, webhook ingestion, accept/reject, out-of-order protection
 * and reconciliation can be built and tested BEFORE the contract verifies.
 *
 * Doc-derived facts ONLY (kit research notes §Blink + provider pack; every
 * value below is marked NEEDS-REVERIFY against live docs.blinkco.io):
 * - Production host `api.blinkco.io`, sandbox host `stg-api.blinkco.io`.
 * - Username/password issued by Blink, exchanged for a bearer token.
 * - Branch / menu / category APIs, menu import, stock/price sync, webhook
 *   registration + order webhooks, plus a SEPARATE Blink Logistics API.
 * - Historical ~5s webhook timeout: ack after verify+persist, never after
 *     synchronous order creation.
 *
 * Honesty boundaries (kit global rules §4, §5, §11):
 * - NO network calls. No fetch/axios anywhere in this file; the two documented
 *   hosts appear ONLY in the validator allowlist, never as call targets.
 * - Every live-shaped method (`loginLive`, `fetchBranchesLive`,
 *   `pushMenuLive`, `pushStockPricesLive`, `acknowledgeOrderLive`,
 *   `pushOrderStatusLive`, `registerWebhookLive`) throws 503
 *   BLINK_CONTRACT_REQUIRED. Tests assert the block.
 * - Bearer-token handling is a FIXTURE simulation (expiring fixture tokens)
 *   proving the refresh/re-login shape; the real login exchange is unverified.
 * - NOT registered anywhere user-facing (no catalog entry, no route, no UI):
 *   feature-flagged by construction.
 */

const {
  channelError,
  contractCodeFor,
  normalizeProviderKey,
  normalizeExternalOrder,
  createOrderChannelFixtureEngine,
} = require('./order-channel-capability');

const PROVIDER_KEY = 'blink';
const BLINK_CONTRACT_REQUIRED = contractCodeFor(PROVIDER_KEY); // 'BLINK_CONTRACT_REQUIRED'

/**
 * Documented-but-UNVERIFIED batch bound (pack: "respect documented batch limits
 * such as the stock/price sync maximum if still current" + provider test "50-
 * item/batch boundary if still documented"). NEEDS-REVERIFY against live docs
 * before any live batching relies on it; the fixture uses it only to prove
 * boundary chunking.
 */
const BLINK_DOCUMENTED_BATCH_LIMIT = 50;

/** Historical webhook ack bound per provider pack (~5s). NEEDS-REVERIFY. */
const BLINK_DOCUMENTED_WEBHOOK_TIMEOUT_MS = 5000;

function blinkBlocked(method) {
  return channelError(
    `Blink provider contract not verified (${method}); live Blink call blocked`,
    503,
    BLINK_CONTRACT_REQUIRED,
  );
}

function assertOrgId(organizationId) {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw channelError('Blink scaffold: organizationId is required', 400, 'BLINK_INVALID_REQUEST');
  }
  return organizationId.trim();
}

const FIXTURE_BRANCHES = Object.freeze([
  Object.freeze({ externalBranchId: 'blink-branch-1', name: 'Blink Fixture Branch — Gulberg' }),
  Object.freeze({ externalBranchId: 'blink-branch-2', name: 'Blink Fixture Branch — DHA' }),
]);

/**
 * Create a fixture-backed Blink order-channel provider.
 *
 * @param {object} [options]
 * @param {string} options.organizationId Tenant scope (all state is per-org).
 * @param {object} [options.branchMap] `{ externalBranchId: shopId }` — sync and
 *   ingest refuse until the target branch is mapped (explicit-mapping gate).
 * @param {object} [options.catalog] Seed `{ externalProductId: {...} }`.
 * @param {boolean} [options.allowUnmappedBranch] Test-only escape hatch.
 * @param {boolean} [options.rejectUnknownSku] Fail closed (422) on unknown
 *   items instead of flagging `needsReview`.
 * @param {boolean} [options.startWithExpiredToken] Start with an expired
 *   fixture bearer token to exercise the expiry/re-login path.
 * @param {string[]} [options.failingStockIds] External ids that fail stock
 *   sync rows (partial-failure fixture).
 */
function createBlinkChannelProvider(options) {
  const opts = options || {};
  const organizationId = assertOrgId(opts.organizationId);
  normalizeProviderKey(PROVIDER_KEY);

  const engine = createOrderChannelFixtureEngine({
    providerKey: PROVIDER_KEY,
    organizationId,
    options: {
      branchMap: opts.branchMap,
      catalog: opts.catalog,
      allowUnmappedBranch: opts.allowUnmappedBranch,
      rejectUnknownSku: opts.rejectUnknownSku,
      fixtureBranches: FIXTURE_BRANCHES,
    },
  });

  const failingStockIds = new Set((opts.failingStockIds || []).map(String));

  // Fixture bearer-token simulation (proves the refresh/re-login SHAPE only —
  // the real Blink login exchange is unverified and stays behind 503).
  let tokenSequence = 0;
  let fixtureToken = issueFixtureToken(!opts.startWithExpiredToken);

  function issueFixtureToken(valid) {
    tokenSequence += 1;
    const now = Date.now();
    return {
      token: `blink_fixture_token_${tokenSequence}`,
      issuedAt: new Date(now).toISOString(),
      // Valid tokens live 1h (fixture value, NOT a Blink-documented TTL);
      // expired fixtures start 1s in the past.
      expiresAt: new Date(now + (valid ? 3600 * 1000 : -1000)).toISOString(),
      fixture: true,
    };
  }

  function requireLiveToken() {
    if (new Date(fixtureToken.expiresAt).getTime() <= Date.now()) {
      throw channelError(
        'Blink scaffold: fixture bearer token expired; re-login required',
        401,
        'BLINK_TOKEN_EXPIRED',
      );
    }
    return fixtureToken.token;
  }

  // Webhook inbox mirror (proves the ack-after-persist shape against the Phase
  // 02 `integration_webhook_events` lifecycle: received -> processing ->
  // succeeded/failed; redeliveries dedupe by provider event id).
  const inbox = [];
  const pendingQueue = [];

  function persistInboxRow({ eventId, payload }) {
    const existing = inbox.find((row) => row.providerEventId === String(eventId));
    if (existing) return { row: existing, duplicateDelivery: true };
    const row = {
      providerKey: PROVIDER_KEY,
      organizationId,
      providerEventId: String(eventId),
      status: 'received',
      attempts: 0,
      payload,
      receivedAt: new Date().toISOString(),
    };
    inbox.push(row);
    return { row, duplicateDelivery: false };
  }

  function processInboxRow(row) {
    row.status = 'processing';
    row.attempts += 1;
    try {
      const canonical = normalizeExternalOrder({
        providerKey: PROVIDER_KEY,
        organizationId,
        externalOrderId: row.payload.externalOrderId,
        externalBranchId: row.payload.externalBranchId,
        providerStatus: row.payload.providerStatus,
        items: row.payload.items,
        subtotalCents: row.payload.subtotalCents,
        discountCents: row.payload.discountCents,
        deliveryFeeCents: row.payload.deliveryFeeCents,
        tipCents: row.payload.tipCents,
        taxCents: row.payload.taxCents,
        totalCents: row.payload.totalCents,
        currency: row.payload.currency,
        scheduledFor: row.payload.scheduledFor,
        customer: row.payload.customer,
        rawFieldNames: row.payload.rawFieldNames,
        raw: row.payload,
      });
      const result = engine.ingestOrder({ organizationId, canonical, eventId: row.providerEventId });
      row.status = 'succeeded';
      return result;
    } catch (err) {
      row.status = 'failed';
      row.lastError = String((err && err.message) || err).slice(0, 500);
      throw err;
    }
  }

  const provider = {
    providerKey: PROVIDER_KEY,
    scaffold: true,
    contractStatus: 'requires_provider_contract',

    // ── Fixture token lifecycle (shape only) ──
    loginFixture() {
      fixtureToken = issueFixtureToken(true);
      return { ...fixtureToken };
    },
    describeFixtureToken() {
      return { ...fixtureToken, expired: new Date(fixtureToken.expiresAt).getTime() <= Date.now() };
    },

    // ── BLOCKED live surface (every method throws 503) ──
    loginLive() { throw blinkBlocked('loginLive'); },
    fetchBranchesLive() { throw blinkBlocked('fetchBranchesLive'); },
    pushMenuLive() { throw blinkBlocked('pushMenuLive'); },
    pushStockPricesLive() { throw blinkBlocked('pushStockPricesLive'); },
    acknowledgeOrderLive() { throw blinkBlocked('acknowledgeOrderLive'); },
    pushOrderStatusLive() { throw blinkBlocked('pushOrderStatusLive'); },
    registerWebhookLive() { throw blinkBlocked('registerWebhookLive'); },
    createLogisticsTaskLive() {
      // Blink Logistics is a SEPARATE delivery capability per the pack — it
      // must never ride this order-channel adapter (sibling Phase 10 owns
      // delivery). Blocked here by design, not by omission.
      throw channelError(
        'Blink Logistics is a separate delivery capability; order-channel adapter refuses logistics calls',
        503,
        BLINK_CONTRACT_REQUIRED,
      );
    },

    // ── Capability surface (fixture-backed, token-gated like live would be) ──
    discoverBranches() {
      requireLiveToken();
      return engine.discoverBranches();
    },

    importMenu({ items, batchSize } = {}) {
      requireLiveToken();
      return engine.importMenu({
        items,
        batchSize: batchSize !== undefined ? batchSize : BLINK_DOCUMENTED_BATCH_LIMIT,
      });
    },

    syncStockPrices({ updates, batchSize } = {}) {
      requireLiveToken();
      const stamped = (Array.isArray(updates) ? updates : []).map((update) => (
        update && failingStockIds.has(String(update.externalProductId))
          ? { ...update, simulateFailure: true }
          : update
      ));
      return engine.syncStockPrices({
        updates: stamped,
        batchSize: batchSize !== undefined ? batchSize : BLINK_DOCUMENTED_BATCH_LIMIT,
      });
    },

    ingestOrder({ canonical, eventId } = {}) {
      requireLiveToken();
      return engine.ingestOrder({ organizationId, canonical, eventId });
    },

    acknowledgeOrder({ externalOrderId, decision, reason } = {}) {
      requireLiveToken();
      return engine.acknowledgeOrder({ organizationId, externalOrderId, decision, reason });
    },

    updateOrderStatus({ externalOrderId, to, eventSequence } = {}) {
      requireLiveToken();
      return engine.updateOrderStatus({ organizationId, externalOrderId, to, eventSequence });
    },

    cancelOrder({ externalOrderId, reason } = {}) {
      requireLiveToken();
      return engine.cancelOrder({ organizationId, externalOrderId, reason });
    },

    reconcileRecent({ snapshot } = {}) {
      requireLiveToken();
      return engine.reconcileRecent({ organizationId, snapshot });
    },

    checkHealth() {
      return {
        ...engine.checkHealth(),
        tokenExpired: new Date(fixtureToken.expiresAt).getTime() <= Date.now(),
      };
    },

    /**
     * Webhook entry point proving ack-after-persist: the raw event is persisted
     * to the inbox mirror FIRST, the HTTP ack is conceptually released, and
     * only then is the order created. Duplicate provider deliveries dedupe by
     * event id and never re-finalize.
     */
    handleOrderWebhook({ eventId, payload } = {}) {
      if (eventId === undefined || eventId === null || String(eventId).trim().length === 0) {
        throw channelError('Blink scaffold: webhook eventId is required', 400, 'BLINK_INVALID_WEBHOOK');
      }
      if (!payload || typeof payload !== 'object') {
        throw channelError('Blink scaffold: webhook payload is required', 400, 'BLINK_INVALID_WEBHOOK');
      }
      const { row, duplicateDelivery } = persistInboxRow({ eventId, payload });
      if (duplicateDelivery && row.status === 'succeeded') {
        return { acked: true, deduped: true, status: row.status };
      }
      const result = processInboxRow(row);
      return { acked: true, deduped: Boolean(result.deduped), status: row.status, order: result };
    },

    /**
     * Timeout-ack path: when downstream processing would exceed the documented
     * ~5s webhook bound, the handler acks after persistence and defers the
     * order creation to `drainPending()` (the async worker in production).
     * `simulatedProcessingMs` is a TEST-ONLY knob describing how long the
     * downstream step would take — no real sleeping happens here.
     */
    handleOrderWebhookWithTimeout({ eventId, payload, simulatedProcessingMs } = {}) {
      const { row, duplicateDelivery } = persistInboxRow({ eventId, payload });
      if (duplicateDelivery && row.status === 'succeeded') {
        return { acked: true, deduped: true, deferred: false, status: row.status };
      }
      const wouldTake = Number(simulatedProcessingMs || 0);
      if (wouldTake > BLINK_DOCUMENTED_WEBHOOK_TIMEOUT_MS) {
        pendingQueue.push(row.providerEventId);
        return { acked: true, deduped: false, deferred: true, status: row.status };
      }
      const result = processInboxRow(row);
      return { acked: true, deduped: Boolean(result.deduped), deferred: false, status: row.status, order: result };
    },

    drainPending() {
      const results = [];
      while (pendingQueue.length > 0) {
        const eventId = pendingQueue.shift();
        const row = inbox.find((entry) => entry.providerEventId === eventId);
        if (!row || row.status === 'succeeded') continue;
        results.push({ eventId, order: processInboxRow(row) });
      }
      return results;
    },

    _test: { engine, inbox, pendingQueue },
  };

  return provider;
}

module.exports = {
  createBlinkChannelProvider,
  BLINK_CONTRACT_REQUIRED,
  BLINK_DOCUMENTED_BATCH_LIMIT,
  BLINK_DOCUMENTED_WEBHOOK_TIMEOUT_MS,
  FIXTURE_BRANCHES,
};
