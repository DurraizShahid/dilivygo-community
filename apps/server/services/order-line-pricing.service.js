'use strict';

const productModel = require('../models/product.model');
const productVariantModel = require('../models/product-variant.model');
const modifierModel = require('../models/modifier.model');
const { isTrustedCheckoutLine } = require('../lib/trusted-checkout-snapshot');

function optionIndexForProduct(groups) {
  /** @type {Map<string, { priceCents: number, productId: string }>} */
  const byId = new Map();
  for (const g of groups || []) {
    const pid = g.product_id ?? g.productId;
    for (const o of g.options || []) {
      const id = o.id;
      if (!id) continue;
      byId.set(String(id), {
        priceCents: Number(o.price_cents ?? o.priceCents ?? 0),
        productId: String(pid),
      });
    }
  }
  return byId;
}

function findOptionPriceByName(groups, groupName, optionName) {
  const gn = String(groupName || '').trim().toLowerCase();
  const on = String(optionName || '').trim().toLowerCase();
  for (const g of groups || []) {
    if (String(g.name || '').trim().toLowerCase() !== gn) continue;
    for (const o of g.options || []) {
      if (String(o.name || '').trim().toLowerCase() === on) {
        return Number(o.price_cents ?? o.priceCents ?? 0);
      }
    }
  }
  return null;
}

/**
 * Ensures each catalog line's unit price matches product + optional variant +
 * modifiers from DB before payment.
 *
 * A line loaded from the server-owned durable checkout batch carries a
 * non-serializable Symbol marker. Those lines were already validated before the
 * PaymentIntent was created, so post-payment fulfillment must honor that exact
 * charged snapshot rather than fail because a restaurant changed the live menu
 * seconds later. JSON clients cannot forge the Symbol marker.
 *
 * @param {{ shopId: string, projectRef: string, items: object[], allowUnavailable?: boolean }} args
 */
async function assertOrderItemsPricedForShop({ shopId, projectRef, items, allowUnavailable = false }) {
  if (!items?.length) return;

  const catalogItems = items.filter((i) => i?.productId);
  if (catalogItems.length && catalogItems.every(isTrustedCheckoutLine)) {
    return;
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return;

  const products = await Promise.all(productIds.map((id) => productModel.get(shopId, id)));
  const productById = {};
  for (const p of products) {
    if (!p) {
      const err = new Error('One or more products are not available for this shop.');
      err.statusCode = 400;
      throw err;
    }
    if (String(p.project_ref) !== String(projectRef)) {
      const err = new Error('Product workspace mismatch.');
      err.statusCode = 400;
      throw err;
    }
    productById[p.id] = p;
  }

  const variantsByProduct = await productVariantModel.listByProductIds(productIds);
  const groupsByProduct = await modifierModel.listGroupsByProducts(productIds);

  for (const item of items) {
    if (!item.productId) continue;
    const pid = String(item.productId);
    const product = productById[pid];
    if (!product) {
      const err = new Error('Invalid product on order line');
      err.statusCode = 400;
      throw err;
    }
    if (product.available === false && !allowUnavailable) {
      const err = new Error(`Product unavailable: ${product.name || pid}`);
      err.statusCode = 400;
      throw err;
    }

    const variants = variantsByProduct[pid] || [];
    const hasVariants = variants.length > 0;
    let base = Number(product.price_cents ?? product.priceCents ?? 0);
    const variantId = item.productVariantId || item.product_variant_id;

    if (hasVariants) {
      if (!variantId) {
        const err = new Error('This product requires a variant selection.');
        err.statusCode = 400;
        throw err;
      }
      const v = variants.find((x) => String(x.id) === String(variantId));
      if (!v) {
        const err = new Error('Invalid product variant.');
        err.statusCode = 400;
        throw err;
      }
      if (!v.available && !allowUnavailable) {
        const err = new Error('Selected variant is not available.');
        err.statusCode = 400;
        throw err;
      }
      const stock = v.stock_quantity ?? v.stockQuantity;
      if (
        !allowUnavailable &&
        stock != null &&
        Number(stock) >= 0 &&
        item.quantity > Number(stock)
      ) {
        const err = new Error('Insufficient stock for a selected variant.');
        err.statusCode = 400;
        throw err;
      }
      base = Number(v.price_cents ?? v.priceCents ?? 0);
    } else if (variantId) {
      const err = new Error('This product does not use variants.');
      err.statusCode = 400;
      throw err;
    }

    const groups = groupsByProduct[pid] || [];
    const optById = optionIndexForProduct(groups);
    let modSum = 0;
    const mods = item.modifiers || [];
    for (const m of mods) {
      const oid = m.modifierOptionId || m.modifier_option_id;
      if (oid) {
        const row = optById.get(String(oid));
        if (!row || row.productId !== pid) {
          const err = new Error('Invalid modifier selection.');
          err.statusCode = 400;
          throw err;
        }
        modSum += row.priceCents;
      } else {
        const pFromName = findOptionPriceByName(groups, m.groupName, m.optionName);
        if (pFromName == null) {
          const err = new Error('Invalid modifier selection.');
          err.statusCode = 400;
          throw err;
        }
        modSum += pFromName;
      }
    }

    const expectedUnit = base + modSum;
    const clientUnit = Number(item.unitPriceCents ?? item.unit_price_cents ?? 0);
    if (!Number.isFinite(clientUnit) || clientUnit !== expectedUnit) {
      const err = new Error('Line item price does not match the current menu.');
      err.statusCode = 400;
      throw err;
    }
  }
}

module.exports = { assertOrderItemsPricedForShop, optionIndexForProduct };
