'use strict';

/**
 * Order-channel capability tests — Phase 11 (no network, fixture engine only).
 *
 * Covers the shared contract in `services/order-channel-capability.js` that all
 * three scaffolds reuse (dedupe, mapping gate, status guards, normalisation):
 * - canonical normalisation (cents enforcement, raw preservation, warnings,
 *   unknown-field/modifier/variant capture, scheduled handling, no internal id)
 * - duplicate incoming order (event replay + external-id replay dedupe)
 * - unknown SKU (review flag default, fail-closed opt-in)
 * - unmapped branch refusal
 * - menu batch partial failure (failed rows reported, applied rows kept)
 * - order rejection (terminal, reason recorded, double-ack dedupes)
 * - out-of-order status (backward + stale-sequence refused, state unchanged)
 * - reconciliation diff (missing / diverged / matched)
 * - capability flags (menu-write=false never blocks ingestion)
 * - tenant isolation (cross-org access === unknown id, identical 404)
 * - health honesty (never 'healthy')
 */

const {
  ORDER_CHANNEL_CAPABILITIES,
  normalizeExternalOrder,
  createOrderChannelFixtureEngine,
  supportsCapability,
  assertCapabilitiesForIngestion,
  isForwardChannelTransition,
  isTerminalChannelStatus,
  channelError,
} = require('../services/order-channel-capability');

const ORG_A = 'org-channel-test-a';
const ORG_B = 'org-channel-test-b';
const SHOP_1 = '11111111-1111-4111-8111-111111111111';

function baseItems() {
  return [
    {
      externalProductId: 'ext-burger-1',
      name: 'Fixture Burger',
      quantity: 2,
      unitPriceCents: 1200,
      modifiers: [{ externalModifierId: 'ext-mod-cheese', groupName: 'Extras', optionName: 'Cheese', priceCents: 200 }],
    },
  ];
}

function baseCanonical(overrides) {
  return normalizeExternalOrder({
    providerKey: 'blink',
    organizationId: ORG_A,
    externalOrderId: `ext-order-${Math.random().toString(36).slice(2)}`,
    externalBranchId: 'blink-branch-1',
    items: baseItems(),
    subtotalCents: 2800,
    discountCents: 0,
    deliveryFeeCents: 300,
    tipCents: 0,
    taxCents: 0,
    totalCents: 3100,
    currency: 'PKR',
    raw: { fixture: true },
    ...(overrides || {}),
  });
}

function engineFor(providerKey, options) {
  return createOrderChannelFixtureEngine({
    providerKey: providerKey || 'blink',
    organizationId: ORG_A,
    options: {
      branchMap: { 'blink-branch-1': SHOP_1, 'indolj-store-1': SHOP_1, 'eposmatic-branch-1': SHOP_1 },
      fixtureBranches: [{ externalBranchId: 'blink-branch-1', name: 'B1' }],
      ...(options || {}),
    },
  });
}

describe('order-channel capability catalogue', () => {
  test('exposes the full provider surface', () => {
    expect(ORDER_CHANNEL_CAPABILITIES).toEqual([
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
  });

  test('unknown provider key fails with 404', () => {
    expect(() => supportsCapability('nope', 'ingestOrder')).toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test('technosis-bluelink supports nothing (identity-blocked)', () => {
    for (const capability of ORDER_CHANNEL_CAPABILITIES) {
      expect(supportsCapability('technosis-bluelink', capability)).toBe(false);
    }
    expect(() => assertCapabilitiesForIngestion('technosis-bluelink')).toThrow(
      expect.objectContaining({ statusCode: 503 }),
    );
  });

  test('indolj supportsMenuWrite=false does NOT block ingestion', () => {
    expect(supportsCapability('indolj', 'supportsMenuWrite')).toBe(false);
    expect(() => assertCapabilitiesForIngestion('indolj')).not.toThrow();
    expect(() => assertCapabilitiesForIngestion('blink')).not.toThrow();
    expect(() => assertCapabilitiesForIngestion('eposmatic')).not.toThrow();
  });
});

describe('normalizeExternalOrder', () => {
  test('preserves raw payload + external ids and mints no internal id', () => {
    const raw = { anything: 'goes', nested: { deep: [1, 2] } };
    const canonical = baseCanonical({ raw });
    expect(canonical.raw).toBe(raw);
    expect(canonical.externalOrderId).toBeTruthy();
    expect(canonical).not.toHaveProperty('id');
    expect(canonical.shopId).toBeNull();
  });

  test('money must be integer cents: rejects floats, negatives, non-numbers', () => {
    for (const totalCents of [10.5, -100, NaN, '3100', null]) {
      if (totalCents === null) continue; // null means "not stated" -> tested below
      expect(() => baseCanonical({ totalCents })).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });

  test('missing tax/discount/fee/tip default to 0 with warnings (not silent)', () => {
    const canonical = normalizeExternalOrder({
      providerKey: 'blink',
      organizationId: ORG_A,
      externalOrderId: 'ext-warn-1',
      externalBranchId: 'blink-branch-1',
      items: [{ externalProductId: 'x', name: 'X', quantity: 1, unitPriceCents: 500 }],
      subtotalCents: 500,
      totalCents: 500,
      raw: {},
    });
    expect(canonical.taxCents).toBe(0);
    expect(canonical.tipCents).toBe(0);
    expect(canonical.warnings.length).toBeGreaterThan(0);
    expect(canonical.warnings.join(' ')).toMatch(/not stated by provider/);
  });

  test('stated-vs-computed total variance warns but keeps stated total authoritative', () => {
    const canonical = baseCanonical({ totalCents: 9999 });
    expect(canonical.totalCents).toBe(9999);
    expect(canonical.computedTotalCents).toBe(3100);
    expect(canonical.warnings.join(' ')).toMatch(/differs from computed/);
  });

  test('unknown SKU/modifier preserved + flagged, never dropped', () => {
    const canonical = normalizeExternalOrder({
      providerKey: 'indolj',
      organizationId: ORG_A,
      externalOrderId: 'ext-unknown-1',
      externalBranchId: 'indolj-store-1',
      items: [
        { name: 'Mystery dish', quantity: 1, unitPriceCents: 700 },
        {
          externalProductId: 'known-1', name: 'Known', quantity: 1, unitPriceCents: 400,
          modifiers: [{ groupName: 'Size', optionName: 'Large', priceCents: 100 }],
        },
      ],
      subtotalCents: 1200,
      totalCents: 1200,
      raw: {},
    });
    expect(canonical.items).toHaveLength(2);
    expect(canonical.items[0].unmapped).toBe(true);
    expect(canonical.items[1].unknownModifier).toBe(true);
    expect(canonical.warnings.join(' ')).toMatch(/need operator review/);
  });

  test('unknown raw fields echoed in unknownFields', () => {
    const canonical = baseCanonical({ rawFieldNames: ['totalCents', 'blink_rider_note', 'promo_blob'] });
    expect(canonical.unknownFields).toEqual(['blink_rider_note', 'promo_blob']);
  });

  test('scheduled orders normalise to scheduled; bad timestamps fail', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    expect(baseCanonical({ scheduledFor: future }).normalizedStatus).toBe('scheduled');
    expect(baseCanonical().normalizedStatus).toBe('placed');
    expect(() => baseCanonical({ scheduledFor: 'not-a-date' })).toThrow(
      expect.objectContaining({ code: 'CHANNEL_INVALID_SCHEDULE' }),
    );
  });

  test('empty items fail closed', () => {
    expect(() => baseCanonical({ items: [] })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('channel status guards', () => {
  test('forward moves pass; backward/terminal moves refuse', () => {
    expect(isForwardChannelTransition('placed', 'accepted')).toBe(true);
    expect(isForwardChannelTransition('scheduled', 'placed')).toBe(true);
    expect(isForwardChannelTransition('accepted', 'placed')).toBe(false);
    expect(isForwardChannelTransition('completed', 'cancelled')).toBe(false);
    expect(isForwardChannelTransition('preparing', 'cancelled')).toBe(true);
    expect(isForwardChannelTransition('placed', 'bogus')).toBe(false);
    expect(isTerminalChannelStatus('rejected')).toBe(true);
    expect(isTerminalChannelStatus('placed')).toBe(false);
  });

  test('channelError carries statusCode + code', () => {
    const err = channelError('x', 409, 'DEMO');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('DEMO');
  });
});

describe('fixture engine ingestion', () => {
  test('duplicate incoming order: event replay + external-id replay both dedupe', () => {
    const engine = engineFor('blink');
    const canonical = baseCanonical({ externalOrderId: 'ext-dupe-1' });
    const first = engine.ingestOrder({ organizationId: ORG_A, canonical, eventId: 'evt-1' });
    expect(first.deduped).toBe(false);
    const replay = engine.ingestOrder({ organizationId: ORG_A, canonical, eventId: 'evt-1' });
    expect(replay.deduped).toBe(true);
    expect(replay.idempotentReplay).toBe(true);
    const secondEvent = engine.ingestOrder({ organizationId: ORG_A, canonical, eventId: 'evt-2' });
    expect(secondEvent.deduped).toBe(true);
    expect(engine._test.orders.size).toBe(1);
  });

  test('unmapped branch refuses with 409 until mapping is explicit', () => {
    const engine = engineFor('blink', { branchMap: {} });
    expect(() => engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical() }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_BRANCH_UNMAPPED' }));
    engine.setBranchMapping('blink-branch-1', SHOP_1);
    expect(() => engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical() })).not.toThrow();
  });

  test('unknown SKU flags needsReview by default, fails closed when strict', () => {
    const unknown = baseCanonical({
      externalOrderId: 'ext-review-1',
      items: [{ name: 'Ghost', quantity: 1, unitPriceCents: 100 }],
      subtotalCents: 100,
      totalCents: 100,
    });
    const lenientEngine = engineFor('blink');
    const lenient = lenientEngine.ingestOrder({ organizationId: ORG_A, canonical: unknown });
    expect(lenient.needsReview).toBe(true);

    const strict = engineFor('blink', { rejectUnknownSku: true });
    expect(() => strict.ingestOrder({ organizationId: ORG_A, canonical: unknown }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_UNKNOWN_SKU' }));
  });

  test('menu batch partial failure: applied rows kept, failed rows reported', () => {
    const engine = engineFor('blink');
    const result = engine.importMenu({
      batchSize: 2,
      items: [
        { externalProductId: 'a', productId: 'p-a', priceCents: 100 },
        { externalProductId: null },
        { externalProductId: 'c', productId: 'p-c', priceCents: 300, simulateFailure: true },
        { externalProductId: 'd', productId: 'p-d', priceCents: 400 },
      ],
    });
    expect(result.batches).toBe(2);
    expect(result.applied).toEqual(['a', 'd']);
    expect(result.failed).toHaveLength(2);
  });

  test('stock sync partial failure on unknown SKU', () => {
    const engine = engineFor('blink');
    engine.importMenu({ items: [{ externalProductId: 'known', productId: 'p', priceCents: 100, stock: 5 }] });
    const result = engine.syncStockPrices({
      updates: [{ externalProductId: 'known', stock: 3 }, { externalProductId: 'ghost', stock: 1 }],
    });
    expect(result.applied).toEqual(['known']);
    expect(result.failed).toHaveLength(1);
  });

  test('rejection is terminal with reason; double-ack dedupes', () => {
    const engine = engineFor('blink');
    const canonical = baseCanonical({ externalOrderId: 'ext-reject-1' });
    engine.ingestOrder({ organizationId: ORG_A, canonical, eventId: 'evt-r1' });
    const rejected = engine.acknowledgeOrder({
      organizationId: ORG_A, externalOrderId: 'ext-reject-1', decision: 'rejected', reason: 'Kitchen closed',
    });
    expect(rejected.status).toBe('rejected');
    const again = engine.acknowledgeOrder({
      organizationId: ORG_A, externalOrderId: 'ext-reject-1', decision: 'rejected', reason: 'Kitchen closed',
    });
    expect(again.deduped).toBe(true);
    expect(() => engine.updateOrderStatus({ organizationId: ORG_A, externalOrderId: 'ext-reject-1', to: 'accepted' }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
  });

  test('accept then forward statuses; backward + stale-sequence refused, state unchanged', () => {
    const engine = engineFor('blink');
    engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical({ externalOrderId: 'ext-seq-1' }), eventId: 'e1' });
    engine.acknowledgeOrder({ organizationId: ORG_A, externalOrderId: 'ext-seq-1', decision: 'accepted' });
    const moved = engine.updateOrderStatus({
      organizationId: ORG_A, externalOrderId: 'ext-seq-1', to: 'preparing', eventSequence: 2,
    });
    expect(moved.status).toBe('preparing');
    expect(() => engine.updateOrderStatus({
      organizationId: ORG_A, externalOrderId: 'ext-seq-1', to: 'accepted', eventSequence: 3,
    })).toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
    expect(() => engine.updateOrderStatus({
      organizationId: ORG_A, externalOrderId: 'ext-seq-1', to: 'ready', eventSequence: 2,
    })).toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
    const record = engine._test.orders.get(`${ORG_A}:ext-seq-1`);
    expect(record.status).toBe('preparing');
  });

  test('cancel from non-terminal; terminal cancel dedupes', () => {
    const engine = engineFor('blink');
    engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical({ externalOrderId: 'ext-cancel-1' }) });
    expect(engine.cancelOrder({ organizationId: ORG_A, externalOrderId: 'ext-cancel-1' }).status).toBe('cancelled');
    const again = engine.cancelOrder({ organizationId: ORG_A, externalOrderId: 'ext-cancel-1' });
    expect(again.deduped).toBe(true);
  });

  test('reconciliation diffs missing / diverged / matched', () => {
    const engine = engineFor('blink');
    engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical({ externalOrderId: 'ext-rec-1' }), eventId: 'er1' });
    engine.acknowledgeOrder({ organizationId: ORG_A, externalOrderId: 'ext-rec-1', decision: 'accepted' });
    engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical({ externalOrderId: 'ext-rec-2' }), eventId: 'er2' });
    const report = engine.reconcileRecent({
      organizationId: ORG_A,
      snapshot: [
        { externalOrderId: 'ext-rec-1', status: 'accepted' },
        { externalOrderId: 'ext-rec-2', status: 'completed' },
        { externalOrderId: 'ext-rec-missed', status: 'placed' },
      ],
    });
    expect(report.matched).toEqual(['ext-rec-1']);
    expect(report.diverged).toHaveLength(1);
    expect(report.diverged[0].externalOrderId).toBe('ext-rec-2');
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0].externalOrderId).toBe('ext-rec-missed');
  });

  test('tenant isolation: cross-org reads/ingests 404 identically to unknown ids', () => {
    const engine = engineFor('blink');
    engine.ingestOrder({ organizationId: ORG_A, canonical: baseCanonical({ externalOrderId: 'ext-iso-1' }), eventId: 'ei1' });
    expect(() => engine.ingestOrder({ organizationId: ORG_B, canonical: baseCanonical({ externalOrderId: 'ext-iso-1' }) }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => engine.acknowledgeOrder({ organizationId: ORG_B, externalOrderId: 'ext-iso-1', decision: 'accepted' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => engine.acknowledgeOrder({ organizationId: ORG_A, externalOrderId: 'nope', decision: 'accepted' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test('checkHealth never claims healthy', () => {
    const health = engineFor('blink').checkHealth();
    expect(health.status).toBe('scaffold');
    expect(health.status).not.toBe('healthy');
    expect(health.contractStatus).toBe('requires_provider_contract');
  });
});
