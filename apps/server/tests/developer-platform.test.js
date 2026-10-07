'use strict';

/**
 * Phase 14 — developer platform foundations (NEW suite, no network).
 *
 * Covers, with a mocked Supabase layer:
 * - scope vocabulary: stable allowlist, exclusions, trust-level caps,
 *   issuance validation, and the requireDeveloperScope allow/deny matrix
 * - credential lifecycle: mint (hash-only storage, plaintext once),
 *   revoked / expired / cross-tenant rejection, rotation overlap +
 *   old-key revocation, best-effort last-used touch
 * - rate-limit shape: per-key budget object + digest-based limiter key
 * - provider manifests: CURRENT integrations/catalog.json validates against
 *   integrations/provider-manifest-schema.json; bad manifests are rejected
 * - versioned webhook payload contract: v1 envelope fixture incl.
 *   unknown-field tolerance on the consumer side
 */

const crypto = require('crypto');

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../lib/supabase', () => ({
  select: (...args) => mockSelect(...args),
  insert: (...args) => mockInsert(...args),
  update: (...args) => mockUpdate(...args),
}));

const developerScopes = require('../lib/developer-scopes');
const developerKeys = require('../services/developer-keys.service');
const providerManifest = require('../lib/provider-manifest');
const catalog = require('../../../integrations/catalog.json');

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function appRow(overrides) {
  return {
    id: APP_ID,
    organization_id: ORG_A,
    name: 'Test app',
    trust_level: 'partner',
    revoked_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...(overrides || {}),
  };
}

function keyRow(overrides) {
  return {
    id: 'key-id-1',
    app_id: APP_ID,
    key_prefix: 'dilivygo_test',
    key_hash: 'deadbeef',
    scopes: ['orders:read', 'shops:read'],
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    rotation_of: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...(overrides || {}),
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides) {
  return { headers: {}, ...(overrides || {}) };
}

describe('developer scopes — stable vocabulary', () => {
  test('allowlist is exactly the stable read + webhook-subscription set', () => {
    expect([...developerScopes.DEVELOPER_SCOPES].sort()).toEqual(
      [
        'orders:read',
        'shops:read',
        'menu:read',
        'banners:read',
        'reviews:read',
        'delivery:read',
        'webhooks:read',
        'webhooks:write',
      ].sort()
    );
  });

  test('sensitive capabilities are explicitly excluded, never issuable', () => {
    for (const excluded of developerScopes.EXCLUDED_SCOPES) {
      expect(developerScopes.isKnownScope(excluded)).toBe(false);
    }
    expect(developerScopes.EXCLUDED_SCOPES).toEqual(
      expect.arrayContaining(['orders:write', 'payments:write', 'customers:write', 'auth:write'])
    );
  });

  test('trust caps: first-party and partner hold the full set, custom is read-only', () => {
    expect([...developerScopes.scopesForTrustLevel('first-party')].sort()).toEqual(
      [...developerScopes.DEVELOPER_SCOPES].sort()
    );
    expect([...developerScopes.scopesForTrustLevel('partner')].sort()).toEqual(
      [...developerScopes.DEVELOPER_SCOPES].sort()
    );
    expect(developerScopes.scopesForTrustLevel('custom')).not.toContain('webhooks:write');
    expect(developerScopes.scopesForTrustLevel('custom')).toContain('orders:read');
  });

  test('issuance rejects unknown scopes fail-closed', () => {
    expect(() => developerScopes.assertIssuableScopes(['orders:read', 'payments:write'], 'partner')).toThrow(
      expect.objectContaining({ code: 'DEVELOPER_UNKNOWN_SCOPE' })
    );
  });

  test('issuance rejects scopes above the custom trust cap', () => {
    expect(() => developerScopes.assertIssuableScopes(['webhooks:write'], 'custom')).toThrow(
      expect.objectContaining({ code: 'DEVELOPER_SCOPE_ABOVE_TRUST' })
    );
  });

  test('issuance rejects unknown trust levels and dedupes valid grants', () => {
    expect(() => developerScopes.assertIssuableScopes(['orders:read'], 'superadmin')).toThrow(
      expect.objectContaining({ code: 'DEVELOPER_UNKNOWN_TRUST_LEVEL' })
    );
    expect(developerScopes.assertIssuableScopes(['orders:read', 'orders:read'], 'partner')).toEqual([
      'orders:read',
    ]);
  });
});

describe('requireDeveloperScope — allow/deny matrix (unmounted)', () => {
  test('allows when the key holds every required scope in the same org', () => {
    const middleware = developerScopes.requireDeveloperScope('orders:read', 'shops:read');
    const req = mockReq({
      organizationId: ORG_A,
      developerKey: { keyId: 'k1', appId: APP_ID, organizationId: ORG_A, trustLevel: 'partner', scopes: ['orders:read', 'shops:read', 'menu:read'] },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('denies a missing scope with 403 and names the gap (no secret leak)', () => {
    const middleware = developerScopes.requireDeveloperScope('orders:read', 'webhooks:write');
    const req = mockReq({
      organizationId: ORG_A,
      developerKey: { keyId: 'k1', appId: APP_ID, organizationId: ORG_A, trustLevel: 'partner', scopes: ['orders:read'] },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DEVELOPER_SCOPE_DENIED', missing: ['webhooks:write'] })
    );
  });

  test('rejects unauthenticated developer calls with 401', () => {
    const middleware = developerScopes.requireDeveloperScope('shops:read');
    const res = mockRes();
    const next = jest.fn();
    middleware(mockReq({ organizationId: ORG_A }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DEVELOPER_AUTH_REQUIRED' }));
  });

  test('denies cross-tenant key use even when scopes match', () => {
    const middleware = developerScopes.requireDeveloperScope('shops:read');
    const req = mockReq({
      organizationId: ORG_B,
      developerKey: { keyId: 'k1', appId: APP_ID, organizationId: ORG_A, trustLevel: 'partner', scopes: ['shops:read'] },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DEVELOPER_ORG_MISMATCH' }));
  });

  test('fails closed with 500 when the route requires an unknown scope', () => {
    const middleware = developerScopes.requireDeveloperScope('payments:write');
    const req = mockReq({
      organizationId: ORG_A,
      developerKey: { keyId: 'k1', appId: APP_ID, organizationId: ORG_A, trustLevel: 'first-party', scopes: [...developerScopes.DEVELOPER_SCOPES] },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DEVELOPER_SCOPE_MISCONFIGURED' }));
  });
});

describe('developer keys — mint and verify (mocked supabase)', () => {
  test('mint stores only the hash and returns plaintext exactly once', async () => {
    mockSelect.mockResolvedValueOnce([appRow()]);
    mockInsert.mockImplementationOnce(async (_table, row) => [{ ...keyRow({ id: 'minted-1' }), ...row }]);

    const minted = await developerKeys.mintDeveloperKey({
      organizationId: ORG_A,
      appId: APP_ID,
      scopes: ['orders:read'],
    });

    expect(minted.plaintext.startsWith('dilivygo_')).toBe(true);
    expect(minted.keyPrefix).toBe(minted.plaintext.slice(0, 16));
    expect(mockInsert).toHaveBeenCalledWith(
      'developer_api_keys',
      expect.objectContaining({
        app_id: APP_ID,
        key_hash: sha256Hex(minted.plaintext),
        scopes: ['orders:read'],
      })
    );
    const storedRow = mockInsert.mock.calls[0][1];
    expect(JSON.stringify(storedRow)).not.toContain(minted.plaintext);
    expect(storedRow.key_hash).not.toBe(minted.plaintext);
  });

  test('mint rejects unknown scopes without writing a row', async () => {
    mockSelect.mockResolvedValueOnce([appRow()]);
    await expect(
      developerKeys.mintDeveloperKey({ organizationId: ORG_A, appId: APP_ID, scopes: ['payments:write'] })
    ).rejects.toMatchObject({ code: 'DEVELOPER_UNKNOWN_SCOPE' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('mint denies issuing a key for another org app', async () => {
    mockSelect.mockResolvedValueOnce([appRow({ organization_id: ORG_B })]);
    await expect(
      developerKeys.mintDeveloperKey({ organizationId: ORG_A, appId: APP_ID, scopes: ['shops:read'] })
    ).rejects.toMatchObject({ code: 'DEVELOPER_ORG_MISMATCH' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('verify accepts a valid key and never echoes secrets', async () => {
    const plaintext = 'dilivygo_test-valid-key-material';
    mockSelect.mockResolvedValueOnce([keyRow({ key_hash: sha256Hex(plaintext) })]);
    mockSelect.mockResolvedValueOnce([appRow()]);

    const { key, app } = await developerKeys.verifyDeveloperKey({ plaintext, organizationId: ORG_A });

    expect(key.id).toBe('key-id-1');
    expect(app.organizationId).toBe(ORG_A);
    expect(JSON.stringify({ key, app })).not.toContain(plaintext);
    expect(key).not.toHaveProperty('key_hash');
  });

  test('verify rejects revoked keys', async () => {
    const plaintext = 'dilivygo_test-revoked';
    mockSelect.mockResolvedValueOnce([keyRow({ key_hash: sha256Hex(plaintext), revoked_at: '2026-02-01T00:00:00.000Z' })]);
    await expect(
      developerKeys.verifyDeveloperKey({ plaintext, organizationId: ORG_A })
    ).rejects.toMatchObject({ statusCode: 401, code: 'DEVELOPER_KEY_REVOKED' });
  });

  test('verify rejects expired keys', async () => {
    const plaintext = 'dilivygo_test-expired';
    mockSelect.mockResolvedValueOnce([keyRow({ key_hash: sha256Hex(plaintext), expires_at: '2020-01-01T00:00:00.000Z' })]);
    await expect(
      developerKeys.verifyDeveloperKey({ plaintext, organizationId: ORG_A })
    ).rejects.toMatchObject({ statusCode: 401, code: 'DEVELOPER_KEY_EXPIRED' });
  });

  test('verify denies cross-tenant key use', async () => {
    const plaintext = 'dilivygo_test-cross-tenant';
    mockSelect.mockResolvedValueOnce([keyRow({ key_hash: sha256Hex(plaintext) })]);
    mockSelect.mockResolvedValueOnce([appRow({ organization_id: ORG_B })]);
    await expect(
      developerKeys.verifyDeveloperKey({ plaintext, organizationId: ORG_A })
    ).rejects.toMatchObject({ statusCode: 403, code: 'DEVELOPER_ORG_MISMATCH' });
  });

  test('verify rejects unknown key material without oracle details', async () => {
    mockSelect.mockResolvedValueOnce([]);
    await expect(
      developerKeys.verifyDeveloperKey({ plaintext: 'dilivygo_test-nope', organizationId: ORG_A })
    ).rejects.toMatchObject({ statusCode: 401, code: 'DEVELOPER_KEY_INVALID' });
  });
});

describe('developer keys — rotation overlap and revocation', () => {
  test('rotation keeps the old key valid until it is explicitly revoked', async () => {
    const oldPlaintext = 'dilivygo_test-rotation-old';
    const oldRow = keyRow({ id: 'old-key', key_hash: sha256Hex(oldPlaintext), scopes: ['shops:read'] });

    // Rotate: load old key + app, then insert the successor.
    mockSelect.mockResolvedValueOnce([oldRow]);
    mockSelect.mockResolvedValueOnce([appRow()]);
    mockInsert.mockImplementationOnce(async (_table, row) => [{ ...keyRow({ id: 'new-key' }), ...row }]);
    const rotated = await developerKeys.rotateDeveloperKey({ keyId: 'old-key', organizationId: ORG_A });

    expect(rotated.rotationOf).toBe('old-key');
    expect(rotated.plaintext.startsWith('dilivygo_')).toBe(true);
    expect(rotated.plaintext).not.toBe(oldPlaintext);
    expect(rotated.scopes).toEqual(['shops:read']);
    expect(mockInsert).toHaveBeenCalledWith(
      'developer_api_keys',
      expect.objectContaining({
        key_hash: sha256Hex(rotated.plaintext),
        rotation_of: 'old-key',
      })
    );

    // Overlap: the old key still verifies.
    mockSelect.mockResolvedValueOnce([oldRow]);
    mockSelect.mockResolvedValueOnce([appRow()]);
    const stillValid = await developerKeys.verifyDeveloperKey({ plaintext: oldPlaintext, organizationId: ORG_A });
    expect(stillValid.key.id).toBe('old-key');

    // End of grace: revoke the old key.
    mockSelect.mockResolvedValueOnce([oldRow]);
    mockSelect.mockResolvedValueOnce([appRow()]);
    mockUpdate.mockResolvedValueOnce([{ id: 'old-key' }]);
    await expect(
      developerKeys.revokeDeveloperKey({ keyId: 'old-key', organizationId: ORG_A })
    ).resolves.toMatchObject({ id: 'old-key', revoked: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      'developer_api_keys',
      expect.objectContaining({ revoked_at: expect.any(String) }),
      { id: 'old-key' }
    );

    // After revocation the old key is rejected.
    mockSelect.mockResolvedValueOnce([{ ...oldRow, revoked_at: '2026-03-01T00:00:00.000Z' }]);
    await expect(
      developerKeys.verifyDeveloperKey({ plaintext: oldPlaintext, organizationId: ORG_A })
    ).rejects.toMatchObject({ code: 'DEVELOPER_KEY_REVOKED' });
  });

  test('touchLastUsed is best-effort and never throws', async () => {
    mockUpdate.mockResolvedValueOnce([{ id: 'key-id-1' }]);
    await expect(developerKeys.touchLastUsed('key-id-1')).resolves.toBe(true);
    mockUpdate.mockRejectedValueOnce(new Error('db down'));
    await expect(developerKeys.touchLastUsed('key-id-1')).resolves.toBe(false);
  });
});

describe('developer keys — per-key rate-limit shape', () => {
  test('budget object is a sane limiter config', () => {
    expect(developerKeys.DEVELOPER_KEY_RATE_LIMIT).toMatchObject({ windowMs: 60 * 1000, max: 120 });
    expect(typeof developerKeys.DEVELOPER_KEY_RATE_LIMIT.storePrefix).toBe('string');
  });

  test('limiter key is deterministic per key, distinct across keys, secret-free', () => {
    const a = developerKeys.developerKeyRateKey({ developerKey: { keyId: 'key-a', organizationId: ORG_A } });
    const b = developerKeys.developerKeyRateKey({ developerKey: { keyId: 'key-a', organizationId: ORG_A } });
    const c = developerKeys.developerKeyRateKey({ developerKey: { keyId: 'key-b', organizationId: ORG_A } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('key-a');
    expect(a).not.toContain(ORG_A);
  });

  test('unauthenticated callers fall back to an IP bucket', () => {
    expect(developerKeys.developerKeyRateKey({ ip: '10.0.0.1' })).toContain('10.0.0.1');
  });
});

describe('provider manifests — schema describes reality', () => {
  test('the CURRENT catalog.json validates clean (29 entries, zero errors)', () => {
    expect(Array.isArray(catalog)).toBe(true);
    const result = providerManifest.validateCatalog(catalog);
    expect(result.checked).toBe(29);
    expect(result.errorCount).toBe(0);
    expect(result.valid).toBe(true);
  });

  test('rejects a manifest missing its identity', () => {
    const { valid, errors } = providerManifest.validateProviderManifest({
      name: 'No Key',
      category: 'Notifications',
      type: 'native',
      capabilities: ['push'],
    });
    expect(valid).toBe(false);
    expect(errors.join('|')).toMatch(/key: required/);
  });

  test('rejects an unknown provider type', () => {
    const { valid, errors } = providerManifest.validateProviderManifest({
      key: 'mystery',
      name: 'Mystery',
      category: 'Notifications',
      type: 'carrier-pigeon',
      capabilities: ['push'],
    });
    expect(valid).toBe(false);
    expect(errors.join('|')).toMatch(/type: 'carrier-pigeon' is not one of/);
  });

  test('rejects a nango entry without its integration id', () => {
    const { valid, errors } = providerManifest.validateProviderManifest({
      key: 'fake-crm',
      name: 'Fake CRM',
      category: 'Marketing & CRM',
      type: 'nango',
      capabilities: ['crm'],
    });
    expect(valid).toBe(false);
    expect(errors.join('|')).toMatch(/integrationId: required when type is nango/);
  });

  test('rejects unknown fields and empty capability lists', () => {
    const unknown = providerManifest.validateProviderManifest({
      key: 'slack',
      name: 'Slack',
      category: 'Communication & Support',
      type: 'nango',
      capabilities: ['chat'],
      integrationId: 'slack',
      executeUrl: 'https://evil.example/run.js',
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.errors.join('|')).toMatch(/executeUrl: unknown field/);

    const emptyCaps = providerManifest.validateProviderManifest({
      key: 'slack',
      name: 'Slack',
      category: 'Communication & Support',
      type: 'nango',
      capabilities: [],
      integrationId: 'slack',
    });
    expect(emptyCaps.valid).toBe(false);
    expect(emptyCaps.errors.join('|')).toMatch(/capabilities: requires at least 1/);
  });
});

describe('developer webhooks — v1 payload contract', () => {
  const V1_EVENTS = ['order.created', 'order.status_changed', 'order.refunded'];

  function buildV1Envelope({ event, organizationId, data, extra } = {}) {
    return {
      version: 'v1',
      event,
      occurredAt: '2026-09-17T00:00:00.000Z',
      organizationId,
      data: data || {},
      ...(extra || {}),
    };
  }

  // Minimal consumer: pins version v1, reads known fields, ignores the rest.
  // Unknown-field tolerance is what lets us evolve v1 without breaking
  // certified partners (new fields are additive; removals need a new version).
  function consumeV1(payload) {
    if (!payload || payload.version !== 'v1') {
      const err = new Error('Unsupported webhook version');
      err.code = 'WEBHOOK_VERSION_UNSUPPORTED';
      throw err;
    }
    if (!V1_EVENTS.includes(payload.event)) {
      const err = new Error('Unknown webhook event');
      err.code = 'WEBHOOK_EVENT_UNKNOWN';
      throw err;
    }
    return {
      event: payload.event,
      organizationId: payload.organizationId,
      occurredAt: payload.occurredAt,
      data: payload.data,
    };
  }

  test('v1 envelope carries version, event, timestamp, org, and data', () => {
    const envelope = buildV1Envelope({
      event: 'order.status_changed',
      organizationId: ORG_A,
      data: { orderId: 'order-1', status: 'ready', previousStatus: 'preparing' },
    });
    const consumed = consumeV1(envelope);
    expect(consumed).toMatchObject({
      event: 'order.status_changed',
      organizationId: ORG_A,
      occurredAt: '2026-09-17T00:00:00.000Z',
    });
    expect(consumed.data).toMatchObject({ orderId: 'order-1', status: 'ready' });
  });

  test('v1 consumers tolerate unknown top-level and nested fields', () => {
    const envelope = buildV1Envelope({
      event: 'order.created',
      organizationId: ORG_A,
      data: { orderId: 'order-2', futureField: 'ignored-by-old-consumers', nested: { addedLater: 1 } },
      extra: { sunset: '2030-01-01', traceId: 'trace-123', anotherFutureField: true },
    });
    expect(() => consumeV1(envelope)).not.toThrow();
    const consumed = consumeV1(envelope);
    expect(consumed.event).toBe('order.created');
    expect(consumed.data.orderId).toBe('order-2');
  });

  test('v1 consumers reject other versions and unknown events', () => {
    expect(() =>
      consumeV1(buildV1Envelope({ event: 'order.created', organizationId: ORG_A, data: {} }) && {
        version: 'v2',
        event: 'order.created',
        organizationId: ORG_A,
        data: {},
      })
    ).toThrow(expect.objectContaining({ code: 'WEBHOOK_VERSION_UNSUPPORTED' }));
    expect(() =>
      consumeV1(buildV1Envelope({ event: 'order.invented', organizationId: ORG_A, data: {} }))
    ).toThrow(expect.objectContaining({ code: 'WEBHOOK_EVENT_UNKNOWN' }));
  });
});
