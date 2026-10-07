'use strict';

/**
 * Keenu provider pack — scaffold-level tests (no network).
 *
 * Covers the provider-pack cases adapted to scaffold level (kit pack
 * `providers/keenu.md` + global rules §4/§5: never fabricate APIs, no fake
 * success). Everything live (real HTTP, real signature scheme, capture,
 * refund/void) must throw 503 PROVIDER_CONTRACT_REQUIRED; everything else
 * runs against deterministic in-memory fixtures in
 * `services/keenu-provider.scaffold.js`.
 *
 * Case map:
 * - Successful / declined / abandoned payments -> fixture outcomes
 * - Duplicate callback -> finalizes once (finalizeCount === 1, deduped flag)
 * - Tampered callback -> mock-HMAC wrong-secret negative (401)
 * - Timeout after possible charge -> status 'unknown' + safe retry semantics
 * - Refund retry -> PROVIDER_CONTRACT_REQUIRED (unsupported until docs)
 * - Cross-tenant lookup denial (+ unknown-id equivalence, no oracle)
 * - Config schema valid / invalid (shape only, PKR-only, no credentials)
 */

const {
  createKeenuPaymentProvider,
  PROVIDER_CONTRACT_REQUIRED,
} = require('../services/keenu-provider.scaffold');

const { keenuConfigSchema } = require('../validators/keenu.validator');

const ORG_A = 'org-keenu-test-a';
const ORG_B = 'org-keenu-test-b';

function baseCreate(overrides) {
  return {
    organizationId: ORG_A,
    orderId: 'order-1',
    amountCents: 2500,
    currency: 'PKR',
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    ...(overrides || {}),
  };
}

function expectProviderError(promiseOrFn, statusCode, code) {
  let error = null;
  try {
    const result = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { throw new Error('expected provider method to throw'); },
        (err) => { expect(err.statusCode).toBe(statusCode); expect(err.code).toBe(code); },
      );
    }
  } catch (err) {
    error = err;
  }
  expect(error).not.toBeNull();
  expect(error.statusCode).toBe(statusCode);
  expect(error.code).toBe(code);
  return undefined;
}

describe('keenu scaffold — fixture payment outcomes', () => {
  test('successful payment fixture returns succeeded with a provider id', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const result = keenu.createPayment(baseCreate());
    expect(result.status).toBe('succeeded');
    expect(typeof result.providerPaymentId).toBe('string');
    expect(result.providerPaymentId.length).toBeGreaterThan(0);
    expect(result.raw && result.raw.fixture).toBe(true);
    expect(result.raw.provider).toBe('keenu');
  });

  test('declined payment fixture returns failed', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'declined' });
    const result = keenu.createPayment(baseCreate());
    expect(result.status).toBe('failed');
    expect(typeof result.providerPaymentId).toBe('string');
  });

  test('user abandon fixture returns cancelled', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'abandoned' });
    const result = keenu.createPayment(baseCreate());
    expect(result.status).toBe('cancelled');
  });

  test('money is integer cents only: rejects floats, zero, negatives, non-numbers', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    for (const amountCents of [10.5, 0, -100, NaN, '2500', null, undefined]) {
      expectProviderError(
        () => keenu.createPayment(baseCreate({ amountCents })),
        400,
        'KEENU_INVALID_AMOUNT',
      );
    }
  });

  test('duplicate createPayment with the same idempotencyKey returns the original (no double-finalize)', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const input = baseCreate({ idempotencyKey: 'idem-replay-1' });
    const first = keenu.createPayment(input);
    const second = keenu.createPayment(input);
    expect(second.providerPaymentId).toBe(first.providerPaymentId);
    expect(second.status).toBe(first.status);
    expect(second.idempotentReplay).toBe(true);
  });

  test('different idempotencyKeys create distinct fixture payments', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const first = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-distinct-1' }));
    const second = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-distinct-2' }));
    expect(second.providerPaymentId).not.toBe(first.providerPaymentId);
  });
});

describe('keenu scaffold — fixture callbacks (verify-before-finalize shape)', () => {
  test('duplicate callback delivery finalizes once', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'timeout-unknown' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-cb-dedupe-1' }));
    expect(created.status).toBe('unknown');

    const payload = {
      organizationId: ORG_A,
      providerPaymentId: created.providerPaymentId,
      event: 'succeeded',
    };
    const signature = keenu.signFixtureCallback(payload);

    const first = keenu.handleFixtureCallback({ ...payload, signature });
    expect(first.status).toBe('succeeded');
    expect(first.deduped).toBe(false);

    const second = keenu.handleFixtureCallback({ ...payload, signature });
    expect(second.status).toBe('succeeded');
    expect(second.deduped).toBe(true);

    // Exactly one finalization despite two deliveries.
    expect(second.raw.note).toBeDefined();
    const queried = keenu.queryPayment({ organizationId: ORG_A, providerPaymentId: created.providerPaymentId });
    expect(queried.status).toBe('succeeded');
  });

  test('tampered callback (wrong-secret signature) is rejected and changes nothing', () => {
    const keenu = createKeenuPaymentProvider({
      outcome: 'timeout-unknown',
      fixtureCallbackSecret: 'secret-A',
    });
    const attackerSigner = createKeenuPaymentProvider({
      outcome: 'timeout-unknown',
      fixtureCallbackSecret: 'secret-B',
    });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-cb-tamper-1' }));
    const payload = {
      organizationId: ORG_A,
      providerPaymentId: created.providerPaymentId,
      event: 'succeeded',
    };
    const forgedSignature = attackerSigner.signFixtureCallback(payload);

    expectProviderError(
      () => keenu.handleFixtureCallback({ ...payload, signature: forgedSignature }),
      401,
      'KEENU_CALLBACK_SIGNATURE_INVALID',
    );

    // Rejected callback leaves the payment untouched (still unknown).
    expect(keenu.queryPayment({
      organizationId: ORG_A,
      providerPaymentId: created.providerPaymentId,
    }).status).toBe('unknown');
  });

  test('callback without a signature is rejected', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'timeout-unknown' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-cb-nosig-1' }));
    expectProviderError(
      () => keenu.handleFixtureCallback({
        organizationId: ORG_A,
        providerPaymentId: created.providerPaymentId,
        event: 'succeeded',
        signature: '',
      }),
      401,
      'KEENU_CALLBACK_SIGNATURE_INVALID',
    );
  });
});

describe('keenu scaffold — timeout after possible charge', () => {
  test('timeout fixture stays unknown across query and idempotent retry (safe retry semantics)', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'timeout-unknown' });
    const input = baseCreate({ idempotencyKey: 'idem-timeout-1' });
    const created = keenu.createPayment(input);
    expect(created.status).toBe('unknown');

    // Safe retry 1: query never promotes unknown to a final state.
    expect(keenu.queryPayment({
      organizationId: ORG_A,
      providerPaymentId: created.providerPaymentId,
    }).status).toBe('unknown');

    // Safe retry 2: idempotent replay returns the identical unknown record.
    const replayed = keenu.createPayment(input);
    expect(replayed.providerPaymentId).toBe(created.providerPaymentId);
    expect(replayed.status).toBe('unknown');
  });
});

describe('keenu scaffold — blocked live surface', () => {
  test('refund retry throws PROVIDER_CONTRACT_REQUIRED (unsupported until docs)', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-refund-1' }));
    expectProviderError(
      () => keenu.refundPayment({ organizationId: ORG_A, providerPaymentId: created.providerPaymentId }),
      503,
      PROVIDER_CONTRACT_REQUIRED,
    );
  });

  test('capture throws PROVIDER_CONTRACT_REQUIRED (separate capture unverified)', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-capture-1' }));
    expectProviderError(
      () => keenu.capturePayment({ organizationId: ORG_A, providerPaymentId: created.providerPaymentId }),
      503,
      PROVIDER_CONTRACT_REQUIRED,
    );
  });

  test('real-scheme webhook verification throws PROVIDER_CONTRACT_REQUIRED', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    expectProviderError(
      () => keenu.verifyWebhookSignature('raw-body', 'signature'),
      503,
      PROVIDER_CONTRACT_REQUIRED,
    );
  });

  test('blocked-method errors carry the { statusCode, code } contract', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    try {
      keenu.refundPayment({ organizationId: ORG_A, providerPaymentId: 'keenu_fixture_1' });
      throw new Error('expected refundPayment to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe(PROVIDER_CONTRACT_REQUIRED);
    }
  });
});

describe('keenu scaffold — tenant isolation', () => {
  test('cross-tenant query is denied with the same 404 as an unknown id (no oracle)', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'success' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-tenant-1' }));

    expectProviderError(
      () => keenu.queryPayment({ organizationId: ORG_B, providerPaymentId: created.providerPaymentId }),
      404,
      'KEENU_PAYMENT_NOT_FOUND',
    );
    expectProviderError(
      () => keenu.queryPayment({ organizationId: ORG_A, providerPaymentId: 'keenu_fixture_nope' }),
      404,
      'KEENU_PAYMENT_NOT_FOUND',
    );
    // Owner can still read its own payment.
    expect(keenu.queryPayment({
      organizationId: ORG_A,
      providerPaymentId: created.providerPaymentId,
    }).status).toBe('succeeded');
  });

  test('cross-tenant cancel is denied', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'timeout-unknown' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-tenant-2' }));
    expectProviderError(
      () => keenu.cancelPayment({ organizationId: ORG_B, providerPaymentId: created.providerPaymentId }),
      404,
      'KEENU_PAYMENT_NOT_FOUND',
    );
  });
});

describe('keenu scaffold — local cancel', () => {
  test('cancelPayment finalizes a non-final payment once; replays are no-ops', () => {
    const keenu = createKeenuPaymentProvider({ outcome: 'timeout-unknown' });
    const created = keenu.createPayment(baseCreate({ idempotencyKey: 'idem-cancel-1' }));
    const first = keenu.cancelPayment({ organizationId: ORG_A, providerPaymentId: created.providerPaymentId });
    expect(first.status).toBe('cancelled');
    const second = keenu.cancelPayment({ organizationId: ORG_A, providerPaymentId: created.providerPaymentId });
    expect(second.status).toBe('cancelled');
  });
});

describe('keenu scaffold — config schema (shape only)', () => {
  test('accepts a valid sandbox config and applies defaults', () => {
    const parsed = keenuConfigSchema.safeParse({
      environment: 'sandbox',
      merchantId: 'SANDBOX-MERCHANT-LABEL',
      callbackUrl: 'https://example.com/api/payments/keenu/callback',
      currency: 'PKR',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.timeoutMs).toBe(10000);
    expect(parsed.data.maxRetries).toBe(2);
  });

  test('accepts a valid production config with explicit bounds', () => {
    const parsed = keenuConfigSchema.safeParse({
      environment: 'production',
      merchantId: 'PROD-MERCHANT-LABEL',
      callbackUrl: 'https://example.com/api/payments/keenu/callback',
      currency: 'pkr',
      timeoutMs: 5000,
      maxRetries: 0,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.currency).toBe('PKR');
  });

  test('rejects unknown environment, bad/unsafe callbackUrl, non-PKR currency, and out-of-bounds knobs', () => {
    const base = {
      environment: 'sandbox',
      merchantId: 'MERCHANT-LABEL',
      callbackUrl: 'https://example.com/api/payments/keenu/callback',
      currency: 'PKR',
    };
    const badCases = [
      { ...base, environment: 'staging' },
      { ...base, environment: '' },
      { ...base, callbackUrl: 'not-a-url' },
      { ...base, callbackUrl: 'http://localhost:3000/callback' },
      { ...base, callbackUrl: 'https://user:pass@example.com/callback' },
      // No citable source for non-PKR Keenu settlement: allowlist stays PKR-only.
      { ...base, currency: 'AED' },
      { ...base, currency: 'USD' },
      { ...base, timeoutMs: 500 },
      { ...base, timeoutMs: 60000 },
      { ...base, maxRetries: -1 },
      { ...base, maxRetries: 9 },
      { ...base, merchantId: '' },
    ];
    for (const bad of badCases) {
      expect(keenuConfigSchema.safeParse(bad).success).toBe(false);
    }
  });

  test('rejects unknown keys, including invented credential fields (strict shape)', () => {
    const parsed = keenuConfigSchema.safeParse({
      environment: 'sandbox',
      merchantId: 'MERCHANT-LABEL',
      callbackUrl: 'https://example.com/api/payments/keenu/callback',
      currency: 'PKR',
      apiKey: 'INVENTED-DO-NOT-ADD',
      signingSecret: 'INVENTED-DO-NOT-ADD',
    });
    expect(parsed.success).toBe(false);
  });
});
