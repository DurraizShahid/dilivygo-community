'use strict';

/**
 * Indolj order-channel — SCAFFOLD / BLOCKED (fixture-only mock).
 *
 * Status: `requires_provider_contract` (see `docs/integrations/inventory.md`
 * and `docs/integrations/providers/indolj.md`). Implements the canonical
 * `OrderChannelProvider` surface from `services/order-channel-capability.js`
 * against deterministic in-memory fixtures.
 *
 * Anti-hallucination boundary (provider pack + kit global rule §4): the exact
 * Indolj endpoint contract was NOT reliably retrievable when the kit was built
 * ("do not copy guessed endpoints from blogs or competitors"). Therefore:
 * - NO endpoints invented — this file contains zero URL paths, zero hosts.
 * - NO credential formats — auth method unverified; `authenticateLive` throws
 *   503 INDOLJ_CONTRACT_REQUIRED. The fixture `authenticateFixture()` proves
 *   only the connect-success vs auth-failure SHAPE.
 * - NO signing scheme — `verifyWebhookSignatureLive` throws 503; the fixture
 *   webhook path is signature-agnostic and keys dedupe on the provider event
 *   id through the Phase 02 inbox pattern.
 * - Config `baseUrl` (validator) is free-form HTTPS marked UNVERIFIED and is
 *   never called — no fetch to any provider anywhere in this phase.
 * - `reconcileRecent` capability flag is FALSE until Indolj confirms query /
 *   reconciliation APIs ("where supported"); the engine method exists but the
 *   capability gate refuses it with 503.
 *
 * NOT registered anywhere user-facing (no catalog entry, no route, no UI):
 * feature-flagged by construction.
 */

const {
  channelError,
  contractCodeFor,
  normalizeProviderKey,
  normalizeExternalOrder,
  createOrderChannelFixtureEngine,
} = require('./order-channel-capability');

const PROVIDER_KEY = 'indolj';
const INDOLJ_CONTRACT_REQUIRED = contractCodeFor(PROVIDER_KEY); // 'INDOLJ_CONTRACT_REQUIRED'

/** Fixture batch bound (Dilivygo-side default only — NOT an Indolj-documented value). */
const INDOLJ_FIXTURE_BATCH_LIMIT = 50;

function indoljBlocked(method) {
  return channelError(
    `Indolj provider contract not verified (${method}); live Indolj call blocked`,
    503,
    INDOLJ_CONTRACT_REQUIRED,
  );
}

function assertOrgId(organizationId) {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw channelError('Indolj scaffold: organizationId is required', 400, 'INDOLJ_INVALID_REQUEST');
  }
  return organizationId.trim();
}

const FIXTURE_BRANCHES = Object.freeze([
  Object.freeze({ externalBranchId: 'indolj-store-1', name: 'Indolj Fixture Store — Lahore' }),
  Object.freeze({ externalBranchId: 'indolj-store-2', name: 'Indolj Fixture Store — Karachi' }),
]);

/**
 * Create a fixture-backed Indolj order-channel provider.
 *
 * @param {object} [options]
 * @param {string} options.organizationId Tenant scope (all state is per-org).
 * @param {object} [options.branchMap] `{ externalBranchId: shopId }` — sync and
 *   ingest refuse until the target branch is mapped (explicit-mapping gate).
 * @param {object} [options.catalog] Seed `{ externalProductId: {...} }`.
 * @param {boolean} [options.allowUnmappedBranch] Test-only escape hatch.
 * @param {boolean} [options.rejectUnknownSku] Fail closed (422) on unknown
 *   items instead of flagging `needsReview`.
 * @param {number} [options.menuTransientFailures] Count of transient 502s
 *   `importMenu` throws before succeeding (menu-sync retry fixture).
 */
function createIndoljChannelProvider(options) {
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

  let menuTransientFailuresRemaining = Math.max(0, Number(opts.menuTransientFailures || 0));
  let fixtureSessionSequence = 0;

  const inbox = [];

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

  const provider = {
    providerKey: PROVIDER_KEY,
    scaffold: true,
    contractStatus: 'requires_provider_contract',

    /**
     * FIXTURE-ONLY connect shape. `mode: 'valid'` returns a fixture session;
     * `mode: 'invalid'` throws 401 INDOLJ_AUTH_FAILED (auth-failure path).
     * This proves the success/failure vocabulary only — the real Indolj auth
     * method is unverified and any live attempt throws 503.
     */
    authenticateFixture({ mode } = {}) {
      if (mode === 'invalid') {
        throw channelError('Indolj scaffold: fixture authentication rejected (bad credentials)', 401, 'INDOLJ_AUTH_FAILED');
      }
      if (mode !== undefined && mode !== 'valid') {
        throw channelError("Indolj scaffold: mode must be 'valid' or 'invalid'", 400, 'INDOLJ_INVALID_REQUEST');
      }
      fixtureSessionSequence += 1;
      return {
        fixture: true,
        sessionId: `indolj_fixture_session_${fixtureSessionSequence}`,
        organizationId,
        issuedAt: new Date().toISOString(),
      };
    },

    // ── BLOCKED live surface (every method throws 503 — no endpoints exist) ──
    authenticateLive() { throw indoljBlocked('authenticateLive'); },
    fetchBranchesLive() { throw indoljBlocked('fetchBranchesLive'); },
    fetchMenuLive() { throw indoljBlocked('fetchMenuLive'); },
    pushMenuLive() { throw indoljBlocked('pushMenuLive'); },
    pushStockPricesLive() { throw indoljBlocked('pushStockPricesLive'); },
    acknowledgeOrderLive() { throw indoljBlocked('acknowledgeOrderLive'); },
    pushOrderStatusLive() { throw indoljBlocked('pushOrderStatusLive'); },
    verifyWebhookSignatureLive() { throw indoljBlocked('verifyWebhookSignatureLive'); },
    queryRecentOrdersLive() { throw indoljBlocked('queryRecentOrdersLive'); },

    // ── Capability surface (fixture-backed) ──
    discoverBranches() {
      return engine.discoverBranches();
    },

    /**
     * Menu import with a transient-failure fixture: the first
     * `menuTransientFailures` calls throw retryable 502s, then the import
     * succeeds — proving the menu-sync retry loop without any provider.
     */
    importMenu({ items, batchSize } = {}) {
      if (menuTransientFailuresRemaining > 0) {
        menuTransientFailuresRemaining -= 1;
        throw channelError(
          'Indolj scaffold: transient provider error during menu import (fixture — retry)',
          502,
          'INDOLJ_TRANSIENT_ERROR',
        );
      }
      return engine.importMenu({
        items,
        batchSize: batchSize !== undefined ? batchSize : INDOLJ_FIXTURE_BATCH_LIMIT,
      });
    },

    syncStockPrices({ updates, batchSize } = {}) {
      return engine.syncStockPrices({
        updates,
        batchSize: batchSize !== undefined ? batchSize : INDOLJ_FIXTURE_BATCH_LIMIT,
      });
    },

    ingestOrder({ canonical, eventId } = {}) {
      return engine.ingestOrder({ organizationId, canonical, eventId });
    },

    acknowledgeOrder({ externalOrderId, decision, reason } = {}) {
      return engine.acknowledgeOrder({ organizationId, externalOrderId, decision, reason });
    },

    updateOrderStatus({ externalOrderId, to, eventSequence } = {}) {
      return engine.updateOrderStatus({ organizationId, externalOrderId, to, eventSequence });
    },

    cancelOrder({ externalOrderId, reason } = {}) {
      return engine.cancelOrder({ organizationId, externalOrderId, reason });
    },

    /**
     * Capability-gated refusal: Indolj reconciliation/query APIs are
     * unverified ("where supported"), so the flag is false and this throws
     * 503 until official docs confirm the API. Use the missed-webhook test
     * below as the acceptance shape once the contract verifies.
     */
    reconcileRecent() {
      return engine.reconcileRecent({ organizationId, snapshot: [] });
    },

    checkHealth() {
      return engine.checkHealth();
    },

    /** Fixture webhook entry (ack-after-persist shape, event-id dedupe). */
    handleOrderWebhook({ eventId, payload } = {}) {
      if (eventId === undefined || eventId === null || String(eventId).trim().length === 0) {
        throw channelError('Indolj scaffold: webhook eventId is required', 400, 'INDOLJ_INVALID_WEBHOOK');
      }
      if (!payload || typeof payload !== 'object') {
        throw channelError('Indolj scaffold: webhook payload is required', 400, 'INDOLJ_INVALID_WEBHOOK');
      }
      const { row, duplicateDelivery } = persistInboxRow({ eventId, payload });
      if (duplicateDelivery && row.status === 'succeeded') {
        return { acked: true, deduped: true, status: row.status };
      }
      row.status = 'processing';
      row.attempts += 1;
      try {
        const canonical = normalizeExternalOrder({
          providerKey: PROVIDER_KEY,
          organizationId,
          externalOrderId: payload.externalOrderId,
          externalBranchId: payload.externalBranchId,
          providerStatus: payload.providerStatus,
          items: payload.items,
          subtotalCents: payload.subtotalCents,
          discountCents: payload.discountCents,
          deliveryFeeCents: payload.deliveryFeeCents,
          tipCents: payload.tipCents,
          taxCents: payload.taxCents,
          totalCents: payload.totalCents,
          currency: payload.currency,
          scheduledFor: payload.scheduledFor,
          customer: payload.customer,
          rawFieldNames: payload.rawFieldNames,
          raw: payload,
        });
        const result = engine.ingestOrder({ organizationId, canonical, eventId: row.providerEventId });
        row.status = 'succeeded';
        return { acked: true, deduped: Boolean(result.deduped), status: row.status, order: result };
      } catch (err) {
        row.status = 'failed';
        row.lastError = String((err && err.message) || err).slice(0, 500);
        throw err;
      }
    },

    _test: { engine, inbox },
  };

  return provider;
}

module.exports = {
  createIndoljChannelProvider,
  INDOLJ_CONTRACT_REQUIRED,
  INDOLJ_FIXTURE_BATCH_LIMIT,
  FIXTURE_BRANCHES,
};
