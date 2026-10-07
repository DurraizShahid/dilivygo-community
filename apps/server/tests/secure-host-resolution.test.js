'use strict';

const request = require('supertest');
const express = require('express');
const { extractTrustedHost, resolveRequestHost, secureHostResolution, enforceTenantContext, validateHostSecurity, DEV_HOSTS } = require('../middleware/secure-host-resolution.middleware');
const config = require('../config');

describe('extractTrustedHost', () => {
  test('dev: Host header without port', () => {
    const host = extractTrustedHost({ headers: { host: 'localhost:3000' } });
    // localhost is in DEV_HOSTS but extractTrustedHost returns canonical form
    expect(host).toBe('localhost');
  });

  test('dev: Host header with trailing dot stripped', () => {
    const host = extractTrustedHost({ headers: { host: 'localhost.' } });
    expect(host).toBe('localhost');
  });

  test('trust-proxy: x-forwarded-host preferred over host', () => {
    const cfg = require('../config');
    const prev = cfg.trustProxyHops;
    cfg.trustProxyHops = 1;
    try {
      const host = extractTrustedHost({
        headers: { 'x-forwarded-host': 'custom.example.com', host: 'evil.com' },
        hostname: 'evil.com',
      });
      expect(host).toBe('custom.example.com');
    } finally {
      cfg.trustProxyHops = prev;
    }
  });

  test('trust-proxy: 0 trust hops ignores x-forwarded-host', () => {
    const cfg = require('../config');
    const prev = cfg.trustProxyHops;
    cfg.trustProxyHops = 0;
    try {
      const host = extractTrustedHost({
        headers: { host: 'direct.com', 'x-forwarded-host': 'spoof.com' },
      });
      expect(host).toBe('direct.com');
    } finally {
      cfg.trustProxyHops = prev;
    }
  });

  test('null on missing host', () => {
    const host = extractTrustedHost({ headers: {} });
    expect(host).toBeNull();
  });

  test('null on protocol-injected host', () => {
    const host = extractTrustedHost({ headers: { host: 'http://evil.com' } });
    expect(host).toBeNull();
  });

  test('null on path-injected host', () => {
    const host = extractTrustedHost({ headers: { host: 'evil.com/path' } });
    expect(host).toBeNull();
  });

  test('null on wildcard host', () => {
    const host = extractTrustedHost({ headers: { host: '*.example.com' } });
    expect(host).toBeNull();
  });
});

describe('resolveRequestHost classification', () => {
  test('dev host classification', async () => {
    const req = { headers: { host: 'localhost:8080' }, path: '/' };
    const ctx = await resolveRequestHost(req);
    expect(ctx.classification).toBe('dev');
    expect(ctx.organizationId).toBeNull();
  });

  test('unknown host classification returns error', async () => {
    const cfg = require('../config');
    const prev = cfg.saas?.dnsApex;
    cfg.saas = { dnsApex: '' };
    try {
      const req = { headers: { host: 'unknown.evilsite.com' } };
      const ctx = await resolveRequestHost(req);
      expect(ctx.classification).toBe('unknown');
      expect(ctx.error).toBeDefined();
    } finally {
      cfg.saas = { dnsApex: prev || '' };
    }
  });

  test('missing host header returns unknown with error', async () => {
    const req = { headers: {} };
    const ctx = await resolveRequestHost(req);
    expect(ctx.classification).toBe('unknown');
    expect(ctx.error).toBeDefined();
  });

  test('null host returns unknown', async () => {
    const req = { headers: { host: '' } };
    const ctx = await resolveRequestHost(req);
    expect(ctx.classification).toBe('unknown');
  });
});

describe('resolveRequestHost platform host classification', () => {
  const withPlatformHost = async (hosts, fn) => {
    const prev = config.platformHosts;
    config.platformHosts = new Set([...(prev || []), ...hosts]);
    try {
      await fn();
    } finally {
      config.platformHosts = prev;
    }
  };

  test('PUBLIC_SERVER_URL host is classified platform without DB hit', async () => {
    await withPlatformHost(['api.public.test'], async () => {
      const ctx = await resolveRequestHost({ headers: { host: 'api.public.test' } });
      expect(ctx.classification).toBe('platform');
      expect(ctx.surface).toBeNull();
      expect(ctx.organizationId).toBeNull();
      expect(ctx.organizationPublicRef).toBeNull();
      expect(ctx.workspaceProjectRef).toBeNull();
      expect(ctx.isActive).toBe(true);
      expect(ctx.error).toBeNull();
    });
  });

  test('TRUSTED_PLATFORM_HOSTS entries are classified platform', async () => {
    await withPlatformHost(['platform-extra.example.net'], async () => {
      const ctx = await resolveRequestHost({ headers: { host: 'platform-extra.example.net' } });
      expect(ctx.classification).toBe('platform');
    });
  });

  test('platform classification is independent of SAAS_DNS_APEX configuration', async () => {
    const prevSaas = config.saas;
    config.saas = { dnsApex: '' };
    try {
      await withPlatformHost(['api.public.test'], async () => {
        const ctx = await resolveRequestHost({ headers: { host: 'api.public.test' } });
        expect(ctx.classification).toBe('platform');
      });
    } finally {
      config.saas = prevSaas;
    }
  });

  test('non-platform unknown hosts are still rejected (fail closed preserved)', async () => {
    const prevSaas = config.saas;
    config.saas = { dnsApex: '' };
    try {
      const ctx = await resolveRequestHost({ headers: { host: 'not-on-platform.evilsite.com' } });
      expect(ctx.classification).toBe('unknown');
      expect(ctx.error).toBeDefined();
    } finally {
      config.saas = prevSaas;
    }
  });

  test('secureHostResolution integration returns 200 for platform host', async () => {
    await withPlatformHost(['api.public.test'], async () => {
      const app = express();
      app.use(validateHostSecurity);
      app.use(secureHostResolution);
      app.use((req, res) => res.json({ hostContext: req.hostContext }));
      const res = await request(app).get('/').set('Host', 'api.public.test');
      expect(res.statusCode).toBe(200);
      expect(res.body.hostContext.classification).toBe('platform');
    });
  });
});

describe('validateHostSecurity', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(validateHostSecurity);
    app.use((req, res) => res.json({ ok: true }));
  });

  test('valid host passes', async () => {
    const res = await request(app).get('/').set('Host', 'example.com');
    expect(res.statusCode).toBe(200);
  });

  test('missing host returns 400', async () => {
    // supertest auto-adds Host header; delete it to simulate missing header.
    const res = await request(app).get('/').set('Host', '');
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('HOST_HEADER_REQUIRED');
  });

  test('oversized Host header returns 400', async () => {
    const long = 'a'.repeat(254) + '.com';
    const res = await request(app).get('/').set('Host', long);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('HOST_HEADER_TOO_LONG');
  });

  test('protocol-injected host returns 400', async () => {
    const res = await request(app).get('/').set('Host', 'http://evil.com');
    expect(res.statusCode).toBe(400);
  });
});

describe('secureHostResolution integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.set('trust proxy', 0);
    app.use(validateHostSecurity);
    app.use(secureHostResolution);
    app.use((req, res) => {
      res.json({ hostContext: req.hostContext });
    });
  });

  test('dev host passes through', async () => {
    const res = await request(app).get('/').set('Host', 'localhost:8080');
    expect(res.statusCode).toBe(200);
    expect(res.body.hostContext.classification).toBe('dev');
  });

  test('unknown host returns 404', async () => {
    const res = await request(app).get('/').set('Host', 'unknown.evilsite.invalid');
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_HOST');
  });

  test('health check passes without host', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
  });
});

describe('enforceTenantContext', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use((req, _res, next) => {
      req.hostContext = { classification: 'known-customer', organizationId: 'org-a', host: 'customer.example.com' };
      next();
    });
    app.use(enforceTenantContext);
    app.use((req, res) => res.json({ ok: true }));
  });

  test('passes when host context and no URL ref conflict', async () => {
    const res = await request(app).get('/').set('Host', 'customer.example.com');
    expect(res.statusCode).toBe(200);
  });

  test('passes when dev classification skips enforcement', async () => {
    app = express();
    app.use((req, _res, next) => {
      req.hostContext = { classification: 'dev' };
      next();
    });
    app.use(enforceTenantContext);
    app.use((req, res) => res.json({ ok: true }));
    const res = await request(app).get('/').set('Host', 'localhost:3000');
    expect(res.statusCode).toBe(200);
  });
});

describe('DEV_HOSTS set', () => {
  test('contains localhost variants', () => {
    expect(DEV_HOSTS.has('localhost')).toBe(true);
    expect(DEV_HOSTS.has('127.0.0.1')).toBe(true);
    expect(DEV_HOSTS.has('::1')).toBe(true);
  });
  test('does not contain production hostnames', () => {
    expect(DEV_HOSTS.has('example.com')).toBe(false);
    expect(DEV_HOSTS.has('customer.example.com')).toBe(false);
  });
});
