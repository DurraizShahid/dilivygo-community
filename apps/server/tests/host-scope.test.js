'use strict';

/**
 * Unit tests for `lib/host-scope.js` — the tenant scope a request was served
 * on (`resolveAuthHostScope`) and the staff host/session agreement guard
 * (`staffHostMismatchResponse`). These are the backend guarantees behind the
 * vendor + pos web custom-domain integration:
 *
 *  - `workspace_hostnames` (exact) resolve to `kind: 'staff'` only for staff
 *    surfaces (vendor/pos); customer/rider rows are legacy customer-facing.
 *  - `{slug}.{vendor|pos}.{apex}` resolves staff to a single workspace.
 *  - Pending/inactive hostname rows never route (ADR-001 section 2.6).
 *  - Staff sessions may only be used on their own workspace host
 *    (`WRONG_WORKSPACE_HOST`), never across orgs (`WRONG_ORG_HOST`), with
 *    platform-wide riders (`project_ref = null`) as the only cross-workspace
 *    exception on staff hosts.
 */

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const { select } = require('../lib/supabase');
const {
  resolveAuthHostScope,
  staffHostMismatchResponse,
} = require('../lib/host-scope');
const config = require('../config');

const FIXTURES = {
  organizations: [
    { id: 'org-a-id', public_ref: 'orga', name: 'Org A' },
    { id: 'org-b-id', public_ref: 'orgb', name: 'Org B' },
  ],
  workspaces: [{ id: 'ws-a1', project_ref: 'wsp-aaaa', organization_id: 'org-a-id' }],
  workspace_hostnames: [
    {
      hostname: 'staff-ws-a1.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'vendor',
      status: 'active',
      removed_at: null,
    },
    {
      hostname: 'ws-old.customer.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'customer',
      status: 'active',
      removed_at: null,
    },
    {
      hostname: 'ws-super.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'superadmin',
      status: 'active',
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
      removed_at: null,
    },
    {
      hostname: 'pos-pending.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'pos',
      status: 'pending',
      removed_at: null,
    },
    {
      // Legacy cross-table duplicate (pre-113 backfill) — org row must win.
      hostname: 'dup.example.com',
      workspace_id: 'ws-a1',
      app_surface: 'customer',
      status: 'active',
      removed_at: null,
    },
  ],
  organization_hostnames: [
    {
      hostname: 'org-b.eats.com',
      organization_id: 'org-b-id',
      app_surface: 'customer',
      status: 'active',
      removed_at: null,
    },
    {
      // Legacy cross-table duplicate — organization_hostnames has precedence.
      hostname: 'dup.example.com',
      organization_id: 'org-b-id',
      app_surface: 'customer',
      status: 'active',
      removed_at: null,
    },
  ],
};

let previousSaas;

function reqFor(host) {
  return { headers: { host: String(host).toLowerCase() } };
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

describe('resolveAuthHostScope - workspace custom hostnames (vendor web)', () => {
  test('active vendor workspace hostname resolves to staff scope pinned to that workspace', async () => {
    const scope = await resolveAuthHostScope(reqFor('staff-ws-a1.example.com'));
    expect(scope).toEqual({
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    });
  });

  test('vendor workspace hostname with trailing dot / mixed case / port normalizes', async () => {
    const scope = await resolveAuthHostScope(
      reqFor('Staff-Ws-A1.Example.Com.:3000')
    );
    expect(scope?.kind).toBe('staff');
    expect(scope?.workspaceProjectRef).toBe('wsp-aaaa');
  });

  test('legacy customer hostname mapped at workspace level is customer-facing, not staff', async () => {
    const scope = await resolveAuthHostScope(reqFor('ws-old.customer.example.com'));
    expect(scope?.kind).toBe('customer-facing');
    expect(scope?.surface).toBe('customer');
    expect(scope?.workspaceProjectRef).toBeNull();
    expect(scope?.organizationId).toBe('org-a-id');
  });

  test('legacy superadmin hostname mapped at workspace level is platform (no binding)', async () => {
    const scope = await resolveAuthHostScope(reqFor('ws-super.example.com'));
    expect(scope?.kind).toBe('platform');
    expect(scope?.surface).toBe('superadmin');
    expect(scope?.workspaceProjectRef).toBeNull();
    expect(scope?.organizationId).toBeNull();
  });

  test('pending workspace hostname does not route (fail-closed, no fallback tenant)', async () => {
    const scope = await resolveAuthHostScope(reqFor('staff-pending.example.com'));
    expect(scope).toBeNull();
  });

  test('unknown hostname resolves to null', async () => {
    const scope = await resolveAuthHostScope(reqFor('nope.example.net'));
    expect(scope).toBeNull();
  });

  test('missing host header resolves to null', async () => {
    const scope = await resolveAuthHostScope({ headers: {} });
    expect(scope).toBeNull();
  });

  test('active pos-scoped workspace hostname resolves to staff scope pinned to that workspace', async () => {
    const scope = await resolveAuthHostScope(reqFor('pos-main.example.com'));
    expect(scope).toEqual({
      kind: 'staff',
      surface: 'pos',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    });
  });

  test('pending pos workspace hostname does not route (fail-closed, no fallback tenant)', async () => {
    const scope = await resolveAuthHostScope(reqFor('pos-pending.example.com'));
    expect(scope).toBeNull();
  });
});

describe('resolveAuthHostScope - apex subdomain patterns', () => {
  test('{projectRef}.vendor.{apex} resolves to staff workspace', async () => {
    const scope = await resolveAuthHostScope(reqFor('wsp-aaaa.vendor.example.com'));
    expect(scope).toEqual({
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    });
  });

  test('{orgPublicRef}.rider.{apex} resolves to the org marketplace (not a workspace)', async () => {
    const scope = await resolveAuthHostScope(reqFor('orga.rider.example.com'));
    expect(scope).toEqual({
      kind: 'customer-facing',
      surface: 'rider',
      workspaceProjectRef: null,
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    });
  });

  test('workspace project_ref slug on a rider apex does not resolve (org lookup only)', async () => {
    const scope = await resolveAuthHostScope(reqFor('wsp-aaaa.rider.example.com'));
    expect(scope).toBeNull();
  });

  test('bare superadmin.{apex} is platform', async () => {
    const scope = await resolveAuthHostScope(reqFor('superadmin.example.com'));
    expect(scope?.kind).toBe('platform');
    expect(scope?.surface).toBe('superadmin');
  });

  test('underscore marketplace slug does not resolve on vendor surface', async () => {
    const scope = await resolveAuthHostScope(reqFor('_marketplace.vendor.example.com'));
    expect(scope).toBeNull();
  });

  test('bare vendor.{apex} without a slug does not resolve', async () => {
    const scope = await resolveAuthHostScope(reqFor('vendor.example.com'));
    expect(scope).toBeNull();
  });

  test('{projectRef}.pos.{apex} resolves to staff pos workspace', async () => {
    const scope = await resolveAuthHostScope(reqFor('wsp-aaaa.pos.example.com'));
    expect(scope).toEqual({
      kind: 'staff',
      surface: 'pos',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    });
  });

  test('underscore marketplace slug does not resolve on pos surface', async () => {
    const scope = await resolveAuthHostScope(reqFor('_marketplace.pos.example.com'));
    expect(scope).toBeNull();
  });

  test('bare pos.{apex} without a slug does not resolve', async () => {
    const scope = await resolveAuthHostScope(reqFor('pos.example.com'));
    expect(scope).toBeNull();
  });
});

describe('resolveAuthHostScope - cross-scope precedence (organization-first)', () => {
  test('legacy duplicate across both tables resolves to the organization row', async () => {
    // Pre-113 backfill may have left the same hostname in both tables. The
    // organization_hostnames row is authoritative (org-as-marketplace model),
    // so the workspace row must NOT shadow it.
    const scope = await resolveAuthHostScope(reqFor('dup.example.com'));
    expect(scope).toEqual({
      kind: 'customer-facing',
      surface: 'customer',
      workspaceProjectRef: null,
      organizationId: 'org-b-id',
      organizationPublicRef: 'orgb',
    });
  });
});

describe('staffHostMismatchResponse - host/session workspace agreement', () => {
  test('null scope is always allowed (no host binding - dev / direct API)', () => {
    expect(staffHostMismatchResponse({}, null, null)).toBeNull();
  });

  test('platform scope allows any staff user', () => {
    const scope = {
      kind: 'platform',
      surface: 'superadmin',
      workspaceProjectRef: null,
      organizationId: null,
      organizationPublicRef: null,
    };
    expect(staffHostMismatchResponse({}, scope, null)).toBeNull();
  });

  test('matching workspace + org on a vendor host is allowed', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-aaaa', role: 'vendor', organization_id: 'org-a-id' };
    expect(staffHostMismatchResponse(user, scope, null)).toBeNull();
  });

  test('cross-workspace staff is rejected with WRONG_WORKSPACE_HOST', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-bbbb', role: 'vendor', organization_id: 'org-a-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.status).toBe(403);
    expect(out?.body?.code).toBe('WRONG_WORKSPACE_HOST');
  });

  test('admin from another org on a staff host is rejected with WRONG_ORG_HOST (checked first)', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-xyxy', role: 'admin', organization_id: 'org-b-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.body?.code).toBe('WRONG_ORG_HOST');
  });

  test('platform-wide rider (project_ref null) may use any staff host', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: null, role: 'rider', organization_id: null };
    expect(staffHostMismatchResponse(user, scope, null)).toBeNull();
  });

  test('workspace-bound rider on a different staff host is rejected', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-bbbb', role: 'rider', organization_id: 'org-a-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.body?.code).toBe('WRONG_WORKSPACE_HOST');
  });

  test('customer-facing host still enforces org agreement for cross-org staff', () => {
    const scope = {
      kind: 'customer-facing',
      surface: 'customer',
      workspaceProjectRef: null,
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: null, role: 'admin', organization_id: 'org-b-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.body?.code).toBe('WRONG_ORG_HOST');
  });

  test('resolvedUserOrgId is used when user row has no organization_id', () => {
    const scope = {
      kind: 'staff',
      surface: 'vendor',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-aaaa', role: 'vendor' };
    expect(staffHostMismatchResponse(user, scope, 'org-a-id')).toBeNull();
    expect(staffHostMismatchResponse(user, scope, 'org-b-id')?.body?.code).toBe('WRONG_ORG_HOST');
  });

  test('matching workspace + org on a pos host is allowed', () => {
    const scope = {
      kind: 'staff',
      surface: 'pos',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-aaaa', role: 'admin', organization_id: 'org-a-id' };
    expect(staffHostMismatchResponse(user, scope, null)).toBeNull();
  });

  test('cross-workspace staff on a pos host is rejected with WRONG_WORKSPACE_HOST', () => {
    const scope = {
      kind: 'staff',
      surface: 'pos',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-bbbb', role: 'admin', organization_id: 'org-a-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.status).toBe(403);
    expect(out?.body?.code).toBe('WRONG_WORKSPACE_HOST');
  });

  test('admin from another org on a pos host is rejected with WRONG_ORG_HOST (checked first)', () => {
    const scope = {
      kind: 'staff',
      surface: 'pos',
      workspaceProjectRef: 'wsp-aaaa',
      organizationId: 'org-a-id',
      organizationPublicRef: 'orga',
    };
    const user = { project_ref: 'wsp-xyxy', role: 'admin', organization_id: 'org-b-id' };
    const out = staffHostMismatchResponse(user, scope, null);
    expect(out?.body?.code).toBe('WRONG_ORG_HOST');
  });
});