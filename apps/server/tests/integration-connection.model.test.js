'use strict';

/**
 * Phase 01 — model tests for `models/integration-connection.model.js`.
 *
 * `lib/supabase` is mocked (no DB, no network). Focus: org scoping
 * (cross-org miss → `null`), upsert insert-vs-update branching, disconnect
 * semantics, and the token boundary (secret-like fields never persisted).
 */

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../lib/supabase', () => ({
  select: (...args) => mockSelect(...args),
  insert: (...args) => mockInsert(...args),
  update: (...args) => mockUpdate(...args),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const model = require('../models/integration-connection.model');

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

function connectionRow(overrides = {}) {
  return {
    id: 'row-quickbooks',
    organization_id: ORG_A,
    provider_key: 'quickbooks',
    nango_integration_id: 'quickbooks',
    connection_id: 'conn-quickbooks',
    status: 'connected',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('integration-connection model', () => {
  beforeEach(() => {
    mockSelect.mockResolvedValue([]);
    mockInsert.mockImplementation(async (_table, rows) => (Array.isArray(rows) ? rows : [rows]));
    mockUpdate.mockImplementation(async (_table, data, _filters) => [{ ...data }]);
  });

  test('listByOrganization scopes every query to the given org', async () => {
    mockSelect.mockResolvedValue([connectionRow()]);
    const rows = await model.listByOrganization(ORG_A);
    expect(rows).toHaveLength(1);
    expect(mockSelect).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({ filters: { organization_id: ORG_A } }),
    );
  });

  test('findByOrgProvider returns the row and normalizes the key', async () => {
    mockSelect.mockResolvedValue([connectionRow()]);
    const row = await model.findByOrgProvider(ORG_A, '  QuickBooks ');
    expect(row.provider_key).toBe('quickbooks');
    expect(mockSelect).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({
        filters: { organization_id: ORG_A, provider_key: 'quickbooks' },
      }),
    );
  });

  test('findByOrgProvider returns null on cross-org miss', async () => {
    // A row owned by ORG_A must never surface for ORG_B: the org id is part
    // of the filter, so the store returns zero rows → null.
    mockSelect.mockImplementation(async (_table, { filters }) => (
      filters.organization_id === ORG_A ? [connectionRow()] : []
    ));
    await expect(model.findByOrgProvider(ORG_B, 'quickbooks')).resolves.toBeNull();
    await expect(model.findByOrgProvider(null, 'quickbooks')).resolves.toBeNull();
    await expect(model.findByOrgProvider(ORG_A, '')).resolves.toBeNull();
  });

  test('upsertConnectionId inserts when no row exists', async () => {
    mockSelect.mockResolvedValue([]);
    await model.upsertConnectionId(ORG_A, 'xero', { nangoIntegrationId: 'xero', status: 'pending' });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const payload = mockInsert.mock.calls[0][1];
    expect(payload).toMatchObject({
      organization_id: ORG_A,
      provider_key: 'xero',
      nango_integration_id: 'xero',
      status: 'pending',
    });
    expect(payload.id).toEqual(expect.any(String));
  });

  test('upsertConnectionId updates when the row exists', async () => {
    mockSelect.mockResolvedValue([connectionRow()]);
    await model.upsertConnectionId(ORG_A, 'quickbooks', { connectionId: 'conn-new', status: 'connected' });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({ connection_id: 'conn-new', status: 'connected' }),
      { id: 'row-quickbooks' },
    );
  });

  test('upsertConnectionId never persists token-like fields', async () => {
    mockSelect.mockResolvedValue([]);
    await model.upsertConnectionId(ORG_A, 'quickbooks', {
      connectionId: 'conn-1',
      access_token: 'sekret',
      accessToken: 'sekret',
      refresh_token: 'sekret',
      apiKey: 'sekret',
      api_key: 'sekret',
      clientSecret: 'sekret',
      password: 'sekret',
    });
    const payload = mockInsert.mock.calls[0][1];
    for (const key of Object.keys(payload)) {
      expect(key.toLowerCase()).not.toMatch(/token|secret|password|api[_-]?key/);
    }
    expect(Object.values(payload).map(String).join(' ')).not.toContain('sekret');
  });

  test('upsertConnectionId rejects invalid statuses and missing scope', async () => {
    await expect(model.upsertConnectionId(ORG_A, 'quickbooks', { status: 'hacked' }))
      .rejects.toMatchObject({ code: 'INVALID_CONNECTION_FIELDS' });
    await expect(model.upsertConnectionId(null, 'quickbooks', {})).rejects.toThrow();
    await expect(model.upsertConnectionId(ORG_A, '  ', {})).rejects.toThrow();
  });

  test('markDisconnected nulls the connection id and stamps disconnect', async () => {
    mockSelect.mockResolvedValue([connectionRow()]);
    await model.markDisconnected(ORG_A, 'quickbooks');
    expect(mockUpdate).toHaveBeenCalledWith(
      'integration_connections',
      expect.objectContaining({
        connection_id: null,
        status: 'disconnected',
      }),
      { id: 'row-quickbooks' },
    );
  });

  test('markDisconnected returns null when nothing is connected', async () => {
    mockSelect.mockResolvedValue([]);
    await expect(model.markDisconnected(ORG_A, 'quickbooks')).resolves.toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
