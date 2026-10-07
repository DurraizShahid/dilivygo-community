'use strict';

/**
 * Canonical order-channel / POS-channel capability — Phase 11 (External Ordering
 * & POS Channel Integrations: Blink, Indolj, ePOSmatic, Technosis BlueLink).
 *
 * Status: ALL FOUR providers `requires_provider_contract` (Blink / Indolj /
 * ePOSmatic) or identity-blocked (Technosis BlueLink). See
 * `docs/integrations/providers/{blink-co,indolj,eposmatic,technosis-bluelink}.md`
 * and `docs/integrations/inventory.md`. Nothing here performs network I/O,
 * holds credentials, or is reachable from any route — feature-flagged by
 * construction (kit global rules §4, §5, §11).
 *
 * Business code must program against THIS interface (`getOrderChannelProvider`
 * / `createOrderChannelFixtureEngine`) instead of branching on provider names
 * throughout the codebase (kit global rule §17 — mirrors
 * `services/accounting-capability.js` and `services/payment-provider.js`).
 *
 * Interface (every provider adapter implements the same surface):
 *   discoverBranches()        -> { branches: [{ externalBranchId, name }] }
 *   importMenu({ items, batchSize? }) -> { batches, applied, failed[] }
 *   syncStockPrices({ updates, batchSize? }) -> { applied, failed[] }
 *   ingestOrder({ canonical, eventId }) -> { orderRef, deduped, needsReview }
 *   acknowledgeOrder({ externalOrderId, decision, reason? })
 *   updateOrderStatus({ externalOrderId, to, eventSequence? })
 *   cancelOrder({ externalOrderId, reason? })
 *   reconcileRecent({ snapshot }) -> { missing[], diverged[], matched[] }
 *   checkHealth() -> scaffold status object (NEVER 'healthy' — rule §5)
 *
 * Per-provider capability flags (`CHANNEL_PROVIDER_MATRIX.*.supports`) exist so
 * a partial provider never disables what it CAN do: order ingestion asserts
 * only ingest-relevant capabilities, so `supportsMenuWrite === false` does NOT
 * block `ingestOrder` (asserted in tests).
 *
 * External-ID rule (kit global rule §19): external branch / product / order ids
 * are carried on the canonical record and in the `119` mapping tables ONLY.
 * They NEVER become Dilivygo primary keys — `normalizeExternalOrder()` returns
 * no `id` field at all, and `ingestOrder()` keys its dedupe store on the
 * composite `${organizationId}:${providerKey}:${externalOrderId}` while the
 * eventual internal order row gets its own UUID.
 *
 * Money rule: integer cents everywhere. Any non-integer / negative / NaN amount
 * fails closed with 400. Currency is a 3-letter code; no symbols, no floats.
 *
 * Webhook ingestion pattern (designed for the Phase 02 durable inbox
 * `integration_webhook_events`, migration `112`). NO ROUTE IS MOUNTED by this
 * phase — the snippet below is the contract a future route must follow:
 *
 *   // POST /api/webhooks/order-channels/:providerKey  (FUTURE — not mounted)
 *   // 1. verify provider signature (provider-specific scheme, still unverified
 *   //    for all four — real verification is an unblock requirement per doc).
 *   // 2. persist the RAW event to `integration_webhook_events`
 *   //    { provider_key, provider_event_id, payload, payload_hash } and ACK
 *   //    IMMEDIATELY (Blink historically enforces a ~5s webhook timeout, so
 *   //    order creation must never run before the ack).
 *   // 3. asynchronously: normalizeExternalOrder() -> ingestOrder({ canonical,
 *   //    eventId: <provider delivery id> }) — dedupe by event id first, then
 *   //    by (org, provider, externalOrderId), exactly as the fixture engine
 *   //    below does. Out-of-order statuses resolve by forward-rank guard.
 *
 * Separation boundary (sibling phases): cloud order-channel code lives ONLY in
 * `*-channel.scaffold.js` + this file. Delivery-provider work (Phase 10) and
 * local POS-hardware work (Phase 12) must not import or extend this module —
 * no shared files across the three tracks.
 */

const CHANNEL_CONTRACT_REQUIRED_SUFFIX = 'CONTRACT_REQUIRED';

/** Machine-readable gate root shared with every channel scaffold. */
function contractCodeFor(providerKey) {
  return `${String(providerKey || 'channel').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${CHANNEL_CONTRACT_REQUIRED_SUFFIX}`;
}

function channelError(message, statusCode, code, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function assertNonEmptyString(value, field, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw channelError(`Order channel: ${field} is required`, 400, code || 'CHANNEL_INVALID_REQUEST');
  }
  return value.trim();
}

/** Money is integer cents only — never floats, never major units. */
function assertAmountCents(value, field, code) {
  if (!Number.isInteger(value) || value < 0) {
    throw channelError(
      `Order channel: ${field} must be a non-negative integer (minor units, cents)`,
      400,
      code || 'CHANNEL_INVALID_AMOUNT',
    );
  }
  return value;
}

function assertCurrency(value) {
  const currency = assertNonEmptyString(value, 'currency');
  if (!/^[A-Z]{3}$/.test(currency.toUpperCase())) {
    throw channelError('Order channel: currency must be a 3-letter ISO code', 400, 'CHANNEL_INVALID_CURRENCY');
  }
  return currency.toUpperCase();
}

// ─── Capability catalogue ─────────────────────────────────────────────────────

const ORDER_CHANNEL_CAPABILITIES = Object.freeze([
  'discoverBranches',
  'importMenu',
  'syncStockPrices',
  'ingestOrder',
  'acknowledgeOrder',
  'updateOrderStatus',
  'cancelOrder',
  'reconcileRecent',
  'checkHealth',
]);

/**
 * Ingest-relevant capabilities only. `assertCapabilitiesForIngestion()` checks
 * exactly this subset so a provider without menu-write (or without stock sync)
 * still ingests orders. Capability flags must stay accurate per provider pack.
 */
const INGEST_CAPABILITIES = Object.freeze(['ingestOrder', 'acknowledgeOrder', 'updateOrderStatus']);

/**
 * Honesty matrix. `contractStatus` mirrors `docs/integrations/inventory.md`:
 * scaffolded/blocked providers must never surface Connected/Healthy.
 * `supportsMenuWrite: false` (Indolj — menu integration direction unverified)
 * is the live example of a partial flag that must not disable ingestion.
 */
const CHANNEL_PROVIDER_MATRIX = Object.freeze({
  blink: Object.freeze({
    key: 'blink',
    displayName: 'Blink / Blink Co',
    contractStatus: 'requires_provider_contract',
    supports: Object.freeze({
      discoverBranches: true,
      importMenu: true,
      syncStockPrices: true,
      ingestOrder: true,
      acknowledgeOrder: true,
      updateOrderStatus: true,
      cancelOrder: true,
      reconcileRecent: true,
      checkHealth: true,
      supportsMenuWrite: true,
    }),
    note: 'Docs describe branch/menu/stock/order webhooks + separate Logistics API (all NEEDS-REVERIFY). Scaffold only.',
  }),
  indolj: Object.freeze({
    key: 'indolj',
    displayName: 'Indolj',
    contractStatus: 'requires_provider_contract',
    supports: Object.freeze({
      discoverBranches: true,
      importMenu: true,
      syncStockPrices: true,
      ingestOrder: true,
      acknowledgeOrder: true,
      updateOrderStatus: true,
      cancelOrder: true,
      reconcileRecent: false,
      checkHealth: true,
      supportsMenuWrite: false,
    }),
    note: 'Menu integration direction + reconciliation/query APIs unverified — flags stay false until official docs confirm.',
  }),
  eposmatic: Object.freeze({
    key: 'eposmatic',
    displayName: 'ePOSmatic',
    contractStatus: 'requires_provider_contract',
    supports: Object.freeze({
      discoverBranches: true,
      importMenu: true,
      syncStockPrices: true,
      ingestOrder: true,
      acknowledgeOrder: true,
      updateOrderStatus: true,
      cancelOrder: true,
      reconcileRecent: true,
      checkHealth: true,
      supportsMenuWrite: true,
    }),
    note: 'Bidirectional sync modeled with single-authority conflict rules; live transport entirely unverified.',
  }),
  'technosis-bluelink': Object.freeze({
    key: 'technosis-bluelink',
    displayName: 'Technosis BlueLink',
    contractStatus: 'blocked-identity-unknown',
    supports: Object.freeze({
      discoverBranches: false,
      importMenu: false,
      syncStockPrices: false,
      ingestOrder: false,
      acknowledgeOrder: false,
      updateOrderStatus: false,
      cancelOrder: false,
      reconcileRecent: false,
      checkHealth: false,
      supportsMenuWrite: false,
    }),
    note: 'Vendor/product identity unverified — pack forbids any scaffold. No adapter, no validator, no fixture.',
  }),
});

function getChannelProviderMatrix() {
  return CHANNEL_PROVIDER_MATRIX;
}

function normalizeProviderKey(providerKey) {
  const key = String(providerKey || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_PROVIDER_MATRIX, key)) {
    throw channelError(`Unknown order-channel provider: ${providerKey}`, 404, 'CHANNEL_PROVIDER_UNSUPPORTED');
  }
  return key;
}

function supportsCapability(providerKey, capabilityName) {
  const key = normalizeProviderKey(providerKey);
  return Boolean(CHANNEL_PROVIDER_MATRIX[key].supports[capabilityName]);
}

function assertCapability(providerKey, capabilityName) {
  if (!supportsCapability(providerKey, capabilityName)) {
    throw channelError(
      `Order channel provider '${providerKey}' does not support '${capabilityName}'`,
      503,
      `${contractCodeFor(providerKey)}_UNSUPPORTED`,
    );
  }
}

/** Ingestion gate: menu-write (or any non-ingest flag) can never block orders. */
function assertCapabilitiesForIngestion(providerKey) {
  for (const name of INGEST_CAPABILITIES) assertCapability(providerKey, name);
}

// ─── Canonical status flow (subset of Dilivygo order statuses) ───────────────
// Mirrors `models/order.model.js` VALID_STATUSES / STATUS_TRANSITIONS for the
// channel-relevant path. `scheduled -> placed` covers scheduled external
// orders; `rejected` is terminal alongside `cancelled`/`completed`.

const CHANNEL_STATUSES = Object.freeze([
  'scheduled',
  'placed',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled',
  'rejected',
]);

const CHANNEL_STATUS_RANK = Object.freeze({
  scheduled: 0,
  placed: 1,
  accepted: 2,
  preparing: 3,
  ready: 4,
  completed: 5,
  cancelled: 90,
  rejected: 90,
});

const CHANNEL_TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled', 'rejected']);

function isTerminalChannelStatus(status) {
  return CHANNEL_TERMINAL_STATUSES.includes(status);
}

/**
 * Forward-only guard for out-of-order provider events. Returns true when `to`
 * may legally follow `from`; late/duplicate deliveries (same or lower rank,
 * or any move out of a terminal state) return false and the caller must leave
 * state untouched and report the event as stale (409 CHANNEL_OUT_OF_ORDER).
 * `cancelled`/`rejected` are reachable from any non-terminal state.
 */
function isForwardChannelTransition(from, to) {
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_STATUS_RANK, from)
    || !Object.prototype.hasOwnProperty.call(CHANNEL_STATUS_RANK, to)) return false;
  if (isTerminalChannelStatus(from)) return false;
  if (to === 'cancelled' || to === 'rejected') return true;
  if (from === 'scheduled' && to === 'placed') return true;
  return CHANNEL_STATUS_RANK[to] > CHANNEL_STATUS_RANK[from];
}

// ─── Canonical external order normalisation ───────────────────────────────────

/**
 * Fields the normaliser understands on its structured input. Anything carried
 * on `raw` beyond these is preserved verbatim on `raw` AND listed in
 * `unknownFields` when the caller passes `rawFieldNames` — unknown provider
 * fields are never silently dropped and never crash normalisation.
 */
const CANONICAL_INPUT_FIELDS = Object.freeze([
  'providerKey',
  'organizationId',
  'externalOrderId',
  'externalBranchId',
  'providerStatus',
  'items',
  'subtotalCents',
  'discountCents',
  'deliveryFeeCents',
  'tipCents',
  'taxCents',
  'totalCents',
  'currency',
  'scheduledFor',
  'customer',
]);

function normalizeChannelItem(item, index) {
  const source = item || {};
  const label = `items[${index}]`;
  const quantity = Number(source.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw channelError(`Order channel: ${label}.quantity must be a positive integer`, 400, 'CHANNEL_INVALID_ITEM');
  }
  const entry = {
    // External catalogue reference — mapping-table key, never an internal PK.
    externalProductId: source.externalProductId != null ? String(source.externalProductId) : null,
    externalVariantId: source.externalVariantId != null ? String(source.externalVariantId) : null,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `Unmapped item ${index + 1}`,
    quantity,
    unitPriceCents: assertAmountCents(source.unitPriceCents, `${label}.unitPriceCents`),
    notes: typeof source.notes === 'string' ? source.notes : null,
    modifiers: [],
    unmapped: false,
    unknownModifier: false,
  };
  // Unknown SKU: preserved with a flag for operator review — never dropped.
  if (!entry.externalProductId) entry.unmapped = true;
  const modifiers = Array.isArray(source.modifiers) ? source.modifiers : [];
  for (const mod of modifiers) {
    const option = {
      externalModifierId: mod && mod.externalModifierId != null ? String(mod.externalModifierId) : null,
      groupName: mod && typeof mod.groupName === 'string' ? mod.groupName : null,
      optionName: mod && typeof mod.optionName === 'string' ? mod.optionName : null,
      priceCents: assertAmountCents(Number(mod ? mod.priceCents || 0 : 0), `${label}.modifiers.priceCents`),
    };
    if (!option.externalModifierId) entry.unknownModifier = true;
    entry.modifiers.push(Object.freeze(option));
  }
  if (entry.unmapped || entry.unknownModifier) entry.unmapped = true;
  return Object.freeze(entry);
}

/**
 * Normalise one external order to the canonical schema.
 *
 * Defensive rules (all covered by tests):
 * - `raw` (the original provider payload) is preserved verbatim; external ids
 *   are carried as data, never promoted to internal PKs (no `id` is minted).
 * - Money: integer cents. Missing tax/discount/fee/tip default to 0 WITH a
 *   warning entry (provider did not state them — not the same as zero, and
 *   operators must be able to tell). A stated-vs-computed total variance is
 *   recorded as a warning; the STATED total is authoritative and both values
 *   are kept (`totalCents` + `computedTotalCents`).
 * - Modifiers/variants: unknown ids preserved + flagged, never dropped.
 * - Scheduled: `scheduledFor` must be a valid future ISO timestamp when
 *   present; past values warn (provider clock skew) but do not fail.
 * - `rawFieldNames` (optional string[]): names of fields present on the raw
 *   provider payload — anything outside CANONICAL_INPUT_FIELDS is echoed in
 *   `unknownFields` for mapping follow-ups.
 */
function normalizeExternalOrder(input) {
  const args = input || {};
  const providerKey = normalizeProviderKey(args.providerKey);
  const organizationId = assertNonEmptyString(args.organizationId, 'organizationId');
  const externalOrderId = assertNonEmptyString(args.externalOrderId, 'externalOrderId');
  const externalBranchId = assertNonEmptyString(args.externalBranchId, 'externalBranchId');

  const currency = args.currency === undefined || args.currency === null
    ? 'PKR'
    : assertCurrency(args.currency);
  const currencyDefaulted = args.currency === undefined || args.currency === null;

  const rawItems = Array.isArray(args.items) ? args.items : null;
  if (!rawItems || rawItems.length === 0) {
    throw channelError('Order channel: items must be a non-empty array', 400, 'CHANNEL_INVALID_ITEM');
  }
  const items = rawItems.map((item, index) => normalizeChannelItem(item, index));

  const warnings = [];
  const pickAmount = (field, { defaultedWarning } = {}) => {
    if (args[field] === undefined || args[field] === null) {
      if (defaultedWarning) warnings.push(defaultedWarning);
      return 0;
    }
    return assertAmountCents(args[field], field);
  };
  const subtotalCents = pickAmount('subtotalCents');
  const discountCents = pickAmount('discountCents', { defaultedWarning: 'discountCents not stated by provider; defaulted to 0' });
  const deliveryFeeCents = pickAmount('deliveryFeeCents', { defaultedWarning: 'deliveryFeeCents not stated by provider; defaulted to 0' });
  const tipCents = pickAmount('tipCents', { defaultedWarning: 'tipCents not stated by provider; defaulted to 0' });
  const taxCents = pickAmount('taxCents', { defaultedWarning: 'taxCents not stated by provider; defaulted to 0' });
  const totalCents = pickAmount('totalCents');
  if (currencyDefaulted) warnings.push('currency not stated by provider; defaulted to PKR');

  const linesTotal = items.reduce((sum, item) => {
    const mods = item.modifiers.reduce((acc, mod) => acc + mod.priceCents, 0);
    return sum + item.quantity * (item.unitPriceCents + mods);
  }, 0);
  const computedTotalCents = linesTotal - discountCents + deliveryFeeCents + tipCents + taxCents;
  if (computedTotalCents !== totalCents) {
    warnings.push(
      `stated total ${totalCents} differs from computed ${computedTotalCents}; stated total is authoritative`,
    );
  }

  let scheduledFor = null;
  if (args.scheduledFor !== undefined && args.scheduledFor !== null) {
    const parsed = new Date(args.scheduledFor);
    if (Number.isNaN(parsed.getTime())) {
      throw channelError('Order channel: scheduledFor must be a valid ISO timestamp', 400, 'CHANNEL_INVALID_SCHEDULE');
    }
    scheduledFor = parsed.toISOString();
    if (parsed.getTime() < Date.now()) warnings.push('scheduledFor is in the past; possible provider clock skew');
  }

  const customer = args.customer && typeof args.customer === 'object' ? {
    name: typeof args.customer.name === 'string' ? args.customer.name : null,
    phone: typeof args.customer.phone === 'string' ? args.customer.phone : null,
  } : null;

  const providerStatus = args.providerStatus !== undefined && args.providerStatus !== null
    ? String(args.providerStatus)
    : null;

  const rawFieldNames = Array.isArray(args.rawFieldNames) ? args.rawFieldNames : [];
  const unknownFields = rawFieldNames.filter((name) => !CANONICAL_INPUT_FIELDS.includes(name));

  const unmappedItems = items.filter((item) => item.unmapped).length;
  if (unmappedItems > 0) {
    warnings.push(`${unmappedItems} item(s) carry unknown SKU/modifier references and need operator review`);
  }

  return Object.freeze({
    providerKey,
    organizationId,
    // External identifiers — data only. The internal order row (created later
    // by the order service) mints its own UUID; nothing here is a PK.
    externalOrderId,
    externalBranchId,
    shopId: null, // resolved via branch mapping at ingest time, never guessed.
    items,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    tipCents,
    taxCents,
    totalCents,
    computedTotalCents,
    currency,
    scheduledFor,
    normalizedStatus: scheduledFor ? 'scheduled' : 'placed',
    providerStatus,
    customer,
    warnings: Object.freeze(warnings.slice()),
    unknownFields: Object.freeze(unknownFields.slice()),
    raw: args.raw === undefined ? null : args.raw,
  });
}

// ─── Fixture engine (shared dedupe / mapping-gate / status-guard logic) ──────
// Pure in-memory behaviour shared by the three scaffolds so the guards are
// implemented ONCE and tested once in `tests/order-channel-capability.test.js`.
// Provider scaffolds wrap this engine with their key, fixtures, and 503 gates.

function createOrderChannelFixtureEngine({ providerKey, organizationId, options } = {}) {
  const key = normalizeProviderKey(providerKey);
  const orgId = assertNonEmptyString(organizationId, 'organizationId');
  const opts = options || {};
  // Branch mapping gate: sync/ingest refuse until mapping is explicit, mirroring
  // the Blink pack requirement ("prevent sync until branch mapping is explicit").
  const branchMap = new Map(Object.entries(opts.branchMap || {})); // externalBranchId -> shopId
  const catalog = new Map(); // externalProductId -> { productId, variantId, priceCents, stock }
  for (const [externalId, entry] of Object.entries(opts.catalog || {})) {
    catalog.set(String(externalId), { ...entry });
  }
  const orders = new Map(); // `${orgId}:${externalOrderId}` -> record
  const processedEvents = new Map(); // eventId -> order key (webhook dedupe)
  const allowUnmappedBranch = opts.allowUnmappedBranch === true;
  const rejectUnknownSku = opts.rejectUnknownSku === true;

  function scopedOrganizationId(callerOrgId) {
    const caller = assertNonEmptyString(callerOrgId, 'organizationId');
    // Identical 404 whether the org is unknown or the record belongs to another
    // org: tenant isolation by construction, no cross-tenant oracle.
    if (caller !== orgId) {
      throw channelError('Order channel: order not found', 404, 'CHANNEL_ORDER_NOT_FOUND');
    }
    return caller;
  }

  function orderKeyFor(callerOrgId, externalOrderId) {
    scopedOrganizationId(callerOrgId);
    return `${orgId}:${assertNonEmptyString(externalOrderId, 'externalOrderId')}`;
  }

  function resolveShopId(externalBranchId) {
    const branchId = assertNonEmptyString(externalBranchId, 'externalBranchId');
    const shopId = branchMap.get(branchId);
    if (!shopId && !allowUnmappedBranch) {
      throw channelError(
        `Order channel: branch '${branchId}' is not mapped to a Dilivygo shop; complete branch mapping before sync`,
        409,
        'CHANNEL_BRANCH_UNMAPPED',
      );
    }
    return shopId || null;
  }

  function publicOrder(record) {
    return {
      providerKey: key,
      organizationId: record.organizationId,
      externalOrderId: record.externalOrderId,
      shopId: record.shopId,
      status: record.status,
      decision: record.decision,
      needsReview: record.needsReview,
      warnings: record.warnings.slice(),
      canonical: record.canonical,
    };
  }

  const engine = {
    providerKey: key,
    organizationId: orgId,

    setBranchMapping(externalBranchId, shopId) {
      branchMap.set(
        assertNonEmptyString(externalBranchId, 'externalBranchId'),
        assertNonEmptyString(shopId, 'shopId'),
      );
    },

    upsertCatalogEntry(externalProductId, entry) {
      catalog.set(assertNonEmptyString(externalProductId, 'externalProductId'), { ...(entry || {}) });
    },

    discoverBranches() {
      assertCapability(key, 'discoverBranches');
      return {
        branches: (opts.fixtureBranches || []).map((branch) => ({
          externalBranchId: String(branch.externalBranchId),
          name: branch.name || null,
          mappedShopId: branchMap.get(String(branch.externalBranchId)) || null,
        })),
      };
    },

    importMenu({ items, batchSize } = {}) {
      assertCapability(key, 'importMenu');
      const list = Array.isArray(items) ? items : [];
      const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 50;
      const applied = [];
      const failed = [];
      const batches = Math.ceil(list.length / size);
      for (const item of list) {
        const externalId = item && item.externalProductId != null ? String(item.externalProductId) : '';
        if (!externalId) {
          failed.push({ externalProductId: null, error: 'externalProductId is required' });
          continue;
        }
        if (item && item.simulateFailure === true) {
          failed.push({ externalProductId: externalId, error: 'provider rejected batch row (fixture)' });
          continue;
        }
        catalog.set(externalId, {
          productId: item.productId || null,
          variantId: item.variantId || null,
          priceCents: Number.isInteger(item.priceCents) ? item.priceCents : 0,
          stock: Number.isInteger(item.stock) ? item.stock : 0,
        });
        applied.push(externalId);
      }
      return { batches, batchSize: size, applied, failed };
    },

    syncStockPrices({ updates, batchSize } = {}) {
      assertCapability(key, 'syncStockPrices');
      const list = Array.isArray(updates) ? updates : [];
      const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 50;
      const applied = [];
      const failed = [];
      for (const update of list) {
        const externalId = update && update.externalProductId != null ? String(update.externalProductId) : '';
        const entry = catalog.get(externalId);
        if (!externalId || !entry) {
          failed.push({ externalProductId: externalId || null, error: 'unknown SKU for this tenant (no catalog mapping)' });
          continue;
        }
        if (update && update.simulateFailure === true) {
          failed.push({ externalProductId: externalId, error: 'provider rejected stock/price row (fixture)' });
          continue;
        }
        if (update.priceCents !== undefined) entry.priceCents = assertAmountCents(update.priceCents, 'priceCents');
        if (update.stock !== undefined) {
          if (!Number.isInteger(update.stock) || update.stock < 0) {
            failed.push({ externalProductId: externalId, error: 'stock must be a non-negative integer' });
            continue;
          }
          entry.stock = update.stock;
        }
        applied.push(externalId);
      }
      return { batches: Math.ceil(list.length / size), batchSize: size, applied, failed };
    },

    /**
     * Retry-safe ingestion. Dedupe order: (1) webhook event id replay returns
     * the original result with `deduped: true`; (2) same external order id
     * returns the stored record without re-finalizing. Unknown SKUs flag
     * `needsReview` (or fail closed with 422 when `rejectUnknownSku`).
     */
    ingestOrder({ organizationId: callerOrgId, canonical, eventId } = {}) {
      assertCapabilitiesForIngestion(key);
      if (!canonical || typeof canonical !== 'object' || canonical.providerKey !== key) {
        throw channelError('Order channel: canonical order does not belong to this provider', 400, 'CHANNEL_INVALID_ORDER');
      }
      const caller = scopedOrganizationId(callerOrgId);
      if (canonical.organizationId !== caller) {
        throw channelError('Order channel: order not found', 404, 'CHANNEL_ORDER_NOT_FOUND');
      }
      const orderKey = `${orgId}:${canonical.externalOrderId}`;
      if (eventId !== undefined && eventId !== null) {
        const priorKey = processedEvents.get(String(eventId));
        if (priorKey && orders.has(priorKey)) {
          return { ...publicOrder(orders.get(priorKey)), deduped: true, idempotentReplay: true };
        }
      }
      const existing = orders.get(orderKey);
      if (existing) {
        if (eventId !== undefined && eventId !== null) processedEvents.set(String(eventId), orderKey);
        return { ...publicOrder(existing), deduped: true, idempotentReplay: true };
      }
      const shopId = resolveShopId(canonical.externalBranchId);
      const unknownSkus = canonical.items
        .filter((item) => item.unmapped)
        .map((item) => item.externalProductId || item.name);
      if (unknownSkus.length > 0 && rejectUnknownSku) {
        throw channelError(
          `Order channel: ${unknownSkus.length} item(s) reference unknown SKUs`,
          422,
          'CHANNEL_UNKNOWN_SKU',
          { unknownSkus },
        );
      }
      const record = {
        organizationId: caller,
        externalOrderId: canonical.externalOrderId,
        shopId,
        status: canonical.normalizedStatus,
        decision: null,
        needsReview: unknownSkus.length > 0,
        warnings: canonical.warnings.concat(
          unknownSkus.length > 0 ? [`unknown SKUs held for review: ${unknownSkus.join(', ')}`] : [],
        ),
        statusHistory: [{ status: canonical.normalizedStatus, at: new Date().toISOString(), eventSequence: 0 }],
        canonical,
        createdAt: new Date().toISOString(),
      };
      orders.set(orderKey, record);
      if (eventId !== undefined && eventId !== null) processedEvents.set(String(eventId), orderKey);
      return { ...publicOrder(record), deduped: false, idempotentReplay: false };
    },

    acknowledgeOrder({ organizationId: callerOrgId, externalOrderId, decision, reason } = {}) {
      assertCapabilitiesForIngestion(key);
      const orderKey = orderKeyFor(callerOrgId, externalOrderId);
      const record = orders.get(orderKey);
      if (!record) throw channelError('Order channel: order not found', 404, 'CHANNEL_ORDER_NOT_FOUND');
      if (record.decision) return { ...publicOrder(record), deduped: true };
      if (decision !== 'accepted' && decision !== 'rejected') {
        throw channelError("Order channel: decision must be 'accepted' or 'rejected'", 400, 'CHANNEL_INVALID_DECISION');
      }
      if (record.status !== 'placed' && record.status !== 'scheduled') {
        throw channelError(
          `Order channel: order can no longer be acknowledged from status '${record.status}'`,
          409,
          'CHANNEL_ACK_TOO_LATE',
        );
      }
      record.decision = decision;
      if (decision === 'rejected') {
        if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length === 0)) {
          throw channelError('Order channel: rejection reason must be a non-empty string when provided', 400, 'CHANNEL_INVALID_DECISION');
        }
        record.status = 'rejected';
        record.rejectionReason = reason ? reason.trim() : null;
      } else {
        record.status = 'accepted';
      }
      record.statusHistory.push({ status: record.status, at: new Date().toISOString(), decision });
      return publicOrder(record);
    },

    /**
     * Forward-only status updates. Stale / backward / duplicate-sequence events
     * leave state untouched and throw 409 CHANNEL_OUT_OF_ORDER so the caller
     * can ack-and-drop (webhook redelivery) without corrupting fulfilment.
     */
    updateOrderStatus({ organizationId: callerOrgId, externalOrderId, to, eventSequence } = {}) {
      assertCapabilitiesForIngestion(key);
      const orderKey = orderKeyFor(callerOrgId, externalOrderId);
      const record = orders.get(orderKey);
      if (!record) throw channelError('Order channel: order not found', 404, 'CHANNEL_ORDER_NOT_FOUND');
      const target = assertNonEmptyString(to, 'to');
      if (!Object.prototype.hasOwnProperty.call(CHANNEL_STATUS_RANK, target)) {
        throw channelError(`Order channel: unknown status '${target}'`, 400, 'CHANNEL_INVALID_STATUS');
      }
      const lastSequence = record.statusHistory.length > 0
        ? record.statusHistory[record.statusHistory.length - 1].eventSequence || 0
        : 0;
      if (eventSequence !== undefined && eventSequence !== null && Number(eventSequence) <= lastSequence) {
        throw channelError(
          `Order channel: stale status event (sequence ${eventSequence} <= ${lastSequence}); state unchanged`,
          409,
          'CHANNEL_OUT_OF_ORDER',
        );
      }
      if (!isForwardChannelTransition(record.status, target)) {
        throw channelError(
          `Order channel: refusing backward/terminal status move ${record.status} -> ${target}; state unchanged`,
          409,
          'CHANNEL_OUT_OF_ORDER',
        );
      }
      record.status = target;
      record.statusHistory.push({
        status: target,
        at: new Date().toISOString(),
        eventSequence: eventSequence !== undefined && eventSequence !== null ? Number(eventSequence) : lastSequence + 1,
      });
      return publicOrder(record);
    },

    cancelOrder({ organizationId: callerOrgId, externalOrderId, reason } = {}) {
      assertCapability(key, 'cancelOrder');
      const orderKey = orderKeyFor(callerOrgId, externalOrderId);
      const record = orders.get(orderKey);
      if (!record) throw channelError('Order channel: order not found', 404, 'CHANNEL_ORDER_NOT_FOUND');
      if (isTerminalChannelStatus(record.status)) {
        return { ...publicOrder(record), deduped: true };
      }
      record.status = 'cancelled';
      record.cancelReason = reason ? String(reason) : null;
      record.statusHistory.push({ status: 'cancelled', at: new Date().toISOString() });
      return publicOrder(record);
    },

    /**
     * Missed-webhook detection. `snapshot` is the provider-side recent-orders
     * listing (external ids + statuses): `missing` = provider knows an order
     * we never ingested; `diverged` = both sides know it but statuses differ;
     * `matched` = agreement. Pure diff — repairs happen through ingestOrder /
     * updateOrderStatus, never here.
     */
    reconcileRecent({ organizationId: callerOrgId, snapshot } = {}) {
      assertCapability(key, 'reconcileRecent');
      scopedOrganizationId(callerOrgId);
      const rows = Array.isArray(snapshot) ? snapshot : [];
      const missing = [];
      const diverged = [];
      const matched = [];
      for (const row of rows) {
        const externalId = row && row.externalOrderId != null ? String(row.externalOrderId) : '';
        if (!externalId) continue;
        const record = orders.get(`${orgId}:${externalId}`);
        if (!record) {
          missing.push({ externalOrderId: externalId, providerStatus: row.status || null });
          continue;
        }
        if (row.status && String(row.status) !== record.status) {
          diverged.push({ externalOrderId: externalId, localStatus: record.status, providerStatus: String(row.status) });
        } else {
          matched.push(externalId);
        }
      }
      return { missing, diverged, matched };
    },

    /**
     * Honest scaffold health (rule §5): reports `scaffold` + contract state +
     * fixture counters. NEVER `healthy` — there is no live credential check.
     */
    checkHealth() {
      assertCapability(key, 'checkHealth');
      return Object.freeze({
        provider: key,
        status: 'scaffold',
        contractStatus: CHANNEL_PROVIDER_MATRIX[key].contractStatus,
        checkedAt: new Date().toISOString(),
        counters: { orders: orders.size, processedEvents: processedEvents.size, catalogEntries: catalog.size },
        action: 'Complete provider contracting (see provider doc) before any live health claim',
      });
    },

    _test: { orders, processedEvents, catalog, branchMap },
  };

  return engine;
}

module.exports = {
  ORDER_CHANNEL_CAPABILITIES,
  INGEST_CAPABILITIES,
  CHANNEL_PROVIDER_MATRIX,
  CHANNEL_STATUSES,
  CHANNEL_TERMINAL_STATUSES,
  CANONICAL_INPUT_FIELDS,
  channelError,
  contractCodeFor,
  assertAmountCents,
  assertCurrency,
  getChannelProviderMatrix,
  normalizeProviderKey,
  supportsCapability,
  assertCapability,
  assertCapabilitiesForIngestion,
  isTerminalChannelStatus,
  isForwardChannelTransition,
  normalizeExternalOrder,
  createOrderChannelFixtureEngine,
};
