'use strict';

const crypto = require('crypto');

jest.mock('../config', () => ({
  env: 'test',
  session: { secret: 'test-session-secret' },
  stripe: { enabled: true },
  google: { mapsApiKey: 'maps-key' },
  firebase: { enabled: true },
  twilio: { enabled: true },
  nango: {
    enabled: true,
    secretKey: 'nango-test-secret',
    webhookSigningKey: 'nango-webhook-secret',
    apiBaseUrl: 'https://api.nango.dev',
    integrationIds: {},
  },
}));

jest.mock('../lib/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();

jest.mock('../lib/supabase', () => ({
  select: (...args) => mockSelect(...args),
  insert: (...args) => mockInsert(...args),
  update: (...args) => mockUpdate(...args),
  remove: (...args) => mockRemove(...args),
}));

const connections = require('../services/integration-connections.service');
const webhooks = require('../services/integration-webhook.service');

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function nangoOk(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

describe('integration tenant isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  test("org A cannot proxy through org B's connection", async () => {
    // Org A has no row; org B's row must never be consulted without org scoping.
    mockSelect.mockResolvedValueOnce([]);
    await expect(connections.proxyRequest({
      organizationId: ORG_A,
      providerKey: 'slack',
      method: 'GET',
      endpoint: '/crm/v3/objects/contacts',
    })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED', statusCode: 409 });
    expect(mockSelect).toHaveBeenCalledWith('integration_connections', expect.objectContaining({
      filters: { organization_id: ORG_A, provider_key: 'slack' },
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("org A cannot trigger actions through org B's connection", async () => {
    mockSelect.mockResolvedValueOnce([]);
    await expect(connections.triggerAction({
      organizationId: ORG_A,
      providerKey: 'slack',
      actionName: 'send-message',
      input: {},
    })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("org A disconnect does not touch org B's row", async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await connections.disconnect({ organizationId: ORG_A, providerKey: 'zendesk' });
    expect(result).toEqual({ success: true, alreadyDisconnected: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('disconnect scopes Nango delete + row update to the calling org row', async () => {
    mockSelect.mockResolvedValueOnce([{
      id: 'row-a-zendesk',
      organization_id: ORG_A,
      provider_key: 'zendesk',
      nango_integration_id: 'zendesk',
      connection_id: 'conn-a',
      status: 'connected',
    }]);
    global.fetch.mockResolvedValueOnce(nangoOk({ success: true }));
    mockUpdate.mockResolvedValueOnce([{ id: 'row-a-zendesk' }]);

    await connections.disconnect({ organizationId: ORG_A, providerKey: 'zendesk' });
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({ status: 'disconnected', connection_id: null }),
      { id: 'row-a-zendesk' },
    );
  });

  test('malformed and unsupported providers fail closed', async () => {
    for (const bad of ['', '   ', '../x', 'NOT-A-PROVIDER', 'x'.repeat(300)]) {
      await expect(connections.createConnectSession({
        organizationId: ORG_A, userId: 'u', providerKey: bad,
      })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_FOUND', statusCode: 404 });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('Nango auth webhook for unknown org does not update unrelated tenants', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await connections.handleAuthWebhook({
      type: 'auth',
      operation: 'creation',
      success: true,
      connectionId: 'conn-unknown',
      providerConfigKey: 'xero',
      tags: { organization_id: ORG_A, integration_key: 'xero' },
    });
    expect(result).toEqual({ ignored: true });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('Nango webhook signature rejects missing/invalid signatures', () => {
    const raw = Buffer.from(JSON.stringify({ type: 'auth' }));
    const valid = crypto.createHmac('sha256', 'nango-webhook-secret').update(raw).digest('hex');
    expect(connections.verifyWebhookSignature(raw, valid)).toBe(true);
    expect(connections.verifyWebhookSignature(raw, 'deadbeef')).toBe(false);
    expect(connections.verifyWebhookSignature(raw, null)).toBe(false);
    expect(connections.verifyWebhookSignature('not-a-buffer', valid)).toBe(false);
  });

  test.each([
    ['http://localhost/webhook', 'local'],
    ['http://127.0.0.1/webhook', 'loopback'],
    ['http://[::1]/webhook', 'ipv6-loopback'],
    ['https://10.0.0.5/hook', 'private-10'],
    ['https://172.16.5.4/hook', 'private-172'],
    ['https://192.168.1.20/hook', 'private-192'],
    ['https://169.254.169.254/hook', 'metadata'],
    ['ftp://example.com/hook', 'scheme'],
    ['not-a-url', 'malformed'],
    ['https://user:secret@example.com/hook', 'embedded-credentials'],
  ])('automation SSRF guard rejects %s (%s)', async (url) => {
    await expect(webhooks.configureEndpoint({
      organizationId: ORG_A, providerKey: 'n8n', url, eventTypes: ['order.created'],
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('automation configure scopes reads/writes to the calling org', async () => {
    // Use a public IP literal so no DNS lookup is required.
    mockSelect.mockResolvedValueOnce([]);
    mockInsert.mockResolvedValueOnce([{ id: 'endpoint-a' }]);
    const result = await webhooks.configureEndpoint({
      organizationId: ORG_A,
      providerKey: 'n8n',
      url: 'https://8.8.8.8/hook',
      eventTypes: ['order.created'],
    });
    expect(mockSelect).toHaveBeenCalledWith('integration_webhook_endpoints', expect.objectContaining({
      filters: { organization_id: ORG_A, provider_key: 'n8n' },
    }));
    expect(mockInsert.mock.calls[0][1][0]).toEqual(expect.objectContaining({ organization_id: ORG_A }));
    expect(result.endpoint.url).toBe('https://8.8.8.8/hook');
    expect(result.signingSecret).toMatch(/^dgv_whsec_/);
  });
});
