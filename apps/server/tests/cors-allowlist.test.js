'use strict';

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  supabaseFetch: jest.fn(),
}));

const { select } = require('../lib/supabase');
const corsOptions = require('../config/cors');
const cache = require('../lib/cache');
const config = require('../config');
const {
  invalidateCustomHostnamesCache,
  CORS_CACHE_NAME,
} = require('../lib/organization-hostnames');

const HOSTNAME_ROWS = [
  {
    hostname: 'mybrand.example.com',
    organization_id: 'org-a-id',
    app_surface: 'customer',
    status: 'active',
    is_primary: true,
    removed_at: null,
  },
  {
    hostname: 'parked.example.com',
    organization_id: 'org-a-id',
    app_surface: 'customer',
    status: 'removed',
    is_primary: false,
    removed_at: null,
  },
  {
    hostname: 'legacy-removed.example.com',
    organization_id: 'org-a-id',
    app_surface: 'customer',
    status: 'active',
    is_primary: false,
    removed_at: '2026-01-01T00:00:00Z',
  },
];

const WORKSPACE_HOSTNAME_ROWS = [
  {
    hostname: 'staff.vendor.example.com',
    workspace_id: 'ws-a-id',
    app_surface: 'vendor',
    status: 'active',
    is_primary: true,
    removed_at: null,
  },
  {
    hostname: 'pos-staff.example.com',
    workspace_id: 'ws-a-id',
    app_surface: 'pos',
    status: 'removed',
    is_primary: false,
    removed_at: null,
  },
];

function installSelect() {
  select.mockImplementation(async (table, opts = {}) => {
    const rowsByTable = {
      organization_hostnames: HOSTNAME_ROWS,
      workspace_hostnames: WORKSPACE_HOSTNAME_ROWS,
    };
    const tableRows = rowsByTable[table];
    if (!tableRows) return [];
    const filters = opts.filters || {};
    const rows = tableRows.filter((row) =>
      Object.entries(filters).every(([k, v]) => String(row[k]) === String(v))
    );
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  });
}

/** Promise wrapper for the cors `origin` delegate. Resolves when allowed. */
function checkOrigin(origin) {
  return new Promise((resolve, reject) => {
    corsOptions.origin(origin, (err, allow) => (err ? reject(err) : resolve(allow)));
  });
}

let previousSaas;

beforeAll(() => {
  previousSaas = config.saas;
  config.saas = { dnsApex: 'example.com', appOrigin: '' };
  installSelect();
});

beforeEach(() => {
  cache.__resetForTests();
});

afterAll(() => {
  config.saas = previousSaas;
});

describe('CORS allowlist for organization custom hostnames', () => {
  test('active custom hostname origin is allowed', async () => {
    await expect(checkOrigin('https://mybrand.example.com')).resolves.toBe(true);
  });

  test('removed custom hostname origin is rejected', async () => {
    await expect(checkOrigin('https://parked.example.com')).rejects.toThrow(/CORS policy/);
  });

  test('soft-deleted custom hostname origin is rejected', async () => {
    await expect(checkOrigin('https://legacy-removed.example.com')).rejects.toThrow(/CORS policy/);
  });

  test('unknown origin is rejected', async () => {
    await expect(checkOrigin('https://evil.example.net')).rejects.toThrow(/CORS policy/);
  });

  test('active workspace (staff) custom hostname origin is allowed', async () => {
    await expect(checkOrigin('https://staff.vendor.example.com')).resolves.toBe(true);
  });

  test('removed workspace hostname origin is rejected', async () => {
    await expect(checkOrigin('https://pos-staff.example.com')).rejects.toThrow(/CORS policy/);
  });

  test('no-origin requests (mobile/server) are allowed', async () => {
    await expect(checkOrigin(undefined)).resolves.toBe(true);
  });

  test('platform tenant subdomains are still allowed without a DB hit', async () => {
    await expect(checkOrigin('https://orgb.customer.example.com')).resolves.toBe(true);
    expect(select).not.toHaveBeenCalled();
  });

  test('fail closed when the allowlist lookup throws', async () => {
    select.mockRejectedValueOnce(new Error('db down'));
    await expect(checkOrigin('https://mybrand.example.com')).rejects.toThrow(/CORS policy/);
  });

  test('lookup results are cached, then invalidated on demand', async () => {
    await checkOrigin('https://mybrand.example.com');
    const callsAfterFirst = select.mock.calls.length;

    await checkOrigin('https://mybrand.example.com');
    expect(select.mock.calls.length).toBe(callsAfterFirst); // cache hit, no re-query

    invalidateCustomHostnamesCache();
    expect(cache.stats()[CORS_CACHE_NAME].size).toBe(0);

    await checkOrigin('https://mybrand.example.com');
    expect(select.mock.calls.length).toBeGreaterThan(callsAfterFirst); // re-queried
  });
});