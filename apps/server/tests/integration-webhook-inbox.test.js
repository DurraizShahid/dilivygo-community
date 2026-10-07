'use strict';

const crypto = require('crypto');

const WEBHOOK_SECRET = 'inbox-webhook-secret';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

jest.mock('../config', () => ({
  stripe: { enabled: true },
  google: { mapsApiKey: 'test-maps-key' },
  firebase: { enabled: true },
  twilio: { enabled: true },
  nango: {
    enabled: true,
    secretKey: 'nango-test-secret',
    webhookSigningKey: WEBHOOK_SECRET,
    apiBaseUrl: 'https://api.nango.dev',
    integrationIds: {
      xero: 'xero',
      quickbooks: 'quickbooks',
      slack: 'slack',
      'microsoft-teams': 'microsoft-teams',
    },
  },
}));

jest.mock('../lib/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../lib/supabase', () => ({
  select: (...args) => mockSelect(...args),
  insert: (...args) => mockInsert(...args),
  update: (...args) => mockUpdate(...args),
}));

const service = require('../services/integration-connections.service');

function sign(raw) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
}

function authPayload(overrides = {}) {
  return {
    type: 'auth',
    operation: 'creation',
    success: true,
    connectionId: 'conn-xero-1',
    providerConfigKey: 'xero',
    provider: 'xero',
    authMode: 'OAUTH2',
    environment: 'PROD',
    tags: { organization_id: ORG_A, integration_key: 'xero' },
    ...overrides,
  };
}

function connectionRow() {
  return {
    id: 'row-xero',
    organization_id: ORG_A,
    provider_key: 'xero',
    nango_integration_id: 'xero',
    connection_id: 'old-conn',
    status: 'pending',
  };
}

function uniqueViolation() {
  const err = new Error('Supabase request failed: 409 Conflict');
  err.name = 'SupabaseError';
  err.statusCode = 409;
  err.body = JSON.stringify({
    code: '23505',
    message: 'duplicate key value violates unique constraint "integration_webhook_events_provider_event_uq"',
  });
  return err;
}

function inboxInserts() {
  return mockInsert.mock.calls.filter(([table]) => table === 'integration_webhook_events');
}

function inboxUpdates() {
  return mockUpdate.mock.calls.filter(([table]) => table === 'integration_webhook_events');
}

function connectionUpdates() {
  return mockUpdate.mock.calls.filter(([table]) => table === 'integration_connections');
}

describe('integration webhook inbox (durable inbound Nango ingestion)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockUpdate.mockResolvedValue([{ id: 'updated-row' }]);
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('duplicate provider_event_id dedupes: handler runs once, second delivery acks', async () => {
    const raw = Buffer.from(JSON.stringify(authPayload({ eventId: 'evt-123' })));
    mockSelect.mockImplementation(async (table) => {
      if (table === 'integration_connections') return [connectionRow()];
      if (table === 'integration_webhook_events') return [{ id: 'inbox-1', status: 'succeeded' }];
      return [];
    });
    mockInsert
      .mockResolvedValueOnce([{ id: 'inbox-1' }])
      .mockRejectedValueOnce(uniqueViolation());

    const first = await service.ingestNangoWebhook({ rawBody: raw, signature: sign(raw), headers: {} });
    expect(first).toEqual(expect.objectContaining({ outcome: 'processed', eventId: 'inbox-1' }));

    const second = await service.ingestNangoWebhook({ rawBody: raw, signature: sign(raw), headers: {} });
    expect(second).toEqual({ outcome: 'duplicate', eventId: 'inbox-1', handlerResult: null });

    expect(inboxInserts()).toHaveLength(2);
    expect(connectionUpdates()).toHaveLength(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('webhooks without a provider event id dedupe via payload hash', async () => {
    const raw = Buffer.from(JSON.stringify(authPayload()));
    mockSelect
      .mockResolvedValueOnce([]) // first ingest: hash lookup miss (no prior row)
      .mockResolvedValueOnce([connectionRow()]) // first ingest: connection row for handler
      .mockImplementation(async (table) => {
        if (table === 'integration_webhook_events') return [{ id: 'inbox-hash-1', status: 'succeeded' }];
        if (table === 'integration_connections') return [connectionRow()];
        return [];
      });
    mockInsert.mockResolvedValueOnce([{ id: 'inbox-hash-1' }]);

    const first = await service.ingestNangoWebhook({ rawBody: raw, signature: sign(raw), headers: {} });
    expect(first.outcome).toBe('processed');

    // Second identical delivery: hash lookup hits, no second insert attempted.
    const second = await service.ingestNangoWebhook({ rawBody: raw, signature: sign(raw), headers: {} });
    expect(second).toEqual({ outcome: 'duplicate', eventId: 'inbox-hash-1', handlerResult: null });
    expect(inboxInserts()).toHaveLength(1);
    expect(connectionUpdates()).toHaveLength(1);
  });

  test('invalid signature creates no inbox rows and no succeeded state', async () => {
    const raw = Buffer.from(JSON.stringify(authPayload({ eventId: 'evt-bad-sig' })));
    await expect(service.ingestNangoWebhook({
      rawBody: raw,
      signature: 'deadbeef',
      headers: { 'content-type': 'application/json' },
    })).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_NANGO_SIGNATURE' });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('malformed payload persists a failed row with a truncated error', async () => {
    const raw = Buffer.from('{"type": "auth", broken');
    mockInsert.mockResolvedValueOnce([{ id: 'inbox-bad' }]);

    await expect(service.ingestNangoWebhook({
      rawBody: raw,
      signature: sign(raw),
      headers: { 'content-type': 'application/json' },
    })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_NANGO_PAYLOAD' });

    expect(inboxInserts()).toHaveLength(1);
    const persisted = inboxInserts()[0][1][0];
    expect(persisted).toEqual(expect.objectContaining({
      provider_key: 'nango',
      provider_event_id: null,
      signature_result: 'verified',
      status: 'failed',
      attempts: 1,
    }));
    expect(typeof persisted.last_error).toBe('string');
    expect(persisted.last_error.length).toBeLessThanOrEqual(500);
    expect(connectionUpdates()).toHaveLength(0);
  });

  test('handler failure records failed with truncated, secret-redacted error then rethrows', async () => {
    const raw = Buffer.from(JSON.stringify(authPayload({ eventId: 'evt-long-error' })));
    mockSelect.mockResolvedValueOnce([connectionRow()]);
    mockInsert.mockResolvedValueOnce([{ id: 'inbox-err' }]);
    const secret = 'sk_test_51abcdefghijklmnopqrstuvwxyz';
    mockUpdate.mockImplementation(async (table) => {
      if (table === 'integration_connections') {
        throw new Error(`Nango request failed with Bearer ${secret} ${'x'.repeat(2000)}`);
      }
      return [{ id: 'inbox-err' }];
    });

    await expect(service.ingestNangoWebhook({
      rawBody: raw,
      signature: sign(raw),
      headers: {},
    })).rejects.toThrow('Nango request failed');

    const failedUpdates = inboxUpdates().filter(([, patch]) => patch.status === 'failed');
    expect(failedUpdates).toHaveLength(1);
    const lastError = failedUpdates[0][1].last_error;
    expect(lastError.length).toBeLessThanOrEqual(500);
    expect(lastError).not.toContain(secret);
    expect(lastError).not.toContain('Bearer sk_test_');
  });

  test('replay of a failed row reprocesses through the same handler', async () => {
    const failedRow = {
      id: 'inbox-9',
      organization_id: ORG_A,
      provider_key: 'xero',
      status: 'failed',
      attempts: 1,
      payload: authPayload(),
    };
    mockSelect.mockImplementation(async (table) => {
      if (table === 'integration_webhook_events') return [failedRow];
      if (table === 'integration_connections') return [connectionRow()];
      return [];
    });

    const result = await service.replayInboundWebhookEvent({ organizationId: ORG_A, eventId: 'inbox-9' });

    expect(mockSelect).toHaveBeenCalledWith('integration_webhook_events', expect.objectContaining({
      filters: { id: 'inbox-9', organization_id: ORG_A },
    }));
    expect(connectionUpdates()).toHaveLength(1);
    expect(result).toEqual(expect.objectContaining({
      eventId: 'inbox-9',
      status: 'succeeded',
      attempts: 2,
    }));
    const finalUpdate = inboxUpdates().at(-1)[1];
    expect(finalUpdate).toEqual(expect.objectContaining({ status: 'succeeded', attempts: 2, last_error: null }));
  });

  test('replay across organizations 404s without touching any rows', async () => {
    mockSelect.mockResolvedValueOnce([]);

    await expect(service.replayInboundWebhookEvent({
      organizationId: ORG_B,
      eventId: 'inbox-9',
    })).rejects.toMatchObject({ statusCode: 404, code: 'INBOX_EVENT_NOT_FOUND' });

    expect(mockSelect).toHaveBeenCalledWith('integration_webhook_events', expect.objectContaining({
      filters: { id: 'inbox-9', organization_id: ORG_B },
    }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('replay refuses already-succeeded rows unless force is set', async () => {
    const succeededRow = {
      id: 'inbox-done',
      organization_id: ORG_A,
      provider_key: 'xero',
      status: 'succeeded',
      attempts: 1,
      payload: authPayload(),
    };
    mockSelect.mockImplementation(async (table) => {
      if (table === 'integration_webhook_events') return [succeededRow];
      if (table === 'integration_connections') return [connectionRow()];
      return [];
    });

    await expect(service.replayInboundWebhookEvent({
      organizationId: ORG_A,
      eventId: 'inbox-done',
    })).rejects.toMatchObject({ statusCode: 409, code: 'INBOX_EVENT_ALREADY_SUCCEEDED' });
    expect(mockUpdate).not.toHaveBeenCalled();

    const forced = await service.replayInboundWebhookEvent({
      organizationId: ORG_A,
      eventId: 'inbox-done',
      force: true,
    });
    expect(forced).toEqual(expect.objectContaining({ eventId: 'inbox-done', status: 'succeeded', attempts: 2 }));
    expect(connectionUpdates()).toHaveLength(1);
  });

  test('persisted headers are allowlist-only: no secrets, tokens, or cookies', async () => {
    const raw = Buffer.from(JSON.stringify(authPayload({ eventId: 'evt-headers' })));
    mockSelect.mockResolvedValueOnce([connectionRow()]);
    mockInsert.mockResolvedValueOnce([{ id: 'inbox-hdr' }]);
    const signature = sign(raw);

    await service.ingestNangoWebhook({
      rawBody: raw,
      signature,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Nango-Webhooks/1.0',
        'x-request-id': 'req-1',
        authorization: 'Bearer super-secret-token',
        cookie: 'admin_session=abc123',
        'x-nango-hmac-sha256': signature,
        'x-nango-secret-key': 'should-never-persist',
        'x-api-key': 'key-123',
      },
    });

    expect(inboxInserts()).toHaveLength(1);
    const persistedHeaders = inboxInserts()[0][1][0].headers;
    expect(persistedHeaders).toEqual({
      'content-type': 'application/json',
      'user-agent': 'Nango-Webhooks/1.0',
      'x-request-id': 'req-1',
    });
    expect(JSON.stringify(inboxInserts()[0][1][0])).not.toMatch(
      /super-secret-token|admin_session|should-never-persist|key-123/i,
    );
  });
});
