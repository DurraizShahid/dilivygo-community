'use strict';

/**
 * Indolj channel scaffold tests — Phase 11 (no network, fixtures only).
 *
 * Pack case map (`providers/indolj.md` §Provider-specific tests):
 * - Auth failure (+ valid-shape counterpart)
 * - Branch mapping (explicit-mapping gate)
 * - Duplicate incoming order (event-id dedupe)
 * - Unknown SKU/modifier (review hold)
 * - Menu sync retry (transient 502s then success)
 * - Status update race (sequence guard)
 * - Missed webhook/reconciliation (gate documents the unverified API)
 * - Tenant isolation
 * - Live blocks (503 INDOLJ_CONTRACT_REQUIRED — no endpoints invented)
 * - Config schema (free-form unverified baseUrl or omitted; creds banned)
 */

const {
  createIndoljChannelProvider,
  INDOLJ_CONTRACT_REQUIRED,
} = require('../services/indolj-channel.scaffold');

const { indoljChannelConfigSchema } = require('../validators/indolj-channel.validator');

const ORG_A = 'org-indolj-test-a';
const ORG_B = 'org-indolj-test-b';
const SHOP_1 = '11111111-1111-4111-8111-111111111111';

function providerFor(overrides) {
  return createIndoljChannelProvider({
    organizationId: ORG_A,
    branchMap: { 'indolj-store-1': SHOP_1 },
    ...(overrides || {}),
  });
}

function webhookPayload(overrides) {
  return {
    externalOrderId: `indolj-order-${Math.random().toString(36).slice(2)}`,
    externalBranchId: 'indolj-store-1',
    providerStatus: 'PLACED',
    items: [{ externalProductId: 'ext-biryani-1', name: 'Fixture Biryani', quantity: 1, unitPriceCents: 1500 }],
    subtotalCents: 1500,
    discountCents: 0,
    deliveryFeeCents: 200,
    tipCents: 0,
    taxCents: 0,
    totalCents: 1700,
    currency: 'PKR',
    rawFieldNames: ['providerStatus'],
    ...(overrides || {}),
  };
}

describe('indolj scaffold — auth shape', () => {
  test('invalid fixture credentials fail with 401 INDOLJ_AUTH_FAILED', () => {
    const indolj = providerFor();
    let error = null;
    try {
      indolj.authenticateFixture({ mode: 'invalid' });
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('INDOLJ_AUTH_FAILED');
  });

  test('valid fixture connect returns a session shape (no real credential)', () => {
    const session = providerFor().authenticateFixture({ mode: 'valid' });
    expect(session.fixture).toBe(true);
    expect(session.sessionId).toMatch(/^indolj_fixture_session_/);
    expect(session).not.toHaveProperty('token');
    expect(session).not.toHaveProperty('secret');
  });
});

describe('indolj scaffold — branch mapping + duplicate order', () => {
  test('ingest refuses unmapped branches until mapping is explicit', () => {
    const indolj = providerFor({ branchMap: {} });
    expect(indolj.discoverBranches().branches.map((branch) => branch.externalBranchId))
      .toContain('indolj-store-1');
    expect(() => indolj.handleOrderWebhook({ eventId: 'ind-evt-unmapped-1', payload: webhookPayload() }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_BRANCH_UNMAPPED' }));
  });

  test('duplicate incoming order dedupes by provider event id', () => {
    const indolj = providerFor();
    const payload = webhookPayload({ externalOrderId: 'indolj-dupe-1' });
    const first = indolj.handleOrderWebhook({ eventId: 'ind-evt-1', payload });
    expect(first.deduped).toBe(false);
    const replay = indolj.handleOrderWebhook({ eventId: 'ind-evt-1', payload });
    expect(replay.deduped).toBe(true);
    expect(indolj._test.engine._test.orders.size).toBe(1);
  });
});

describe('indolj scaffold — unknown SKU/modifier + menu retry', () => {
  test('unknown SKU/modifier preserved + flagged for review', () => {
    const indolj = providerFor();
    const payload = webhookPayload({
      externalOrderId: 'indolj-unknown-1',
      items: [{
        name: 'Unlisted Platter',
        quantity: 1,
        unitPriceCents: 2000,
        modifiers: [{ groupName: 'Spice', optionName: 'Extra', priceCents: 0 }],
      }],
      subtotalCents: 2000,
      totalCents: 2200,
    });
    const result = indolj.handleOrderWebhook({ eventId: 'ind-evt-unknown-1', payload });
    expect(result.order.needsReview).toBe(true);
    expect(result.order.canonical.items[0].unmapped).toBe(true);
    expect(result.order.canonical.items[0].unknownModifier).toBe(true);
  });

  test('menu sync retry: transient 502s then success applies all rows', () => {
    const indolj = providerFor({ menuTransientFailures: 2 });
    const items = [{ externalProductId: 'indolj-item-1', productId: 'p-1', priceCents: 900, stock: 4 }];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let error = null;
      try {
        indolj.importMenu({ items });
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('INDOLJ_TRANSIENT_ERROR');
    }
    const result = indolj.importMenu({ items });
    expect(result.applied).toEqual(['indolj-item-1']);
    expect(result.failed).toHaveLength(0);
  });
});

describe('indolj scaffold — status race + reconciliation + isolation', () => {
  function ingested(indolj, externalOrderId) {
    indolj.handleOrderWebhook({ eventId: `evt-${externalOrderId}`, payload: webhookPayload({ externalOrderId }) });
    indolj.acknowledgeOrder({ externalOrderId, decision: 'accepted' });
    return externalOrderId;
  }

  test('status update race: stale sequence loses, newer wins, state consistent', () => {
    const indolj = providerFor();
    const id = ingested(indolj, 'indolj-race-1');
    indolj.updateOrderStatus({ externalOrderId: id, to: 'preparing', eventSequence: 10 });
    expect(() => indolj.updateOrderStatus({ externalOrderId: id, to: 'ready', eventSequence: 9 }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
    expect(indolj.updateOrderStatus({ externalOrderId: id, to: 'ready', eventSequence: 11 }).status).toBe('ready');
  });

  test('reconciliation is capability-gated until Indolj confirms query APIs', () => {
    const indolj = providerFor();
    let error = null;
    try {
      indolj.reconcileRecent({ snapshot: [] });
    } catch (err) {
      error = err;
    }
    // Flag is false by honest design: the gate refuses with 503, documenting
    // the unverified "where supported" API as an unblock requirement.
    expect(error).not.toBeNull();
    expect(error.statusCode).toBe(503);
  });

  test('tenant isolation: cross-org access 404s identically to unknown ids', () => {
    const indolj = providerFor();
    indolj.handleOrderWebhook({ eventId: 'ind-evt-iso-1', payload: webhookPayload({ externalOrderId: 'indolj-iso-1' }) });
    const otherOrg = createIndoljChannelProvider({ organizationId: ORG_B, branchMap: { 'indolj-store-1': SHOP_1 } });
    expect(() => otherOrg.acknowledgeOrder({ externalOrderId: 'indolj-iso-1', decision: 'accepted' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => indolj.acknowledgeOrder({ externalOrderId: 'ghost', decision: 'accepted' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test('live surface blocked (no endpoints invented) + health honest', () => {
    const indolj = providerFor();
    for (const method of [
      'authenticateLive',
      'fetchBranchesLive',
      'fetchMenuLive',
      'pushMenuLive',
      'pushStockPricesLive',
      'acknowledgeOrderLive',
      'pushOrderStatusLive',
      'verifyWebhookSignatureLive',
      'queryRecentOrdersLive',
    ]) {
      let error = null;
      try {
        indolj[method]();
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(INDOLJ_CONTRACT_REQUIRED);
    }
    const health = indolj.checkHealth();
    expect(health.status).toBe('scaffold');
    expect(health.status).not.toBe('healthy');
  });
});

describe('indolj channel config validator', () => {
  const shopId = SHOP_1;

  test('accepts a minimal config with no baseUrl (nothing verified)', () => {
    const parsed = indoljChannelConfigSchema.parse({ environment: 'sandbox' });
    expect(parsed.baseUrl).toBeUndefined();
    expect(parsed.sync.reconciliation).toBe(false);
  });

  test('accepts free-form HTTPS baseUrl marked unverified + mappings', () => {
    const parsed = indoljChannelConfigSchema.parse({
      environment: 'production',
      baseUrl: 'https://partner-api.example.com/v1',
      branchMappings: [{ externalBranchId: 'indolj-store-1', shopId }],
      sync: { reconciliation: false },
    });
    expect(parsed.baseUrl).toBe('https://partner-api.example.com/v1');
  });

  test('rejects non-HTTPS/local/credentialed baseUrl values', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      for (const baseUrl of [
        'http://partner-api.example.com/v1',
        'https://user:pass@partner-api.example.com/',
        'https://localhost:8443/api',
        'not-a-url',
      ]) {
        expect(() => indoljChannelConfigSchema.parse({ environment: 'sandbox', baseUrl })).toThrow();
      }
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('rejects invented auth/credential fields', () => {
    for (const creds of [{ apiKey: 'k' }, { username: 'u', password: 'p' }, { clientSecret: 's' }, { token: 't' }]) {
      expect(() => indoljChannelConfigSchema.parse({ environment: 'sandbox', ...creds })).toThrow();
    }
  });
});
