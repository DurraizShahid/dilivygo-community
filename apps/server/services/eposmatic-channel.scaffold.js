'use strict';

/**
 * ePOSmatic order-channel — SCAFFOLD / BLOCKED (fixture-only mock).
 *
 * Status: `requires_provider_contract` (see `docs/integrations/inventory.md`
 * and `docs/integrations/providers/eposmatic.md`). Implements the canonical
 * `OrderChannelProvider` surface from `services/order-channel-capability.js`
 * against deterministic in-memory fixtures.
 *
 * Anti-hallucination boundary (provider pack + kit global rule §4): official
 * ePOSmatic product pages are verified but NO public partner API spec was
 * verified — "marketing capability is not an API contract". Therefore:
 * - NO endpoints, hosts, credential formats, or signing schemes invented.
 * - Every live-shaped method throws 503 EPOSMATIC_CONTRACT_REQUIRED.
 * - No `baseUrl` anywhere (not even validator-side: no host is verified at
 *   all — transport is "TBD with the ePOSmatic partner team").
 *
 * Bidirectional-loop prevention (pack requirement): ePOSmatic may both SEND
 * POS orders to Dilivygo AND RECEIVE Dilivygo online orders, with menu/inventory
 * sync "bidirectionally" per marketing. Without an explicit authority rule that
 * ping-pongs. This scaffold enforces ONE authoritative direction per entity via
 * `sourceOfTruth` config (`menu | price | stock | orderStatus`, each
 * `'dilivygo' | 'provider'`):
 * - Inbound provider writes for a Dilivygo-authoritative entity are RECORDED
 *   as conflicts and NOT applied (409 EPOSMATIC_LOOP_PREVENTED).
 * - Outbound Dilivygo writes for a provider-authoritative entity are refused
 *   the same way.
 * - Echo suppression: records stamped `origin: 'dilivygo-echo'` (our own
 *   outbound write reflected back by the provider) are acknowledged and
 *   dropped without re-applying — the classic loop killer.
 * Conflict records are queryable via `listConflicts()` for operator review.
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

const PROVIDER_KEY = 'eposmatic';
const EPOSMATIC_CONTRACT_REQUIRED = contractCodeFor(PROVIDER_KEY); // 'EPOSMATIC_CONTRACT_REQUIRED'
const EPOSMATIC_LOOP_PREVENTED = 'EPOSMATIC_LOOP_PREVENTED';

/** Fixture batch bound (Dilivygo-side default only — NOT provider-documented). */
const EPOSMATIC_FIXTURE_BATCH_LIMIT = 50;

const TRUTH_SIDES = Object.freeze(['dilivygo', 'provider']);
const TRUTH_ENTITIES = Object.freeze(['menu', 'price', 'stock', 'orderStatus']);

/**
 * Default authority: the POS owns catalogue truth (menu/price/stock — it is
 * the in-store system of record); Dilivygo owns fulfilment status once the
 * order is accepted into its pipeline. Tenants override per entity via config;
 * the VALIDATOR (`validators/eposmatic-channel.validator.js`) enforces the
 * same enum so config and runtime can never disagree on vocabulary.
 */
const DEFAULT_SOURCE_OF_TRUTH = Object.freeze({
  menu: 'provider',
  price: 'provider',
  stock: 'provider',
  orderStatus: 'dilivygo',
});

function eposmaticBlocked(method) {
  return channelError(
    `ePOSmatic provider contract not verified (${method}); live ePOSmatic call blocked`,
    503,
    EPOSMATIC_CONTRACT_REQUIRED,
  );
}

function loopPrevented(entity, origin, authority) {
  return channelError(
    `ePOSmatic scaffold: '${entity}' is ${authority}-authoritative; refusing ${origin} write to prevent a bidirectional sync loop`,
    409,
    EPOSMATIC_LOOP_PREVENTED,
    { entity, origin, authority },
  );
}

function assertOrgId(organizationId) {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw channelError('ePOSmatic scaffold: organizationId is required', 400, 'EPOSMATIC_INVALID_REQUEST');
  }
  return organizationId.trim();
}

function normalizeSourceOfTruth(input) {
  const merged = { ...DEFAULT_SOURCE_OF_TRUTH, ...(input || {}) };
  for (const entity of TRUTH_ENTITIES) {
    if (!TRUTH_SIDES.includes(merged[entity])) {
      throw channelError(
        `ePOSmatic scaffold: sourceOfTruth.${entity} must be 'dilivygo' or 'provider'`,
        400,
        'EPOSMATIC_INVALID_TRUTH',
      );
    }
  }
  return Object.freeze(merged);
}

const FIXTURE_BRANCHES = Object.freeze([
  Object.freeze({ externalBranchId: 'eposmatic-branch-1', name: 'ePOSmatic Fixture Branch — Karachi' }),
  Object.freeze({ externalBranchId: 'eposmatic-branch-2', name: 'ePOSmatic Fixture Branch — Dubai' }),
]);

/**
 * Create a fixture-backed ePOSmatic order-channel provider.
 *
 * @param {object} [options]
 * @param {string} options.organizationId Tenant scope (all state is per-org).
 * @param {object} [options.branchMap] `{ externalBranchId: shopId }`.
 * @param {object} [options.catalog] Seed `{ externalProductId: {...} }`.
 * @param {object} [options.sourceOfTruth] Per-entity authority overrides.
 * @param {boolean} [options.allowUnmappedBranch] Test-only escape hatch.
 * @param {boolean} [options.rejectUnknownSku] Fail closed (422) on unknown items.
 * @param {boolean} [options.providerOutage] When true, every live-shaped AND
 *   fixture-sync method throws 502 EPOSMATIC_PROVIDER_OUTAGE (outage drill).
 */
function createEposmaticChannelProvider(options) {
  const opts = options || {};
  const organizationId = assertOrgId(opts.organizationId);
  normalizeProviderKey(PROVIDER_KEY);
  const sourceOfTruth = normalizeSourceOfTruth(opts.sourceOfTruth);

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

  const conflicts = [];
  const echoLog = [];
  let outage = opts.providerOutage === true;

  function assertAvailable() {
    if (outage) {
      throw channelError('ePOSmatic scaffold: provider unavailable (fixture outage drill)', 502, 'EPOSMATIC_PROVIDER_OUTAGE');
    }
  }

  function recordConflict({ entity, origin, externalId, detail }) {
    const conflict = {
      entity,
      origin,
      authority: sourceOfTruth[entity] || null,
      externalId: externalId || null,
      detail: detail || null,
      organizationId,
      recordedAt: new Date().toISOString(),
    };
    conflicts.push(conflict);
    return conflict;
  }

  /**
   * Authority gate. `origin` is 'provider' (inbound webhook/poll row) or
   * 'dilivygo' (outbound push). Matching authority passes; mismatch records a
   * conflict and throws 409 — the write is NEVER applied cross-authority.
   */
  function assertWriteDirection(entity, origin) {
    if (!TRUTH_ENTITIES.includes(entity)) {
      throw channelError(`ePOSmatic scaffold: unknown sync entity '${entity}'`, 400, 'EPOSMATIC_INVALID_ENTITY');
    }
    if (origin !== 'dilivygo' && origin !== 'provider') {
      throw channelError("ePOSmatic scaffold: origin must be 'dilivygo' or 'provider'", 400, 'EPOSMATIC_INVALID_REQUEST');
    }
    if (sourceOfTruth[entity] !== origin) {
      recordConflict({ entity, origin, externalId: null, detail: 'cross-authority write refused' });
      throw loopPrevented(entity, origin, sourceOfTruth[entity]);
    }
  }

  const inbox = [];

  const provider = {
    providerKey: PROVIDER_KEY,
    scaffold: true,
    contractStatus: 'requires_provider_contract',
    sourceOfTruth,

    setProviderOutage(value) {
      outage = value === true;
    },

    listConflicts() {
      return conflicts.map((conflict) => ({ ...conflict }));
    },

    listEchoDrops() {
      return echoLog.map((entry) => ({ ...entry }));
    },

    // ── BLOCKED live surface (every method throws 503 — no contract) ──
    connectLive() { throw eposmaticBlocked('connectLive'); },
    fetchBranchesLive() { throw eposmaticBlocked('fetchBranchesLive'); },
    fetchMenuLive() { throw eposmaticBlocked('fetchMenuLive'); },
    pushMenuLive() { throw eposmaticBlocked('pushMenuLive'); },
    pushStockPricesLive() { throw eposmaticBlocked('pushStockPricesLive'); },
    pushOrderLive() { throw eposmaticBlocked('pushOrderLive'); },
    pushOrderStatusLive() { throw eposmaticBlocked('pushOrderStatusLive'); },
    verifyWebhookSignatureLive() { throw eposmaticBlocked('verifyWebhookSignatureLive'); },
    pollOrdersLive() { throw eposmaticBlocked('pollOrdersLive'); },

    // ── Capability surface (fixture-backed, authority-gated) ──
    discoverBranches() {
      assertAvailable();
      return engine.discoverBranches();
    },

    /**
     * Menu import = INBOUND provider write (`origin: 'provider'`). Refused
     * with 409 + conflict record when menu is Dilivygo-authoritative.
     */
    importMenu({ items, batchSize, origin } = {}) {
      assertAvailable();
      assertWriteDirection('menu', origin || 'provider');
      return engine.importMenu({
        items,
        batchSize: batchSize !== undefined ? batchSize : EPOSMATIC_FIXTURE_BATCH_LIMIT,
      });
    },

    /**
     * Outbound menu push = Dilivygo-origin write. Refused when the provider
     * owns menu truth. Records the push as an echo marker so a reflected
     * inbound copy is dropped by `handleOrderWebhook`/import rather than
     * re-applied (echo suppression).
     */
    pushMenuFixture({ items }) {
      assertAvailable();
      assertWriteDirection('menu', 'dilivygo');
      const list = Array.isArray(items) ? items : [];
      for (const item of list) {
        if (item && item.externalProductId != null) {
          engine.upsertCatalogEntry(String(item.externalProductId), {
            productId: item.productId || null,
            variantId: item.variantId || null,
            priceCents: Number.isInteger(item.priceCents) ? item.priceCents : 0,
            stock: Number.isInteger(item.stock) ? item.stock : 0,
            echoOrigin: 'dilivygo-echo',
          });
        }
      }
      return { pushed: list.length, authority: sourceOfTruth.menu };
    },

    syncStockPrices({ updates, batchSize, origin } = {}) {
      assertAvailable();
      const resolvedOrigin = origin || 'provider';
      const entity = resolvedOrigin === 'provider' ? 'stock' : 'price';
      assertWriteDirection(entity, resolvedOrigin);
      return engine.syncStockPrices({
        updates,
        batchSize: batchSize !== undefined ? batchSize : EPOSMATIC_FIXTURE_BATCH_LIMIT,
      });
    },

    ingestOrder({ canonical, eventId } = {}) {
      assertAvailable();
      return engine.ingestOrder({ organizationId, canonical, eventId });
    },

    acknowledgeOrder({ externalOrderId, decision, reason } = {}) {
      assertAvailable();
      return engine.acknowledgeOrder({ organizationId, externalOrderId, decision, reason });
    },

    updateOrderStatus({ externalOrderId, to, eventSequence, origin } = {}) {
      assertAvailable();
      if ((origin || 'dilivygo') !== sourceOfTruth.orderStatus) {
        recordConflict({ entity: 'orderStatus', origin: origin || 'dilivygo', externalId: externalOrderId, detail: `refusing ${origin || 'dilivygo'} status move to '${to}'` });
        throw loopPrevented('orderStatus', origin || 'dilivygo', sourceOfTruth.orderStatus);
      }
      return engine.updateOrderStatus({ organizationId, externalOrderId, to, eventSequence });
    },

    cancelOrder({ externalOrderId, reason } = {}) {
      assertAvailable();
      return engine.cancelOrder({ organizationId, externalOrderId, reason });
    },

    reconcileRecent({ snapshot } = {}) {
      assertAvailable();
      return engine.reconcileRecent({ organizationId, snapshot });
    },

    checkHealth() {
      return { ...engine.checkHealth(), outage, sourceOfTruth: { ...sourceOfTruth } };
    },

    /**
     * Fixture webhook/poll entry. Echo suppression: rows stamped
     * `origin: 'dilivygo-echo'` (our own outbound write reflected back) are
     * acked + dropped, never re-applied — the loop killer. Menu-content rows
     * for Dilivygo-authoritative menu become conflicts, not catalog writes.
     */
    handleProviderEvent({ eventId, payload } = {}) {
      assertAvailable();
      if (eventId === undefined || eventId === null || String(eventId).trim().length === 0) {
        throw channelError('ePOSmatic scaffold: event id is required', 400, 'EPOSMATIC_INVALID_EVENT');
      }
      if (!payload || typeof payload !== 'object') {
        throw channelError('ePOSmatic scaffold: event payload is required', 400, 'EPOSMATIC_INVALID_EVENT');
      }
      const existing = inbox.find((row) => row.providerEventId === String(eventId));
      if (existing && existing.status === 'succeeded') {
        return { acked: true, deduped: true, status: existing.status };
      }
      const row = existing || {
        providerKey: PROVIDER_KEY,
        organizationId,
        providerEventId: String(eventId),
        status: 'received',
        attempts: 0,
        payload,
        receivedAt: new Date().toISOString(),
      };
      if (!existing) inbox.push(row);

      if (payload.origin === 'dilivygo-echo') {
        row.status = 'succeeded';
        row.attempts += 1;
        echoLog.push({ eventId: row.providerEventId, droppedAt: new Date().toISOString(), reason: 'own outbound write reflected back; not re-applied' });
        return { acked: true, deduped: true, echoDropped: true, status: row.status };
      }

      if (payload.kind === 'menu' && sourceOfTruth.menu === 'dilivygo') {
        row.status = 'failed';
        row.attempts += 1;
        const conflict = recordConflict({ entity: 'menu', origin: 'provider', externalId: null, detail: 'inbound menu row refused under Dilivygo authority' });
        row.lastError = EPOSMATIC_LOOP_PREVENTED;
        return { acked: true, deduped: false, status: row.status, conflict };
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

    _test: { engine, inbox, conflicts, echoLog },
  };

  return provider;
}

module.exports = {
  createEposmaticChannelProvider,
  EPOSMATIC_CONTRACT_REQUIRED,
  EPOSMATIC_LOOP_PREVENTED,
  EPOSMATIC_FIXTURE_BATCH_LIMIT,
  DEFAULT_SOURCE_OF_TRUTH,
  TRUTH_ENTITIES,
  TRUTH_SIDES,
  FIXTURE_BRANCHES,
};
