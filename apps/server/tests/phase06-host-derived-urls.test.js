'use strict';

/**
 * Phase 06 — Shared URL/Origin, Cache, Auth + Cross-App Context.
 *
 * Verifies that tenant-verified host context (attached by
 * `secureHostResolution`) drives canonical server URLs for Stripe Connect
 * callbacks, password-reset origins, and tenant-isolated cache keys,
 * instead of hardcoded platform URLs.
 */

const config = require('../config');
const { connectReturnPaths } = require('../services/vendor-stripe-connect.service');

describe('config.getPublicServerUrl (Phase 06)', () => {
  test('no request → configured publicServerUrl', () => {
    expect(config.getPublicServerUrl(undefined)).toBe(config.publicServerUrl || '');
    expect(config.getPublicServerUrl(null)).toBe(config.publicServerUrl || '');
  });

  test('request without hostContext → configured publicServerUrl', () => {
    expect(config.getPublicServerUrl({})).toBe(config.publicServerUrl || '');
  });

  test('dev classification → localhost default (PUBLIC_SERVER_URL empty)', () => {
    const url = config.getPublicServerUrl({
      hostContext: { classification: 'dev', host: 'localhost', surface: null },
    });
    if (!config.publicServerUrl) {
      expect(url).toBe('http://localhost:8080');
    } else {
      expect(url).toBe(config.publicServerUrl);
    }
  });

  test('known-customer verified host → https://host', () => {
    const url = config.getPublicServerUrl({
      hostContext: {
        classification: 'known-customer',
        host: 'acme.customer.example.com',
        surface: 'customer',
        organizationId: 'org-a',
      },
    });
    expect(url).toBe('https://acme.customer.example.com');
  });

  test('known-staff verified host wins over appUrls override', () => {
    const url = config.getPublicServerUrl({
      hostContext: { classification: 'known-staff', host: 'staff.acme.example.com', surface: 'vendor' },
    });
    expect(url).toBe('https://staff.acme.example.com');
  });

  test('staff surface without a host → configured appUrls for that surface', () => {
    const url = config.getPublicServerUrl({
      hostContext: { classification: 'known-staff', host: null, surface: 'vendor' },
    });
    expect(url).toBe(String(config.appUrls.vendor).replace(/\/$/, ''));
  });

  test('unknown/empty context → publicServerUrl fallback', () => {
    const url = config.getPublicServerUrl({
      hostContext: { classification: 'unknown', host: null, surface: null },
    });
    expect(url).toBe(config.publicServerUrl || '');
  });
});

describe('Stripe Connect return paths derived from verified host (Phase 06)', () => {
  test('vendor kind with verified staff host → paths use that host', () => {
    const req = {
      hostContext: { classification: 'known-staff', host: 'staff.acme.example.com', surface: 'vendor' },
    };
    const paths = connectReturnPaths('vendor', req);
    expect(paths.returnUrl).toBe('https://staff.acme.example.com/stripe-connect?return=1');
    expect(paths.refreshUrl).toBe('https://staff.acme.example.com/stripe-connect?refresh=1');
  });

  test('superadmin kind with verified host uses same derived base', () => {
    const req = {
      hostContext: { classification: 'known-staff', host: 'admin.acme.example.com', surface: 'superadmin' },
    };
    const paths = connectReturnPaths('superadmin', req);
    expect(paths.returnUrl).toBe('https://admin.acme.example.com/stripe-connect?return=1');
  });

  test('dev request → localhost base', () => {
    const req = { hostContext: { classification: 'dev', host: 'localhost', surface: null } };
    const paths = connectReturnPaths('vendor', req);
    expect(paths.returnUrl).toBe('http://localhost:8080/stripe-connect?return=1');
  });

  test('no req → configured appUrls fallback (vendor/superadmin)', () => {
    const vendor = connectReturnPaths('vendor');
    expect(vendor.returnUrl).toBe(`${String(config.appUrls.vendor).replace(/\/$/, '')}/stripe-connect?return=1`);
    expect(vendor.refreshUrl).toBe(`${String(config.appUrls.vendor).replace(/\/$/, '')}/stripe-connect?refresh=1`);

    const sa = connectReturnPaths('superadmin');
    expect(sa.returnUrl).toBe(`${String(config.appUrls.superadmin).replace(/\/$/, '')}/stripe-connect?return=1`);
  });

  test('req without hostContext → configured appUrls fallback', () => {
    const paths = connectReturnPaths('vendor', {});
    expect(paths.returnUrl).toBe(`${String(config.appUrls.vendor).replace(/\/$/, '')}/stripe-connect?return=1`);
  });
});