'use strict';

const cache = require('../lib/cache');

describe('lib/cache (lru-cache wrapper)', () => {
  beforeEach(() => cache.__resetForTests());

  test('wrap() returns loader result on miss and caches it on next hit', async () => {
    const loader = jest.fn().mockResolvedValue({ id: 1, name: 'Alice' });

    const first = await cache.wrap('public:shops', 'ref:test', loader);
    const second = await cache.wrap('public:shops', 'ref:test', loader);

    expect(first).toEqual({ id: 1, name: 'Alice' });
    expect(second).toEqual({ id: 1, name: 'Alice' });
    expect(loader).toHaveBeenCalledTimes(1);

    const s = cache.stats();
    expect(s['public:shops'].hits).toBe(1);
    expect(s['public:shops'].misses).toBe(1);
    expect(s['public:shops'].sets).toBe(1);
    expect(s['public:shops'].size).toBe(1);
  });

  test('wrap() memoises explicit null results via the NULL sentinel', async () => {
    const loader = jest.fn().mockResolvedValue(null);

    const first = await cache.wrap('public:shop-detail', 'ref:x:shop:missing', loader);
    const second = await cache.wrap('public:shop-detail', 'ref:x:shop:missing', loader);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('wrap() does NOT cache when loader returns undefined', async () => {
    const loader = jest.fn().mockResolvedValue(undefined);

    const first = await cache.wrap('public:theme', 'app:web:ref:none', loader);
    const second = await cache.wrap('public:theme', 'app:web:ref:none', loader);

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test('invalidate(name, key) drops a single entry; subsequent call re-loads', async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce({ v: 2 });

    const first = await cache.wrap('vendor-settings', 'shop:abc', loader);
    cache.invalidate('vendor-settings', 'shop:abc');
    const second = await cache.wrap('vendor-settings', 'shop:abc', loader);

    expect(first).toEqual({ v: 1 });
    expect(second).toEqual({ v: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test('invalidate(name) without a key flushes the whole namespace', async () => {
    await cache.wrap('public:catalog:products', 'shop:a', async () => [1]);
    await cache.wrap('public:catalog:products', 'shop:b', async () => [2]);

    expect(cache.stats()['public:catalog:products'].size).toBe(2);

    cache.invalidate('public:catalog:products');
    expect(cache.stats()['public:catalog:products'].size).toBe(0);
  });

  test('invalidateMany() drops multiple entries and tolerates unknown namespaces', async () => {
    await cache.wrap('public:shops', 'ref:a', async () => ['s1']);
    await cache.wrap('public:shop-detail', 'ref:a:shop:1', async () => ({ id: 1 }));

    cache.invalidateMany([
      { name: 'public:shops', key: 'ref:a' },
      { name: 'public:shop-detail', key: 'ref:a:shop:1' },
      { name: 'does-not-exist', key: 'nope' },
    ]);

    expect(cache.stats()['public:shops'].size).toBe(0);
    expect(cache.stats()['public:shop-detail'].size).toBe(0);
  });

  test('invalidateAll() clears every registered namespace', async () => {
    await cache.wrap('public:shops', 'ref:a', async () => ['s1']);
    await cache.wrap('vendor-settings', 'shop:1', async () => ({ id: 1 }));

    cache.invalidateAll();

    const s = cache.stats();
    expect(s['public:shops'].size).toBe(0);
    expect(s['vendor-settings'].size).toBe(0);
  });

  test('getCache() throws for an unregistered namespace', () => {
    expect(() => cache.getCache('unknown')).toThrow(/Unknown cache namespace/);
  });

  test('wrap() honours per-call TTL override (entry expires as expected)', async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    const a = await cache.wrap('public:banners', 'org:x:placement:home', loader, { ttl: 10 });
    expect(a).toBe('first');

    await new Promise((r) => setTimeout(r, 25));

    const b = await cache.wrap('public:banners', 'org:x:placement:home', loader, { ttl: 10 });
    expect(b).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test('registerCache() is idempotent — returns the same instance on repeat calls', () => {
    const first = cache.registerCache('public:shops');
    const second = cache.registerCache('public:shops');
    expect(first).toBe(second);
  });

  test('tenantVariant() leaves the key unchanged without org context or for localhost', () => {
    const orgCtx = { hostContext: { organizationId: 'org-a', host: 'org-a.customer.example' } };
    const localCtx = { hostContext: { organizationId: null, host: 'localhost' } };

    expect(cache.tenantVariant('ref:acme', undefined)).toBe('ref:acme');
    expect(cache.tenantVariant('ref:acme', {})).toBe('ref:acme');
    expect(cache.tenantVariant('ref:acme', localCtx)).toBe('ref:acme');
    expect(cache.tenantVariant('ref:acme', orgCtx)).toBe('ref:acme:org-a');
  });

  test('wrap() isolates cache entries per tenant via hostContext.organizationId', async () => {
    const loaderA = jest.fn().mockResolvedValue({ theme: 'a' });
    const loaderB = jest.fn().mockResolvedValue({ theme: 'b' });

    const reqA = { hostContext: { organizationId: 'org-a', host: 'a.example' } };
    const reqB = { hostContext: { organizationId: 'org-b', host: 'b.example' } };

    const firstA = await cache.wrap('public:theme', 'app:web', loaderA, { req: reqA });
    const firstB = await cache.wrap('public:theme', 'app:web', loaderB, { req: reqB });
    const secondA = await cache.wrap('public:theme', 'app:web', loaderA, { req: reqA });
    const secondB = await cache.wrap('public:theme', 'app:web', loaderB, { req: reqB });

    expect(firstA).toEqual({ theme: 'a' });
    expect(firstB).toEqual({ theme: 'b' });
    expect(secondA).toEqual({ theme: 'a' });
    expect(secondB).toEqual({ theme: 'b' });
    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);
    expect(cache.stats()['public:theme'].size).toBe(2);
  });

  test('invalidate(name, key, req) clears both the base and tenant-variant keys', async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValue({ v: 2 });

    const req = { hostContext: { organizationId: 'org-a', host: 'a.example' } };

    await cache.wrap('public:theme', 'app:web', loader);
    await cache.wrap('public:theme', 'app:web', loader, { req });

    cache.invalidate('public:theme', 'app:web', req);
    expect(cache.stats()['public:theme'].size).toBe(0);

    const reloaded = await cache.wrap('public:theme', 'app:web', loader, { req });
    expect(reloaded).toEqual({ v: 2 });
  });

  test('invalidate(name) flushes tenant-variant entries too', async () => {
    const loader = jest.fn().mockResolvedValue({ v: 1 });
    const req = { hostContext: { organizationId: 'org-a', host: 'a.example' } };

    await cache.wrap('public:banners', 'org:x:placement:home', loader);
    await cache.wrap('public:banners', 'org:x:placement:home', loader, { req });

    cache.invalidate('public:banners');

    expect(cache.stats()['public:banners'].size).toBe(0);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
