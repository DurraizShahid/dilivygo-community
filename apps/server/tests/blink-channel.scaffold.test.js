'use strict';

/**
 * Blink channel scaffold tests — Phase 11 (no network, fixtures only).
 *
 * Pack case map (`providers/blink-co.md` §Provider-specific tests):
 * - Token failure/expiry (+ re-login recovery)
 * - Unmapped branch refusal
 * - Menu import (+ 50-item documented batch boundary)
 * - Stock/price partial failure
 * - Duplicate order webhook (event-id dedupe)
 * - Unknown item/modifier (needsReview hold)
 * - Accept/reject (+ terminal rejection)
 * - Delayed/out-of-order status
 * - Webhook timeout path (ack-after-persist, deferred drain)
 * - Live-method blocks (503 BLINK_CONTRACT_REQUIRED, incl. Logistics split)
 * - Tenant isolation
 * - Config schema (environment/host allowlist + consistency, strict creds ban)
 */

const {
  createBlinkChannelProvider,
  BLINK_CONTRACT_REQUIRED,
  BLINK_DOCUMENTED_BATCH_LIMIT,
  BLINK_DOCUMENTED_WEBHOOK_TIMEOUT_MS,
} = require('../services/blink-channel.scaffold');

const { blinkChannelConfigSchema } = require('../validators/blink-channel.validator');

const ORG_A = 'org-blink-test-a';
const ORG_B = 'org-blink-test-b';
const SHOP_1 = '11111111-1111-4111-8111-111111111111';

function providerFor(overrides) {
  return createBlinkChannelProvider({
    organizationId: ORG_A,
    branchMap: { 'blink-branch-1': SHOP_1 },
    ...(overrides || {}),
  });
}

function webhookPayload(overrides) {
  return {
    externalOrderId: `blink-order-${Math.random().toString(36).slice(2)}`,
    externalBranchId: 'blink-branch-1',
    providerStatus: 'NEW',
    items: [{ externalProductId: 'ext-burger-1', name: 'Fixture Burger', quantity: 1, unitPriceCents: 1200 }],
    subtotalCents: 1200,
    discountCents: 0,
    deliveryFeeCents: 300,
    tipCents: 0,
    taxCents: 0,
    totalCents: 1500,
    currency: 'PKR',
    rawFieldNames: ['providerStatus'],
    ...(overrides || {}),
  };
}

describe('blink scaffold — token expiry', () => {
  test('expired fixture token blocks capability calls with 401 + re-login recovers', () => {
    const blink = providerFor({ startWithExpiredToken: true });
    expect(blink.describeFixtureToken().expired).toBe(true);
    let error = null;
    try {
      blink.discoverBranches();
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('BLINK_TOKEN_EXPIRED');

    const session = blink.loginFixture();
    expect(session.token).toBeTruthy();
    expect(blink.describeFixtureToken().expired).toBe(false);
    expect(blink.discoverBranches().branches.length).toBeGreaterThan(0);
  });
});

describe('blink scaffold — branches and menu', () => {
  test('unmapped branch refuses sync until mapping is explicit', () => {
    const blink = providerFor({ branchMap: {} });
    const branches = blink.discoverBranches();
    expect(branches.branches.map((branch) => branch.externalBranchId)).toContain('blink-branch-1');
    expect(branches.branches[0].mappedShopId).toBeNull();
    expect(() => blink.handleOrderWebhook({ eventId: 'evt-unmapped-1', payload: webhookPayload() }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_BRANCH_UNMAPPED' }));
  });

  test('menu import fixture applies rows at the documented batch boundary', () => {
    expect(BLINK_DOCUMENTED_BATCH_LIMIT).toBe(50);
    const blink = providerFor();
    const items = Array.from({ length: 53 }, (_, index) => ({
      externalProductId: `blink-item-${index}`,
      productId: `product-${index}`,
      priceCents: 100 + index,
      stock: 10,
    }));
    const result = blink.importMenu({ items });
    expect(result.batches).toBe(2);
    expect(result.batchSize).toBe(50);
    expect(result.applied).toHaveLength(53);
    expect(result.failed).toHaveLength(0);
  });

  test('stock/price partial failure reports failed rows, keeps applied rows', () => {
    const blink = providerFor({
      catalog: { 'blink-fries': { productId: 'p-fries', priceCents: 500, stock: 8 } },
      failingStockIds: ['blink-fries'],
    });
    const result = blink.syncStockPrices({
      updates: [
        { externalProductId: 'blink-fries', stock: 2 },
        { externalProductId: 'blink-ghost', stock: 1 },
      ],
    });
    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.map((row) => row.externalProductId).sort()).toEqual(['blink-fries', 'blink-ghost']);
  });
});

describe('blink scaffold — webhook ingestion', () => {
  test('duplicate order webhook dedupes by provider event id', () => {
    const blink = providerFor();
    const payload = webhookPayload({ externalOrderId: 'blink-dupe-1' });
    const first = blink.handleOrderWebhook({ eventId: 'blink-evt-1', payload });
    expect(first.acked).toBe(true);
    expect(first.deduped).toBe(false);
    const replay = blink.handleOrderWebhook({ eventId: 'blink-evt-1', payload });
    expect(replay.acked).toBe(true);
    expect(replay.deduped).toBe(true);
    expect(blink._test.engine._test.orders.size).toBe(1);
    const row = blink._test.inbox.find((entry) => entry.providerEventId === 'blink-evt-1');
    expect(row.status).toBe('succeeded');
  });

  test('unknown item/modifier held for review, raw preserved', () => {
    const blink = providerFor();
    const payload = webhookPayload({
      externalOrderId: 'blink-unknown-1',
      items: [{ name: 'Mystery Blink Dish', quantity: 1, unitPriceCents: 900 }],
      subtotalCents: 900,
      totalCents: 1200,
    });
    const result = blink.handleOrderWebhook({ eventId: 'blink-evt-unknown-1', payload });
    expect(result.order.needsReview).toBe(true);
    expect(result.order.canonical.raw).toBe(payload);
  });

  test('webhook requires event id + payload', () => {
    const blink = providerFor();
    expect(() => blink.handleOrderWebhook({ payload: webhookPayload() }))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => blink.handleOrderWebhook({ eventId: 'x' }))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('timeout-ack path: slow downstream acks after persist, drains later', () => {
    expect(BLINK_DOCUMENTED_WEBHOOK_TIMEOUT_MS).toBe(5000);
    const blink = providerFor();
    const payload = webhookPayload({ externalOrderId: 'blink-slow-1' });
    const acked = blink.handleOrderWebhookWithTimeout({
      eventId: 'blink-evt-slow-1',
      payload,
      simulatedProcessingMs: 30000,
    });
    expect(acked.acked).toBe(true);
    expect(acked.deferred).toBe(true);
    expect(blink._test.engine._test.orders.size).toBe(0);

    const drained = blink.drainPending();
    expect(drained).toHaveLength(1);
    expect(drained[0].order.canonical.externalOrderId).toBe('blink-slow-1');
    const row = blink._test.inbox.find((entry) => entry.providerEventId === 'blink-evt-slow-1');
    expect(row.status).toBe('succeeded');
  });

  test('fast path processes inline without deferring', () => {
    const blink = providerFor();
    const result = blink.handleOrderWebhookWithTimeout({
      eventId: 'blink-evt-fast-1',
      payload: webhookPayload({ externalOrderId: 'blink-fast-1' }),
      simulatedProcessingMs: 200,
    });
    expect(result.deferred).toBe(false);
    expect(result.order.canonical.externalOrderId).toBe('blink-fast-1');
  });
});

describe('blink scaffold — accept/reject + out-of-order', () => {
  function ingestedExternalId(blink, externalOrderId) {
    blink.handleOrderWebhook({ eventId: `evt-${externalOrderId}`, payload: webhookPayload({ externalOrderId }) });
    return externalOrderId;
  }

  test('accept moves placed -> accepted', () => {
    const blink = providerFor();
    const id = ingestedExternalId(blink, 'blink-accept-1');
    expect(blink.acknowledgeOrder({ externalOrderId: id, decision: 'accepted' }).status).toBe('accepted');
  });

  test('reject is terminal with reason', () => {
    const blink = providerFor();
    const id = ingestedExternalId(blink, 'blink-reject-1');
    const rejected = blink.acknowledgeOrder({ externalOrderId: id, decision: 'rejected', reason: 'Item unavailable' });
    expect(rejected.status).toBe('rejected');
    expect(() => blink.updateOrderStatus({ externalOrderId: id, to: 'preparing' }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
  });

  test('out-of-order status refused, state unchanged', () => {
    const blink = providerFor();
    const id = ingestedExternalId(blink, 'blink-ooo-1');
    blink.acknowledgeOrder({ externalOrderId: id, decision: 'accepted' });
    blink.updateOrderStatus({ externalOrderId: id, to: 'preparing', eventSequence: 5 });
    expect(() => blink.updateOrderStatus({ externalOrderId: id, to: 'accepted', eventSequence: 6 }))
      .toThrow(expect.objectContaining({ code: 'CHANNEL_OUT_OF_ORDER' }));
    expect(blink._test.engine._test.orders.get(`${ORG_A}:${id}`).status).toBe('preparing');
  });

  test('reconciliation surfaces a missed webhook', () => {
    const blink = providerFor();
    ingestedExternalId(blink, 'blink-rec-1');
    const report = blink.reconcileRecent({
      snapshot: [
        { externalOrderId: 'blink-rec-1', status: 'placed' },
        { externalOrderId: 'blink-rec-missed', status: 'placed' },
      ],
    });
    expect(report.matched).toEqual(['blink-rec-1']);
    expect(report.missing.map((row) => row.externalOrderId)).toEqual(['blink-rec-missed']);
  });
});

describe('blink scaffold — live blocks + tenant isolation', () => {
  test('every live-shaped method throws 503 BLINK_CONTRACT_REQUIRED', () => {
    const blink = providerFor();
    for (const method of [
      'loginLive',
      'fetchBranchesLive',
      'pushMenuLive',
      'pushStockPricesLive',
      'acknowledgeOrderLive',
      'pushOrderStatusLive',
      'registerWebhookLive',
      'createLogisticsTaskLive',
    ]) {
      let error = null;
      try {
        blink[method]();
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(BLINK_CONTRACT_REQUIRED);
    }
  });

  test('cross-tenant order access 404s', () => {
    const blink = providerFor();
    blink.handleOrderWebhook({ eventId: 'blink-evt-iso-1', payload: webhookPayload({ externalOrderId: 'blink-iso-1' }) });
    const otherOrg = createBlinkChannelProvider({ organizationId: ORG_B, branchMap: { 'blink-branch-1': SHOP_1 } });
    expect(() => otherOrg.acknowledgeOrder({ externalOrderId: 'blink-iso-1', decision: 'accepted' }))
      .toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test('health never claims healthy', () => {
    expect(providerFor().checkHealth().status).toBe('scaffold');
  });
});

describe('blink channel config validator', () => {
  const shopId = SHOP_1;

  test('accepts a sandbox config on the stg host with mappings + toggles', () => {
    const parsed = blinkChannelConfigSchema.parse({
      environment: 'sandbox',
      baseUrl: 'https://stg-api.blinkco.io',
      branchMappings: [{ externalBranchId: 'blink-branch-1', shopId }],
      sync: { menuImport: true, stockSync: true, orderIngest: true },
    });
    expect(parsed.environment).toBe('sandbox');
    expect(parsed.branchMappings).toHaveLength(1);
  });

  test('accepts a production config on the prod host', () => {
    const parsed = blinkChannelConfigSchema.parse({
      environment: 'production',
      baseUrl: 'https://api.blinkco.io',
    });
    expect(parsed.branchMappings).toEqual([]);
  });

  test('rejects unknown hosts, env/host mismatch, bad env, bad shop id', () => {
    expect(() => blinkChannelConfigSchema.parse({ environment: 'sandbox', baseUrl: 'https://api.example.com' }))
      .toThrow();
    expect(() => blinkChannelConfigSchema.parse({ environment: 'sandbox', baseUrl: 'https://api.blinkco.io' }))
      .toThrow();
    expect(() => blinkChannelConfigSchema.parse({ environment: 'staging', baseUrl: 'https://stg-api.blinkco.io' }))
      .toThrow();
    expect(() => blinkChannelConfigSchema.parse({
      environment: 'sandbox',
      baseUrl: 'https://stg-api.blinkco.io',
      branchMappings: [{ externalBranchId: 'b', shopId: 'not-a-uuid' }],
    })).toThrow();
  });

  test('rejects invented credential fields (username/password/apiKey/signingSecret)', () => {
    for (const creds of [
      { username: 'u', password: 'p' },
      { apiKey: 'k' },
      { signingSecret: 's' },
      { bearerToken: 't' },
    ]) {
      expect(() => blinkChannelConfigSchema.parse({
        environment: 'sandbox',
        baseUrl: 'https://stg-api.blinkco.io',
        ...creds,
      })).toThrow();
    }
  });
});
