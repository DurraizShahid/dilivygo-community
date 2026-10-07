'use strict';

const { select } = require('./supabase');

function normCode(s) {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim();
  return t.length ? t.toLowerCase() : null;
}

/**
 * @param {string} shopId
 * @param {{ sku?: string|null, barcode?: string|null, excludeProductId?: string|null, excludeVariantId?: string|null }}
 * @returns {Promise<'sku'|'barcode'|null>} conflict type
 */
async function findProductOrVariantCodeConflict(shopId, { sku, barcode, excludeProductId, excludeVariantId }) {
  const skuN = normCode(sku);
  const bcN = normCode(barcode);
  if (!skuN && !bcN) return null;

  const products = await select('products', { filters: { shop_id: shopId } });
  const productIds = (products || []).map((p) => p.id);
  for (const p of products || []) {
    if (excludeProductId && p.id === excludeProductId) continue;
    if (skuN && normCode(p.sku) === skuN) return 'sku';
    if (bcN && normCode(p.barcode) === bcN) return 'barcode';
  }

  if (!productIds.length) return null;
  const variants = await select('product_variants', { filters: { product_id: productIds } });
  for (const v of variants || []) {
    if (excludeVariantId && v.id === excludeVariantId) continue;
    if (skuN && normCode(v.sku) === skuN) return 'sku';
    if (bcN && normCode(v.barcode) === bcN) return 'barcode';
  }

  return null;
}

module.exports = { findProductOrVariantCodeConflict, normCode };
