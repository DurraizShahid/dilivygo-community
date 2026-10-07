'use strict';

const crypto = require('crypto');

jest.mock('../config', () => ({
  env: 'test',
  session: { secret: 'test-session-secret' },
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

const service = require('../services/integration-webhook.service');

describe('integration webhook service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('supports n8n, Zapier and Make as first-class webhook providers', () => {
    expect(Object.keys(service.PROVIDERS).sort()).toEqual(['make', 'n8n', 'zapier']);
    expect(service.EVENT_TYPES).toEqual([
      'order.created',
      'order.status_changed',
      'order.refunded',
    ]);
  });

  test('encrypts signing secrets at rest and can decrypt them for delivery', () => {
    const encrypted = service._test.encryptSecret('dgv_whsec_test');
    expect(encrypted).not.toContain('dgv_whsec_test');
    expect(service._test.decryptSecret(encrypted)).toBe('dgv_whsec_test');
  });

  test('identifies common private and loopback IP ranges', () => {
    expect(service._test.isPrivateIp('127.0.0.1')).toBe(true);
    expect(service._test.isPrivateIp('10.1.2.3')).toBe(true);
    expect(service._test.isPrivateIp('172.16.0.1')).toBe(true);
    expect(service._test.isPrivateIp('192.168.1.1')).toBe(true);
    expect(service._test.isPrivateIp('169.254.10.2')).toBe(true);
    expect(service._test.isPrivateIp('::1')).toBe(true);
    expect(service._test.isPrivateIp('8.8.8.8')).toBe(false);
  });

  test('returns connected provider state without exposing signing secrets', async () => {
    mockSelect.mockResolvedValueOnce([{
      id: 'endpoint-1',
      organization_id: 'org-1',
      provider_key: 'n8n',
      name: 'n8n',
      url: 'https://example.com/webhook',
      event_types: ['order.created'],
      active: true,
      signing_secret_encrypted: 'must-not-leak',
    }]);

    const statuses = await service.getProviderStatuses('org-1');
    const n8n = statuses.find((item) => item.key === 'n8n');

    expect(n8n).toEqual(expect.objectContaining({
      type: 'webhook',
      status: 'connected',
      endpointUrl: 'https://example.com/webhook',
      eventTypes: ['order.created'],
    }));
    expect(n8n).not.toHaveProperty('signingSecret');
    expect(n8n).not.toHaveProperty('signing_secret_encrypted');
  });

  test('sends a signed integration.test event to a connected webhook', async () => {
    const secret = 'dgv_whsec_test-delivery';
    mockSelect.mockResolvedValueOnce([{
      id: 'endpoint-1',
      organization_id: 'org-1',
      provider_key: 'zapier',
      name: 'Zapier',
      url: 'https://8.8.8.8/webhook',
      event_types: ['order.created'],
      active: true,
      signing_secret_encrypted: service._test.encryptSecret(secret),
    }]);
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await service.sendTestEvent({
      organizationId: 'org-1',
      providerKey: 'zapier',
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      providerKey: 'zapier',
      httpStatus: 200,
    }));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://8.8.8.8/webhook');
    expect(options.headers['X-Dilivygo-Event']).toBe('integration.test');
    expect(options.headers['X-Dilivygo-Event-Id']).toMatch(/^integration\.test:/);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(options.body)
      .digest('hex');
    expect(options.headers['X-Dilivygo-Signature-Sha256']).toBe(expectedSignature);
  });
});
