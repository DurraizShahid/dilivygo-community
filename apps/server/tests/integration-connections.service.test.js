'use strict';

const crypto = require('crypto');
const catalog = require('../../../integrations/catalog.json');

jest.mock('../config', () => ({
  stripe: { enabled: true },
  google: { mapsApiKey: 'test-maps-key' },
  firebase: { enabled: true },
  twilio: { enabled: true },
  nango: {
    enabled: true,
    secretKey: 'nango-test-secret',
    webhookSigningKey: 'webhook-test-secret',
    apiBaseUrl: 'https://api.nango.dev',
    integrationIds: {
      quickbooks: 'quickbooks',
      xero: 'xero',
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

const ORG_ID = '11111111-1111-1111-1111-111111111111';

function nangoResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function connectedRow(providerKey, integrationId = providerKey) {
  return {
    id: `row-${providerKey}`,
    organization_id: ORG_ID,
    provider_key: providerKey,
    nango_integration_id: integrationId,
    connection_id: `conn-${providerKey}`,
    status: 'connected',
    connected_at: '2026-09-11T00:00:00Z',
  };
}

describe('integration-connections service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('canonical catalog covers every supported integration exactly once', () => {
    const keys = catalog.map((item) => item.key);
    const names = catalog.map((item) => item.name);
    expect(catalog).toHaveLength(29);
    expect(new Set(keys).size).toBe(29);
    expect(new Set(names).size).toBe(29);
    expect(catalog.filter((item) => item.type === 'nango')).toHaveLength(19);
    expect(catalog.filter((item) => item.type === 'native')).toHaveLength(7);
    expect(catalog.filter((item) => item.type === 'webhook')).toHaveLength(3);
  });

  test('backend provider registry matches every Nango catalog entry', () => {
    const expected = catalog.filter((item) => item.type === 'nango').map((item) => item.key).sort();
    expect(Object.keys(service.PROVIDERS).sort()).toEqual(expected);
    expect(Object.keys(service.PROVIDERS)).toHaveLength(19);
    expect(service.NATIVE_PROVIDERS).toHaveLength(7);
  });

  test('listConnections returns backend status for all 26 non-webhook catalog entries', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await service.listConnections(ORG_ID);
    expect(result).toHaveLength(26);
    expect(new Set(result.map((item) => item.key)).size).toBe(26);
    expect(result.find((item) => item.key === 'twilio')?.status).toBe('configured');
    expect(result.find((item) => item.key === 'slack')?.status).toBe('not_connected');
    expect(result.find((item) => item.key === 'square')?.type).toBe('nango');
  });

  test('verifies Nango webhooks with HMAC-SHA256 and rejects tampering', () => {
    const raw = Buffer.from(JSON.stringify({ type: 'auth', success: true }));
    const signature = crypto
      .createHmac('sha256', 'webhook-test-secret')
      .update(raw)
      .digest('hex');

    expect(service.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(service.verifyWebhookSignature(Buffer.from('{}'), signature)).toBe(false);
    expect(service.verifyWebhookSignature(raw, 'deadbeef')).toBe(false);
  });

  test.each([
    ['quickbooks', 'quickbooks'],
    ['slack', 'slack'],
    ['zendesk', 'zendesk'],
    ['zoho-books', 'zoho-books'],
  ])('creates tenant-tagged connect session for %s', async (providerKey, integrationId) => {
    mockSelect.mockResolvedValueOnce([]);
    mockInsert.mockResolvedValueOnce([{ id: `row-${providerKey}`, status: 'pending' }]);
    global.fetch.mockResolvedValueOnce(nangoResponse({
      data: {
        token: `session-${providerKey}`,
        connect_link: `https://connect.nango.dev/?session_token=session-${providerKey}`,
        expires_at: '2026-09-11T12:30:00Z',
      },
    }, 201));

    const result = await service.createConnectSession({
      organizationId: ORG_ID,
      userId: 'user_123',
      providerKey,
    });

    expect(result.connectLink).toContain('connect.nango.dev');
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.allowed_integrations).toEqual([integrationId]);
    expect(requestBody.tags).toEqual(expect.objectContaining({
      organization_id: ORG_ID,
      end_user_id: 'user_123',
      integration_key: providerKey,
    }));

    const persisted = mockInsert.mock.calls[0][1][0];
    expect(persisted.organization_id).toBe(ORG_ID);
    expect(persisted.provider_key).toBe(providerKey);
    expect(persisted).not.toHaveProperty('access_token');
    expect(persisted).not.toHaveProperty('refresh_token');
    expect(persisted).not.toHaveProperty('client_secret');
  });

  test('reconnect uses only the organization-scoped stored connection', async () => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    global.fetch.mockResolvedValueOnce(nangoResponse({
      data: { token: 'reconnect-token', connect_link: 'https://connect.nango.dev/reconnect' },
    }, 201));

    await service.createReconnectSession({ organizationId: ORG_ID, userId: 'user_123', providerKey: 'slack' });

    expect(mockSelect).toHaveBeenCalledWith('integration_connections', {
      filters: { organization_id: ORG_ID, provider_key: 'slack' },
      limit: 1,
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.connection_id).toBe('conn-slack');
    expect(body.tags.organization_id).toBe(ORG_ID);
  });

  test('proxy sends authenticated provider request through the tenant connection', async () => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    global.fetch.mockResolvedValueOnce(nangoResponse({ results: [{ id: 'contact-1' }] }));

    const result = await service.proxyRequest({
      organizationId: ORG_ID,
      providerKey: 'slack',
      method: 'GET',
      endpoint: '/crm/v3/objects/contacts',
      query: { limit: 10, archived: false },
      headers: { 'X-Test': 'safe-value' },
      retries: 2,
    });

    expect(result.provider).toBe('slack');
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain('/proxy/crm/v3/objects/contacts?');
    expect(url).toContain('limit=10');
    expect(url).toContain('archived=false');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer nango-test-secret',
      'Connection-Id': 'conn-slack',
      'Provider-Config-Key': 'slack',
      Retries: '2',
      'nango-proxy-X-Test': 'safe-value',
    }));
  });

  test.each([
    'https://evil.example.com/steal',
    '//evil.example.com/steal',
    '/v1/../admin',
    '/v1/users?token=hidden',
  ])('proxy rejects unsafe endpoint %s', async (endpoint) => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    await expect(service.proxyRequest({
      organizationId: ORG_ID,
      providerKey: 'slack',
      endpoint,
    })).rejects.toMatchObject({ code: 'INVALID_PROXY_ENDPOINT', statusCode: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('proxy blocks credential and Nango control header overrides', async () => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    await expect(service.proxyRequest({
      organizationId: ORG_ID,
      providerKey: 'slack',
      endpoint: '/api/test',
      headers: { Authorization: 'attacker-token' },
    })).rejects.toMatchObject({ code: 'INVALID_PROXY_HEADERS', statusCode: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('proxy and actions fail closed when the tenant has no connected row', async () => {
    mockSelect.mockResolvedValueOnce([]);
    await expect(service.proxyRequest({
      organizationId: ORG_ID,
      providerKey: 'zendesk',
      endpoint: '/api/v2/tickets.json',
    })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED', statusCode: 409 });

    mockSelect.mockResolvedValueOnce([]);
    await expect(service.triggerAction({
      organizationId: ORG_ID,
      providerKey: 'zendesk',
      actionName: 'create-ticket',
      input: {},
    })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED', statusCode: 409 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('triggerAction uses the tenant connection and provider config key', async () => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    global.fetch.mockResolvedValueOnce(nangoResponse({ data: { ok: true } }));

    const result = await service.triggerAction({
      organizationId: ORG_ID,
      providerKey: 'slack',
      actionName: 'send-message',
      input: { channel: 'ops', text: 'Order delayed' },
    });

    expect(result).toEqual({ provider: 'slack', action: 'send-message', data: { ok: true } });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.nango.dev/action/trigger');
    expect(init.headers).toEqual(expect.objectContaining({
      'Connection-Id': 'conn-slack',
      'Provider-Config-Key': 'slack',
    }));
    expect(JSON.parse(init.body)).toEqual({
      action_name: 'send-message',
      input: { channel: 'ops', text: 'Order delayed' },
    });
  });

  test('auth webhook binds the opaque Nango connection id to the tagged organization', async () => {
    mockSelect.mockResolvedValueOnce([{
      id: 'row-1',
      organization_id: ORG_ID,
      provider_key: 'xero',
      nango_integration_id: 'xero',
      status: 'pending',
    }]);
    mockUpdate.mockResolvedValueOnce([{ id: 'row-1' }]);

    const result = await service.handleAuthWebhook({
      type: 'auth',
      operation: 'creation',
      success: true,
      connectionId: 'opaque-nango-connection-id',
      providerConfigKey: 'xero',
      provider: 'xero',
      authMode: 'OAUTH2',
      environment: 'PROD',
      tags: {
        organization_id: ORG_ID,
        integration_key: 'xero',
      },
    });

    expect(result).toEqual({ updated: true, status: 'connected' });
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({
        connection_id: 'opaque-nango-connection-id',
        status: 'connected',
      }),
      { id: 'row-1' },
    );
  });

  test('disconnect removes the Nango connection then marks only the tenant row disconnected', async () => {
    mockSelect.mockResolvedValueOnce([connectedRow('slack')]);
    global.fetch.mockResolvedValueOnce(nangoResponse({ success: true }));
    mockUpdate.mockResolvedValueOnce([{ id: 'row-slack' }]);

    await expect(service.disconnect({ organizationId: ORG_ID, providerKey: 'slack' })).resolves.toEqual({ success: true });
    expect(global.fetch.mock.calls[0][0]).toContain('/connections/conn-slack?provider_config_key=slack');
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({ connection_id: null, status: 'disconnected' }),
      { id: 'row-slack' },
    );
  });

  test('every provider reports available when no per-provider allowlist is set', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await service.listConnections(ORG_ID);
    const zendesk = result.find((item) => item.key === 'zendesk');
    expect(zendesk).toEqual(expect.objectContaining({ available: true, nangoConfigured: true }));
  });

  describe('NANGO_ENABLED_INTEGRATIONS allowlist', () => {
    const mockedConfig = require('../config');
    const original = mockedConfig.nango.enabledIntegrations;

    afterEach(() => {
      mockedConfig.nango.enabledIntegrations = original;
    });

    test('unlisted providers are not presented as connectable and fail closed', async () => {
      mockedConfig.nango.enabledIntegrations = ['slack'];
      expect(service.isProviderAvailable(service.getProvider('slack'))).toBe(true);
      expect(service.isProviderAvailable(service.getProvider('zendesk'))).toBe(false);

      await expect(service.createConnectSession({
        organizationId: ORG_ID, userId: 'user_123', providerKey: 'zendesk',
      })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED', statusCode: 409 });
      expect(global.fetch).not.toHaveBeenCalled();

      mockSelect.mockResolvedValueOnce([]);
      const result = await service.listConnections(ORG_ID);
      const zendesk = result.find((item) => item.key === 'zendesk');
      expect(zendesk).toEqual(expect.objectContaining({ available: false, nangoConfigured: true }));
      expect(result.find((item) => item.key === 'slack')).toEqual(
        expect.objectContaining({ available: true, nangoConfigured: true }),
      );
    });
  });
});