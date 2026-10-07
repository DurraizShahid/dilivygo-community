'use strict';

/**
 * Integration-style tests proving that model mutations invalidate the
 * customer-facing LRU caches. We mock the Supabase driver so the tests
 * don't touch the network, then assert that a prior cache hit no longer
 * serves stale data after a mutation.
 */

jest.mock('../lib/supabase', () => ({
  select: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue([{ id: 'row-1' }]),
  update: jest.fn().mockResolvedValue([{ id: 'row-1' }]),
  remove: jest.fn().mockResolvedValue(null),
  supabaseFetch: jest.fn().mockResolvedValue(null),
}));

const cache = require('../lib/cache');

beforeEach(() => {
  cache.__resetForTests();
  jest.clearAllMocks();
});

describe('shop.model cache invalidation', () => {
  test('createShop flushes public:shops + public:shop-detail', async () => {
    await cache.wrap('public:shops', 'ref:acme', async () => [{ id: 'old' }]);
    await cache.wrap('public:shop-detail', 'ref:acme:shop:x', async () => ({ id: 'old' }));
    expect(cache.stats()['public:shops'].size).toBe(1);
    expect(cache.stats()['public:shop-detail'].size).toBe(1);

    const db = require('../lib/supabase');
    const shopModel = require('../models/shop.model');
    db.insert.mockResolvedValueOnce([{ id: 'shop-1' }]);

    await shopModel.createShop('acme', { name: 'Test', slug: 'test' });

    expect(cache.stats()['public:shops'].size).toBe(0);
    expect(cache.stats()['public:shop-detail'].size).toBe(0);
  });

  test('updateShop flushes per-shop product + category caches', async () => {
    await cache.wrap('public:catalog:products', 'shop:shop-1', async () => [{ id: 'p1' }]);
    await cache.wrap('public:catalog:products', 'shop:shop-2', async () => [{ id: 'p2' }]);
    await cache.wrap('public:catalog:categories', 'shop:shop-1', async () => [{ id: 'c1' }]);
    expect(cache.stats()['public:catalog:products'].size).toBe(2);

    const db = require('../lib/supabase');
    const shopModel = require('../models/shop.model');
    db.update.mockResolvedValueOnce([{ id: 'shop-1' }]);

    await shopModel.updateShop('shop-1', { name: 'Renamed' });

    // shop-1 keys dropped, shop-2 retained
    const products = cache.getCache('public:catalog:products');
    expect(products.has('shop:shop-1')).toBe(false);
    expect(products.has('shop:shop-2')).toBe(true);
    expect(cache.getCache('public:catalog:categories').has('shop:shop-1')).toBe(false);
  });
});

describe('vendor-settings.model cache invalidation', () => {
  test('upsertByShopId invalidates its own cache and derived public caches', async () => {
    // prime caches
    await cache.wrap('vendor-settings', 'shop:shop-1', async () => ({ id: 'vs-1' }));
    await cache.wrap('public:shop-detail', 'ref:acme:shop:shop-1', async () => ({ id: 'shop-1' }));
    expect(cache.stats()['vendor-settings'].size).toBe(1);
    expect(cache.stats()['public:shop-detail'].size).toBe(1);

    const db = require('../lib/supabase');
    const vendorSettings = require('../models/vendor-settings.model');
    db.select.mockResolvedValueOnce([]); // no existing row → insert path
    db.insert.mockResolvedValueOnce([{ id: 'vs-new', shop_id: 'shop-1' }]);

    await vendorSettings.upsertByShopId('shop-1', 'acme', { auto_accept: true });

    expect(cache.getCache('vendor-settings').has('shop:shop-1')).toBe(false);
    expect(cache.stats()['public:shop-detail'].size).toBe(0);
  });
});

describe('platform-settings.model cache invalidation', () => {
  test('set() for a global key invalidates the platform-settings and public:theme caches', async () => {
    await cache.wrap('platform-settings', 'global:demo_mode', async () => 'false');
    await cache.wrap('public:theme', 'app:web:ref:none', async () => ({ primary: '#000' }));
    expect(cache.stats()['platform-settings'].size).toBe(1);
    expect(cache.stats()['public:theme'].size).toBe(1);

    const platformSettings = require('../models/platform-settings.model');
    await platformSettings.set('demo_mode', 'true');

    expect(cache.getCache('platform-settings').has('global:demo_mode')).toBe(false);
    expect(cache.stats()['public:theme'].size).toBe(0);
  });
});

describe('product.model cache invalidation', () => {
  test('createProduct flushes that shop\'s product catalog cache', async () => {
    await cache.wrap('public:catalog:products', 'shop:shop-1', async () => [{ id: 'p1' }]);
    await cache.wrap('public:catalog:products', 'shop:shop-2', async () => [{ id: 'p2' }]);

    const db = require('../lib/supabase');
    const productModel = require('../models/product.model');
    db.insert.mockResolvedValueOnce([{ id: 'p-new', shop_id: 'shop-1' }]);

    await productModel.createProduct('shop-1', 'acme', {
      name: 'Test',
      priceCents: 100,
    });

    expect(cache.getCache('public:catalog:products').has('shop:shop-1')).toBe(false);
    expect(cache.getCache('public:catalog:products').has('shop:shop-2')).toBe(true);
  });
});
