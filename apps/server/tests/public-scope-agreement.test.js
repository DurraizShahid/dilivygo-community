'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const { select } = require('../lib/supabase');
const { requireKnownPublicRef } = require('../middleware/public-scope.middleware');
const cache = require('../lib/cache');

const FIXTURES = {
  organizations: [
    { id: 'org-a-id', public_ref: 'orga', name: 'Org A' },
    { id: 'org-b-id', public_ref: 'orgb', name: 'Org B' },
  ],
  workspaces: [{ id: 'ws-b1', project_ref: 'wsp-bbbb', organization_id: 'org-b-id' }],
};

function makeReq(ref, hostContext) {
  return { params: { ref }, hostContext };
}

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  cache.__resetForTests();
  select.mockImplementation(async (table, opts = {}) => {
    const filters = opts.filters || {};
    const rows = (FIXTURES[table] || []).filter((row) =>
      Object.entries(filters).every(([k, v]) => String(row[k]) === String(v))
    );
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  });
});

describe('requireKnownPublicRef — host/ref agreement (HOST_ORG_MISMATCH)', () => {
  test('passes when the verified host and the ref name the same org', async () => {
    const req = makeReq('orga', { organizationId: 'org-a-id' });
    const next = jest.fn();
    await requireKnownPublicRef(req, null, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.publicOrganizationContext?.organizationId).toBe('org-a-id');
  });

  test('passes without a verified host context (no agreement check possible)', async () => {
    const req = makeReq('orga', undefined);
    const next = jest.fn();
    await requireKnownPublicRef(req, null, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.publicOrganizationContext?.organizationId).toBe('org-a-id');
  });

  test('rejects with 403 HOST_ORG_MISMATCH when host org differs from ref org', async () => {
    const req = makeReq('orgb', { organizationId: 'org-a-id' });
    const res = makeRes();
    await requireKnownPublicRef(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('HOST_ORG_MISMATCH');
  });

  test('rejects with 403 even when the ref resolves via a workspace', async () => {
    // ref names org B (via workspace `wsp-bbbb`) while the host is org A.
    const req = makeReq('wsp-bbbb', { organizationId: 'org-a-id' });
    const res = makeRes();
    await requireKnownPublicRef(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('HOST_ORG_MISMATCH');
  });

  test('legacy marketplace ref stays fast-pathed regardless of host org', async () => {
    const req = makeReq('_marketplace', { organizationId: 'org-a-id' });
    const next = jest.fn();
    await requireKnownPublicRef(req, null, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('unknown ref still 404s UNKNOWN_PUBLIC_SCOPE', async () => {
    const req = makeReq('ghost', { organizationId: 'org-a-id' });
    const res = makeRes();
    await requireKnownPublicRef(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('UNKNOWN_PUBLIC_SCOPE');
  });

  test('missing ref 404s', async () => {
    const req = makeReq('', undefined);
    const res = makeRes();
    await requireKnownPublicRef(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});