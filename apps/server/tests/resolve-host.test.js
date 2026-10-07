'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const { select } = require('../lib/supabase');
const { resolveHost } = require('../controllers/public.controller');
const config = require('../config');

/**
 * Filter-test implementation of `select`: each block returns the fixture rows
 * that match every `opts.filters` entry (mirrors the PostgREST filters the
 * real client builds). Lets two organizations + a workspace coexist so the
 * resolver behaviour is asserted across tenants, not just in isolation.
 */
const FIXTURES = {
  organizations: [
    { id: 'org-a-id', public_ref: 'orga', name: 'Org A' },
    { id: 'org-b-id', public_ref: 'orgb', name: 'Org B' },
    { id: 'org-c-id', public_ref: 'orgc', name: 'Org C (no custom host)' },
  ],
  workspaces: [{ id: 'ws-a1', project_ref: 'wsp-aaaa', organization_id: 'org-a-id' }],
  workspace_hostnames: [
    {
      hostname: 'wsp-old.customer.example.com',
      workspace_id: 'ws-a1',
      status: 'active',
      removed_at: null,
    },
    {
      hostname: 'staff-ws-a1.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'vendor',
      status: 'active',
      is_primary: true,
      removed_at: null,
    },
    {
      hostname: 'staff-pending.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'vendor',
      status: 'pending',
      removed_at: null,
    },
    {
      hostname: 'pos-main.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'pos',
      status: 'active',
      is_primary: true,
      removed_at: null,
    },
    {
      hostname: 'pos-pending.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'pos',
      status: 'pending',
      removed_at: null,
    },
  ],
  organization_hostnames: [
    {
      hostname: 'eats.orgx.com',
      organization_id: 'org-b-id',
      app_surface: 'customer',
      status: 'active',
      is_primary: true,
      removed_at: null,
    },
    {
      hostname: 'riders.orgx.com',
      organization_id: 'org-b-id',
      app_surface: 'rider',
      status: 'active',
      is_primary: true,
      removed_at: null,
    },
    {
      hostname: 'legacy-a.example.com',
      organization_id: 'org-a-id',
      app_surface: 'customer',
      status: 'active',
      is_primary: false,
      removed_at: null,
    },
  ],
};

let previousSaas;

function callResolveHost(host, surface) {
  const res = { json: jest.fn() };
  const next = jest.fn();
  const pending = resolveHost({ query: { host, surface } }, res, next);
  return { pending, res, next };
}

beforeAll(() => {
  previousSaas = config.saas;
  config.saas = { dnsApex: 'example.com', appOrigin: '' };
  select.mockImplementation(async (table, opts = {}) => {
    const filters = opts.filters || {};
    const rows = (FIXTURES[table] || []).filter((row) =>
      Object.entries(filters).every(([k, v]) => String(row[k]) === String(v))
    );
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  });
});

afterAll(() => {
  config.saas = previousSaas;
});

describe('/api/public/resolve-host (enriched scope)', () => {
  test('custom hostname resolves to organization with primary canonical host', async () => {
    const { pending, res } = callResolveHost('EATS.OrgX.com', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('organization');
    expect(body.organizationId).toBe('org-b-id');
    expect(body.organizationPublicRef).toBe('orgb');
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.projectRef).toBe('orgb'); // backward-compat field
    expect(body.canonicalHost).toBe('eats.orgx.com');
    expect(body.host).toBe('eats.orgx.com'); // lowercased
    expect(body.surface).toBe('customer');
  });

  test('org subdomain resolves to organization via apex slug', async () => {
    const { pending, res } = callResolveHost('orgb.customer.example.com', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('organization');
    expect(body.organizationId).toBe('org-b-id');
    expect(body.organizationPublicRef).toBe('orgb');
    expect(body.projectRef).toBe('orgb');
    expect(body.canonicalHost).toBe('eats.orgx.com'); // primary custom domain wins
  });

  test('canonical falls back to first active custom hostname when no primary is set', async () => {
    const { pending, res } = callResolveHost('orga.customer.example.com', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.organizationId).toBe('org-a-id');
    expect(body.canonicalHost).toBe('legacy-a.example.com');
  });

  test('canonical falls back to {publicRef}.{surface}.{apex} when org has no custom host', async () => {
    const { pending, res } = callResolveHost('orgc.customer.example.com', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.organizationId).toBe('org-c-id');
    expect(body.canonicalHost).toBe('orgc.customer.example.com');
  });

  test('vendor surface resolves to workspace-kind scope with no canonical host', async () => {
    const { pending, res } = callResolveHost('wsp-aaaa.vendor.example.com', 'vendor');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('workspace');
    expect(body.workspaceProjectRef).toBe('wsp-aaaa');
    expect(body.organizationId).toBe('org-a-id');
    expect(body.organizationPublicRef).toBe('orga');
    expect(body.canonicalHost).toBeNull();
    expect(body.projectRef).toBe('wsp-aaaa');
  });

  test('legacy workspace hostname on customer surface resolves to the org marketplace', async () => {
    const { pending, res } = callResolveHost('wsp-old.customer.example.com', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('organization');
    expect(body.organizationId).toBe('org-a-id');
    expect(body.organizationPublicRef).toBe('orga');
  });

  test('unknown host resolves to found:false with null fields', async () => {
    const { pending, res } = callResolveHost('not-a-tenant.example.net', 'customer');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.projectRef).toBeNull();
    expect(body.canonicalHost).toBeNull();
    expect(body.organizationId).toBeNull();
  });

  test('rider surface resolves org subdomain via apex slug', async () => {
    const { pending, res } = callResolveHost('orgb.rider.example.com', 'rider');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('organization');
    expect(body.organizationId).toBe('org-b-id');
    expect(body.organizationPublicRef).toBe('orgb');
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.projectRef).toBe('orgb');
    expect(body.surface).toBe('rider');
    expect(body.canonicalHost).toBe('riders.orgx.com'); // surface-matched primary custom hostname wins
  });

  test('rider surface resolves rider-scoped custom hostname', async () => {
    const { pending, res } = callResolveHost('RIDERS.OrgX.com', 'rider');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('organization');
    expect(body.organizationId).toBe('org-b-id');
    expect(body.projectRef).toBe('orgb');
    expect(body.canonicalHost).toBe('riders.orgx.com');
    expect(body.host).toBe('riders.orgx.com'); // lowercased
  });

  test('rider canonical falls back to {publicRef}.rider.{apex} when org has no rider hostname', async () => {
    const { pending, res } = callResolveHost('orgc.rider.example.com', 'rider');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.organizationId).toBe('org-c-id');
    expect(body.canonicalHost).toBe('orgc.rider.example.com');
  });

  test('underscore marketplace slug does not resolve on rider surface (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('_marketplace.rider.example.com', 'rider');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.organizationId).toBeNull();
    expect(body.projectRef).toBeNull();
    expect(body.canonicalHost).toBeNull();
  });

  test('workspace custom hostname resolves to workspace kind on vendor surface', async () => {
    const { pending, res } = callResolveHost('staff-ws-a1.example.com', 'vendor');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('workspace');
    expect(body.workspaceProjectRef).toBe('wsp-aaaa');
    expect(body.organizationId).toBe('org-a-id');
    expect(body.organizationPublicRef).toBe('orga');
    expect(body.projectRef).toBe('wsp-aaaa');
    expect(body.canonicalHost).toBeNull();
    expect(body.surface).toBe('vendor');
  });

  test('pending workspace hostname does not resolve on vendor surface (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('staff-pending.example.com', 'vendor');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.organizationId).toBeNull();
    expect(body.projectRef).toBeNull();
  });

  test('underscore marketplace slug does not resolve on vendor surface (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('_marketplace.vendor.example.com', 'vendor');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.organizationId).toBeNull();
    expect(body.projectRef).toBeNull();
  });

  test('bare vendor apex subdomain without a slug does not resolve (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('vendor.example.com', 'vendor');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.projectRef).toBeNull();
  });

  test('pos surface resolves to workspace-kind scope with no canonical host', async () => {
    const { pending, res } = callResolveHost('wsp-aaaa.pos.example.com', 'pos');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('workspace');
    expect(body.workspaceProjectRef).toBe('wsp-aaaa');
    expect(body.organizationId).toBe('org-a-id');
    expect(body.organizationPublicRef).toBe('orga');
    expect(body.canonicalHost).toBeNull();
    expect(body.projectRef).toBe('wsp-aaaa');
    expect(body.surface).toBe('pos');
  });

  test('pos-scoped custom workspace hostname resolves to workspace kind on pos surface', async () => {
    const { pending, res } = callResolveHost('pos-main.example.com', 'pos');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(body.kind).toBe('workspace');
    expect(body.workspaceProjectRef).toBe('wsp-aaaa');
    expect(body.organizationId).toBe('org-a-id');
    expect(body.organizationPublicRef).toBe('orga');
    expect(body.projectRef).toBe('wsp-aaaa');
    expect(body.canonicalHost).toBeNull();
    expect(body.surface).toBe('pos');
  });

  test('pending workspace hostname does not resolve on pos surface (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('pos-pending.example.com', 'pos');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.organizationId).toBeNull();
    expect(body.projectRef).toBeNull();
  });

  test('underscore marketplace slug does not resolve on pos surface (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('_marketplace.pos.example.com', 'pos');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.organizationId).toBeNull();
    expect(body.projectRef).toBeNull();
  });

  test('bare pos apex subdomain without a slug does not resolve (fail-closed unknown)', async () => {
    const { pending, res } = callResolveHost('pos.example.com', 'pos');
    await pending;

    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(false);
    expect(body.kind).toBeNull();
    expect(body.workspaceProjectRef).toBeNull();
    expect(body.projectRef).toBeNull();
  });
});