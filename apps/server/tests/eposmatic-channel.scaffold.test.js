'use strict';

/**
 * ePOSmatic channel scaffold tests — Phase 11 (no network, fixtures only).
 *
 * Pack case map (`providers/eposmatic.md` §Provider-specific tests):
 * - Branch mapping (explicit-mapping gate)
 * - Bidirectional loop prevention (cross-authority refused, echo dropped)
 * - Duplicate order (event-id dedupe)
 * - Menu conflict (provider push under Dilivygo authority)
 * - Stock sync race (sequence guard via engine)
 * - Provider outage (502 drill on sync paths, live still 503)
 * - Reconciliation (missed-event diff)
 * - Tenant isolation
 * - Source-of-truth config validation (validator enum)
 */

const {
  createEposmaticChannelProvider,
  EPOSMATIC_CONTRACT_REQUIRED,
  EPOSMATIC_LOOP_PREVENTED,
  DEFAULT_SOURCE_OF_TRUTH,
} = require('../services/eposmatic-channel.scaffold');

const { eposmaticChannelConfigSchema } = require('../validators/eposmatic-channel.validator');

const ORG_A = 'org-epos-test-a';
const ORG_B = 'org-epos-test-b';
const SHOP_1 = '11111111-1111-4111-8111-111111111111';

function providerFor(overrides) {
  return createEposmaticChannelProvider({
    organizationId: ORG_A,
    branchMap: { 'eposmatic-branch-1': SHOP_1 },
    ...(overrides || {}),
  });
}

function orderPayload(overrides) {
  return {
    externalOrderId: `epos-order-${Math.random().toString(36).slice(2)}`,
    externalBranchId: 'eposmatic-branch-1',
    providerStatus: 'POS_ORDER',
    items: [{ externalProductId: 'ext-karahi-1', name: 'Fixture Karahi', quantity: 1, unitPriceCents: 1800 }],
    subtotalCents: 1800,
    discountCents: 0,
    deliveryFeeCents: 0,
    tipCents: 0,
    taxCents: 0,
    totalCents: 1800,
    currency: 'PKR',
    rawFieldNames: ['providerStatus'],
    ...(overrides || {}),
  };
}

describe('eposmatic scaffold — branch mapping + duplicate order', () => {
  test('ingest refuses unmapped branches until mapping is explicit', () => {
    const eposmatic = providerFor({ branchMap: {} });
    expect(eposmatic.discoverBranches().branches.map((branch) => branch.externalBranchId))
      .toContain('eposmatic-branch-1');
    expect(() => eposmatic.handleProviderEvent({ eventId: 'epos-evt-unmapped-1', payload: orderPayload() }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_BRANCH_UNMAPPED' }));
  });

  test('duplicate order event dedupes by provider event id', () => {
    const eposmatic = providerFor();
    const payload = orderPayload({ externalOrderId: 'epos-dupe-1' });
    const first = eposmatic.handleProviderEvent({ eventId: 'epos-evt-1', payload });
    expect(first.deduped).toBe(false);
    const replay = eposmatic.handleProviderEvent({ eventId: 'epos-evt-1', payload });
    expect(replay.deduped).toBe(true);
    expect(eposmatic._test.engine._test.orders.size).toBe(1);
  });
});

describe('eposmatic scaffold — bidirectional loop prevention', () => {
  test('default authority: POS owns menu/price/stock, Dilivygo owns order status', () => {
    expect(DEFAULT_SOURCE_OF_TRUTH).toEqual({ menu: 'provider', price: 'provider', stock: 'provider', orderStatus: 'dilivygo' });
    expect(providerFor().sourceOfTruth).toEqual(DEFAULT_SOURCE_OF_TRUTH);
  });

  test('inbound menu write under Dilivygo authority is refused + recorded as conflict', () => {
    const eposmatic = providerFor({ sourceOfTruth: { menu: 'dilivygo' } });
    let error = null;
    try {
      eposmatic.importMenu({ items: [{ externalProductId: 'x', productId: 'p', priceCents: 100 }] });
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe(EPOSMATIC_LOOP_PREVENTED);
    expect(eposmatic._test.engine._test.catalog.has('x')).toBe(false);
    const conflicts = eposmatic.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entity).toBe('menu');
    expect(conflicts[0].authority).toBe('dilivygo');
  });

  test('outbound menu push under provider authority is refused (no ping-pong)', () => {
    const eposmatic = providerFor();
    expect(() => eposmatic.pushMenuFixture({ items: [{ externalProductId: 'x', priceCents: 100 }] }))
      .toThrow(expect.objectContaining({ code: EPOSMATIC_LOOP_PREVENTED }));
  });

  test('outbound push under Dilivygo authority succeeds; reflected echo is dropped, never re-applied', () => {
    const eposmatic = providerFor({ sourceOfTruth: { menu: 'dilivygo' } });
    const pushed = eposmatic.pushMenuFixture({
      items: [{ externalProductId: 'echo-item-1', productId: 'p-echo', priceCents: 700, stock: 5 }],
    });
    expect(pushed.pushed).toBe(1);

    const echo = eposmatic.handleProviderEvent({
      eventId: 'epos-evt-echo-1',
      payload: { origin: 'dilivygo-echo', kind: 'menu', externalProductId: 'echo-item-1' },
    });
    expect(echo.acked).toBe(true);
    expect(echo.echoDropped).toBe(true);
    expect(eposmatic.listEchoDrops()).toHaveLength(1);
    expect(eposmatic._test.engine._test.orders.size).toBe(0);
  });

  test('inbound menu event under Dilivygo authority becomes a conflict, not a catalog write', () => {
    const eposmatic = providerFor({ sourceOfTruth: { menu: 'dilivygo' } });
    const result = eposmatic.handleProviderEvent({
      eventId: 'epos-evt-menu-conflict-1',
      payload: { origin: 'provider', kind: 'menu', externalProductId: 'conflict-item-1' },
    });
    expect(result.acked).toBe(true);
    expect(result.conflict.entity).toBe('menu');
    expect(eposmatic._test.engine._test.catalog.has('conflict-item-1')).toBe(false);
  });

  test('provider status move under Dilivygo order-status authority is refused', () => {
    const eposmatic = providerFor();
    eposmatic.handleProviderEvent({ eventId: 'epos-evt-st-1', payload: orderPayload({ externalOrderId: 'epos-st-1' }) });
    expect(() => eposmatic.updateOrderStatus({ externalOrderId: 'epos-st-1', to: 'completed', origin: 'provider' }))
      .toThrow(expect.objectContaining({ code: EPOSMATIC_LOOP_PREVENTED }));
    expect(eposmatic._test.engine._test.orders.get(`${ORG_A}:epos-st-1`).status).toBe('placed');
  });
});

describe('eposmatic scaffold — menu conflict, stock race, outage, reconciliation', () => {
  test('menu import applies under provider authority; bad rows reported', () => {
    const eposmatic = providerFor();
    const result = eposmatic.importMenu({
      items: [
        { externalProductId: 'epos-item-1', productId: 'p-1', priceCents: 500, stock: 6 },
        { externalProductId: null },
      ],
    });
    expect(result.applied).toEqual(['epos-item-1']);
    expect(result.failed).toHaveLength(1);
  });

  test('stock sync race: stale sequence loses via engine guard', () => {
    const eposmatic = providerFor();
    eposmatic.handleProviderEvent({ eventId: 'epos-evt-race-1', payload: orderPayload({ externalOrderId: 'epos-race-1' }) });
    eposmatic.acknowledgeOrder({ externalOrderId: 'epos-race-1', decision: 'accepted' });
    eposmatic.updateOrderStatus({ externalOrderId: 'epos-race-1', to: 'preparing', eventSequence: 4 });
    expect(() => eposmatic.updateOrderStatus({ externalOrderId: 'epos-race-1', to: 'ready', eventSequence: 3 }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
    expect(eposmatic._test.engine._test.orders.get(`${ORG_A}:epos-race-1`).status).toBe('preparing');
  });

  test('provider outage drill: sync paths 502, live paths stay 503', () => {
    const eposmatic = providerFor({ providerOutage: true });
    let syncError = null;
    try {
      eposmatic.discoverBranches();
    } catch (err) {
      syncError = err;
    }
    expect(syncError).not.toBeNull();
    expect(syncError.statusCode).toBe(502);
    expect(syncError.code).toBe('EPOSMATIC_PROVIDER_OUTAGE');

    let liveError = null;
    try {
      eposmatic.pushOrderLive();
    } catch (err) {
      liveError = err;
    }
    expect(liveError).not.toBeNull();
    expect(liveError.statusCode).toBe(503);
    expect(liveError.code).toBe(EPOSMATIC_CONTRACT_REQUIRED);

    eposmatic.setProviderOutage(false);
    expect(eposmatic.discoverBranches().branches.length).toBeGreaterThan(0);
  });

  test('reconciliation surfaces missed provider events', () => {
    const eposmatic = providerFor();
    eposmatic.handleProviderEvent({ eventId: 'epos-evt-rec-1', payload: orderPayload({ externalOrderId: 'epos-rec-1' }) });
    const report = eposmatic.reconcileRecent({
      snapshot: [
        { externalOrderId: 'epos-rec-1', status: 'placed' },
        { externalOrderId: 'epos-rec-missed', status: 'placed' },
      ],
    });
    expect(report.matched).toEqual(['epos-rec-1']);
    expect(report.missing.map((row) => row.externalOrderId)).toEqual(['epos-rec-missed']);
  });

  test('tenant isolation: cross-org access 404s', () => {
    const eposmatic = providerFor();
    eposmatic.handleProviderEvent({ eventId: 'epos-evt-iso-1', payload: orderPayload({ externalOrderId: 'epos-iso-1' }) });
    const otherOrg = createEposmaticChannelProvider({ organizationId: ORG_B, branchMap: { 'eposmatic-branch-1': SHOP_1 } });
    expect(() => otherOrg.cancelOrder({ externalOrderId: 'epos-iso-1' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test('cancel + health honesty', () => {
    const eposmatic = providerFor();
    eposmatic.handleProviderEvent({ eventId: 'epos-evt-cancel-1', payload: orderPayload({ externalOrderId: 'epos-cancel-1' }) });
    expect(eposmatic.cancelOrder({ externalOrderId: 'epos-cancel-1', reason: 'POS void' }).status).toBe('cancelled');
    const health = eposmatic.checkHealth();
    expect(health.status).toBe('scaffold');
    expect(health.status).not.toBe('healthy');
  });
});

describe('eposmatic channel config validator', () => {
  const shopId = SHOP_1;

  test('accepts defaults (POS catalogue truth, Dilivygo fulfilment truth)', () => {
    const parsed = eposmaticChannelConfigSchema.parse({ environment: 'sandbox' });
    expect(parsed.sourceOfTruth).toMatchObject({ menu: 'provider', orderStatus: 'dilivygo' });
    expect(parsed.sync.orderExport).toBe(false);
  });

  test('accepts explicit per-entity authority + mappings', () => {
    const parsed = eposmaticChannelConfigSchema.parse({
      environment: 'production',
      sourceOfTruth: { menu: 'dilivygo', price: 'dilivygo', stock: 'provider', orderStatus: 'dilivygo' },
      branchMappings: [{ externalBranchId: 'eposmatic-branch-1', shopId }],
    });
    expect(parsed.sourceOfTruth.menu).toBe('dilivygo');
  });

  test('rejects invented host/auth fields and bad enum values', () => {
    for (const extra of [
      { baseUrl: 'https://api.eposmatic.example/' },
      { apiKey: 'k' },
      { username: 'u', password: 'p' },
      { signingSecret: 's' },
    ]) {
      expect(() => eposmaticChannelConfigSchema.parse({ environment: 'sandbox', ...extra })).toThrow();
    }
    expect(() => eposmaticChannelConfigSchema.parse({
      environment: 'sandbox',
      sourceOfTruth: { menu: 'both' },
    })).toThrow();
    expect(() => eposmaticChannelConfigSchema.parse({ environment: 'beta' })).toThrow();
  });
});
