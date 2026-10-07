'use strict';

const { insert, remove, select } = require('../lib/supabase');
const { mapShop, mapProduct, mapProductVariant } = require('../lib/case');
const productVariantModel = require('../models/product-variant.model');

function mapFavoriteRows(rows = []) {
  const favoriteShops = [];
  const favoriteProducts = [];

  for (const row of rows) {
    if (row.kind === 'shop' && row.shops) {
      favoriteShops.push({
        id: row.id,
        shopId: row.shop_id,
        createdAt: row.created_at,
        shop: mapShop(row.shops),
      });
    }
    if (row.kind === 'product' && row.products) {
      favoriteProducts.push({
        id: row.id,
        productId: row.product_id,
        shopId: row.shop_id || row.products?.shop_id || null,
        createdAt: row.created_at,
        product: mapProduct(row.products, { forCustomer: true }),
      });
    }
  }

  return { favoriteShops, favoriteProducts };
}

async function listFavorites(req, res, next) {
  try {
    const rows = await select('customer_favorites', {
      select:
        'id,kind,shop_id,product_id,created_at,shops(*),products(*)',
      filters: { customer_id: req.customer.id },
      order: 'created_at.desc',
    });

    const { favoriteShops, favoriteProducts } = mapFavoriteRows(rows || []);
    const productIds = [...new Set(favoriteProducts.map((f) => f.productId).filter(Boolean))];
    if (productIds.length) {
      const variantsByProduct = await productVariantModel.listByProductIds(productIds);
      for (const fp of favoriteProducts) {
        const raw = variantsByProduct[fp.productId] || [];
        fp.product.variants = raw
          .filter((r) => r.available !== false)
          .map((r) => mapProductVariant(r, { forCustomer: true }));
      }
    }

    return res.json({ favoriteShops, favoriteProducts });
  } catch (err) {
    next(err);
  }
}

async function addFavoriteShop(req, res, next) {
  try {
    const { shopId } = req.params;
    const shopRows = await select('shops', {
      filters: { id: shopId, is_active: true },
      limit: 1,
    });
    const shop = shopRows?.[0];
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    // Tenant isolation: a customer can only favorite shops inside their own
    // organization. Guards against URL-hacking an out-of-tenant shop_id.
    const customerOrgId =
      req.customer?.organization_id || req.customer?.organizationId || null;
    if (customerOrgId && shop.organization_id && String(shop.organization_id) !== String(customerOrgId)) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const existing = await select('customer_favorites', {
      filters: {
        customer_id: req.customer.id,
        kind: 'shop',
        shop_id: shopId,
      },
      limit: 1,
    });
    if (existing?.length) return res.status(200).json({ ok: true });

    await insert('customer_favorites', {
      customer_id: req.customer.id,
      project_ref: shop.project_ref,
      kind: 'shop',
      shop_id: shopId,
      product_id: null,
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function removeFavoriteShop(req, res, next) {
  try {
    const { shopId } = req.params;
    await remove('customer_favorites', {
      customer_id: req.customer.id,
      kind: 'shop',
      shop_id: shopId,
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function addFavoriteProduct(req, res, next) {
  try {
    const { productId } = req.params;
    const productRows = await select('products', {
      filters: { id: productId },
      limit: 1,
    });
    const product = productRows?.[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    // Tenant isolation: block favoriting a product whose parent shop belongs
    // to another organization.
    const customerOrgId =
      req.customer?.organization_id || req.customer?.organizationId || null;
    if (customerOrgId && product.shop_id) {
      const shopRows = await select('shops', {
        filters: { id: product.shop_id },
        limit: 1,
      });
      const shop = shopRows?.[0];
      if (shop?.organization_id && String(shop.organization_id) !== String(customerOrgId)) {
        return res.status(404).json({ error: 'Product not found' });
      }
    }

    const existing = await select('customer_favorites', {
      filters: {
        customer_id: req.customer.id,
        kind: 'product',
        product_id: productId,
      },
      limit: 1,
    });
    if (existing?.length) return res.status(200).json({ ok: true });

    await insert('customer_favorites', {
      customer_id: req.customer.id,
      project_ref: product.project_ref,
      kind: 'product',
      shop_id: product.shop_id || null,
      product_id: productId,
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function removeFavoriteProduct(req, res, next) {
  try {
    const { productId } = req.params;
    await remove('customer_favorites', {
      customer_id: req.customer.id,
      kind: 'product',
      product_id: productId,
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFavorites,
  addFavoriteShop,
  removeFavoriteShop,
  addFavoriteProduct,
  removeFavoriteProduct,
};
