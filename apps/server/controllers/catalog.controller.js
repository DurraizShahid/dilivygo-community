'use strict';

const { SupabaseError } = require('../lib/supabase');
const categoryModel = require('../models/category.model');
const productModel = require('../models/product.model');
const modifierModel = require('../models/modifier.model');
const vendorSettingsModel = require('../models/vendor-settings.model');
const platformSettings = require('../models/platform-settings.model');
const {
  assertProductDietaryTagsAllowed,
  mergeBulkAutoCustomDietaryTags,
} = require('../lib/dietary-tags');
const { createError } = require('../middleware/error.middleware');
const { mapCategory, mapProduct, mapProductVariant, mapModifierGroup } = require('../lib/case');
const productVariantModel = require('../models/product-variant.model');
const { findProductOrVariantCodeConflict } = require('../lib/product-shop-codes');
const { sanitizeText } = require('../lib/sanitize');

/** @param {string} [bodyStr] */
function productCodeConflictFromBody(bodyStr) {
  if (!bodyStr || typeof bodyStr !== 'string') return null;
  let haystack = bodyStr.toLowerCase();
  try {
    const j = JSON.parse(bodyStr);
    if (j.code != null && String(j.code) !== '23505') return null;
    haystack = `${j.message || ''} ${j.details || ''} ${j.constraint || ''}`.toLowerCase();
  } catch {
    /* use haystack from raw body */
  }
  if (haystack.includes('products_shop_barcode')) return 'barcode';
  if (haystack.includes('products_shop_sku')) return 'sku';
  return null;
}

async function listCategories(req, res, next) {
  try {
    const rows = await categoryModel.list(req.shopId);
    return res.json({ categories: (rows || []).map(mapCategory) });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await categoryModel.createCategory(req.shopId, req.projectRef, req.body);
    return res.status(201).json({ category: mapCategory(category) });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await categoryModel.updateCategory(req.shopId, id, req.body);
    if (!updated) return next(createError('Category not found', 404));
    return res.json({ category: mapCategory(updated) });
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    await categoryModel.deleteCategory(req.shopId, id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function listProducts(req, res, next) {
  try {
    const includeUnavailable = req.query.includeUnavailable !== 'false';
    const rows = await productModel.list(req.shopId, { includeUnavailable });
    const products = (rows || []).map(mapProduct);

    const productIds = products.map((p) => p.id);
    const [modifiersByProduct, variantsByProduct] = await Promise.all([
      modifierModel.listGroupsByProducts(productIds),
      productVariantModel.listByProductIds(productIds),
    ]);
    for (const product of products) {
      product.modifierGroups = (modifiersByProduct[product.id] || []).map(mapModifierGroup);
      product.variants = (variantsByProduct[product.id] || []).map((r) => mapProductVariant(r));
    }

    return res.json({ products });
  } catch (err) {
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const tags = req.body.dietaryTags;
    if (tags?.length) {
      const [vs, platformRaw] = await Promise.all([
        vendorSettingsModel.findByShopId(req.shopId),
        platformSettings.get('dietary_tag_presets', { projectRef: req.projectRef }),
      ]);
      assertProductDietaryTagsAllowed(tags, vs?.custom_dietary_tags, [], platformRaw);
    }
    const codeConflict = await findProductOrVariantCodeConflict(req.shopId, {
      sku: req.body.sku,
      barcode: req.body.barcode,
    });
    if (codeConflict) {
      return res.status(409).json({
        error:
          codeConflict === 'barcode'
            ? 'Another product or variant in this shop already uses this barcode'
            : 'Another product or variant in this shop already uses this SKU',
      });
    }
    const product = await productModel.createProduct(req.shopId, req.projectRef, req.body);
    return res.status(201).json({ product: mapProduct(product) });
  } catch (err) {
    if (err instanceof SupabaseError) {
      const which = productCodeConflictFromBody(err.body);
      if (which) {
        return res.status(409).json({
          error: which === 'barcode'
            ? 'Another product in this shop already uses this barcode'
            : 'Another product in this shop already uses this SKU',
        });
      }
    }
    next(err);
  }
}

async function bulkCreateProducts(req, res, next) {
  try {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const items = rawItems.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const nextItem = { ...item };
      if (nextItem.initialVariant && typeof nextItem.initialVariant === 'object') {
        const iv = { ...nextItem.initialVariant };
        if (typeof iv.name === 'string') iv.name = sanitizeText(iv.name);
        nextItem.initialVariant = iv;
      }
      return nextItem;
    });
    const [vs, platformRaw, existingCategories] = await Promise.all([
      vendorSettingsModel.findByShopId(req.shopId),
      platformSettings.get('dietary_tag_presets', { projectRef: req.projectRef }),
      categoryModel.list(req.shopId),
    ]);

    const tagUnion = new Set();
    for (const item of items) {
      for (const t of item.dietaryTags || []) {
        if (typeof t === 'string' && t.trim()) tagUnion.add(t.trim().toLowerCase());
      }
    }

    let customForAssert = vs?.custom_dietary_tags;
    let dietaryTagsCreated = 0;
    if (tagUnion.size) {
      const { merged, added } = mergeBulkAutoCustomDietaryTags(
        vs?.custom_dietary_tags,
        platformRaw,
        tagUnion
      );
      dietaryTagsCreated = added.length;
      if (added.length) {
        await vendorSettingsModel.upsertByShopId(req.shopId, req.projectRef, {
          custom_dietary_tags: merged,
        });
        customForAssert = merged;
      }
      assertProductDietaryTagsAllowed([...tagUnion], customForAssert, [], platformRaw);
    }

    const existingNames = new Set((existingCategories || []).map((c) => c.name));
    let categoriesCreated = 0;
    const toCreate = new Set();
    for (const item of items) {
      const cat = item.category;
      if (cat && !existingNames.has(cat)) toCreate.add(cat);
    }
    let sortBase = (existingCategories || []).reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    for (const name of toCreate) {
      sortBase += 1;
      await categoryModel.createCategory(req.shopId, req.projectRef, { name, sortOrder: sortBase });
      existingNames.add(name);
      categoriesCreated += 1;
    }

    const rows = await productModel.createProducts(req.shopId, req.projectRef, items);
    let variantsCreated = 0;
    for (let i = 0; i < items.length; i += 1) {
      const iv = items[i].initialVariant;
      if (!iv) continue;
      const productId = rows[i]?.id;
      if (!productId) continue;
      const codeConflict = await findProductOrVariantCodeConflict(req.shopId, {
        sku: iv.sku,
        barcode: iv.barcode,
      });
      if (codeConflict) {
        return res.status(409).json({
          error:
            codeConflict === 'barcode'
              ? 'Another product or variant in this shop already uses this barcode (check import rows and variant columns)'
              : 'Another product or variant in this shop already uses this SKU (check import rows and variant columns)',
        });
      }
      await productVariantModel.create(req.shopId, productId, iv);
      variantsCreated += 1;
    }

    const products = (rows || []).map(mapProduct);
    const createdIds = products.map((p) => p.id);
    if (createdIds.length) {
      const variantsByProduct = await productVariantModel.listByProductIds(createdIds);
      for (const product of products) {
        product.variants = (variantsByProduct[product.id] || []).map((r) => mapProductVariant(r));
      }
    }

    return res.status(201).json({
      created: products.length,
      categoriesCreated,
      dietaryTagsCreated,
      variantsCreated,
      products,
    });
  } catch (err) {
    if (err instanceof SupabaseError) {
      const which = productCodeConflictFromBody(err.body);
      if (which) {
        return res.status(409).json({
          error: which === 'barcode'
            ? 'Another product in this shop already uses this barcode (check import rows)'
            : 'Another product in this shop already uses this SKU (check import rows)',
        });
      }
    }
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await productModel.get(req.shopId, id);
    if (!existing) return next(createError('Product not found', 404));
    if (req.body.dietaryTags !== undefined) {
      const [vs, platformRaw] = await Promise.all([
        vendorSettingsModel.findByShopId(req.shopId),
        platformSettings.get('dietary_tag_presets', { projectRef: req.projectRef }),
      ]);
      const existingTags = mapProduct(existing).dietaryTags || [];
      assertProductDietaryTagsAllowed(req.body.dietaryTags, vs?.custom_dietary_tags, existingTags, platformRaw);
    }
    if (req.body.sku !== undefined || req.body.barcode !== undefined) {
      const mapped = mapProduct(existing);
      const codeConflict = await findProductOrVariantCodeConflict(req.shopId, {
        sku: req.body.sku !== undefined ? req.body.sku : mapped.sku,
        barcode: req.body.barcode !== undefined ? req.body.barcode : mapped.barcode,
        excludeProductId: id,
      });
      if (codeConflict) {
        return res.status(409).json({
          error:
            codeConflict === 'barcode'
              ? 'Another product or variant in this shop already uses this barcode'
              : 'Another product or variant in this shop already uses this SKU',
        });
      }
    }
    const updated = await productModel.updateProduct(req.shopId, id, req.body);
    return res.json({ product: mapProduct(updated) });
  } catch (err) {
    if (err instanceof SupabaseError) {
      const which = productCodeConflictFromBody(err.body);
      if (which) {
        return res.status(409).json({
          error: which === 'barcode'
            ? 'Another product in this shop already uses this barcode'
            : 'Another product in this shop already uses this SKU',
        });
      }
    }
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    await productModel.deleteProduct(req.shopId, id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Product variants ─────────────────────────────────────────────────────────

async function listProductVariants(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await productModel.get(req.shopId, productId);
    if (!product) return next(createError('Product not found', 404));
    const rows = await productVariantModel.listForProduct(req.shopId, productId);
    return res.json({ variants: (rows || []).map((r) => mapProductVariant(r)) });
  } catch (err) {
    next(err);
  }
}

async function createProductVariant(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await productModel.get(req.shopId, productId);
    if (!product) return next(createError('Product not found', 404));
    const codeConflict = await findProductOrVariantCodeConflict(req.shopId, {
      sku: req.body.sku,
      barcode: req.body.barcode,
    });
    if (codeConflict) {
      return res.status(409).json({
        error:
          codeConflict === 'barcode'
            ? 'Another product or variant in this shop already uses this barcode'
            : 'Another product or variant in this shop already uses this SKU',
      });
    }
    const row = await productVariantModel.create(req.shopId, productId, req.body);
    return res.status(201).json({ variant: mapProductVariant(row) });
  } catch (err) {
    next(err);
  }
}

async function updateProductVariant(req, res, next) {
  try {
    const { variantId } = req.params;
    const existing = await productVariantModel.getWithProduct(req.shopId, variantId);
    if (!existing) return next(createError('Variant not found', 404));
    if (req.body.sku !== undefined || req.body.barcode !== undefined) {
      const mapped = mapProductVariant(existing);
      const codeConflict = await findProductOrVariantCodeConflict(req.shopId, {
        sku: req.body.sku !== undefined ? req.body.sku : mapped.sku,
        barcode: req.body.barcode !== undefined ? req.body.barcode : mapped.barcode,
        excludeVariantId: variantId,
      });
      if (codeConflict) {
        return res.status(409).json({
          error:
            codeConflict === 'barcode'
              ? 'Another product or variant in this shop already uses this barcode'
              : 'Another product or variant in this shop already uses this SKU',
        });
      }
    }
    const updated = await productVariantModel.update(req.shopId, variantId, req.body);
    if (!updated) return next(createError('Variant not found', 404));
    return res.json({ variant: mapProductVariant(updated) });
  } catch (err) {
    next(err);
  }
}

async function deleteProductVariant(req, res, next) {
  try {
    const { variantId } = req.params;
    const ok = await productVariantModel.delete(req.shopId, variantId);
    if (!ok) return next(createError('Variant not found', 404));
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Modifier Groups ─────────────────────────────────────────────────────────

async function listModifierGroups(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await productModel.get(req.shopId, productId);
    if (!product) return next(createError('Product not found', 404));
    const groups = await modifierModel.listGroupsByProduct(productId);
    return res.json({ modifierGroups: (groups || []).map(mapModifierGroup) });
  } catch (err) {
    next(err);
  }
}

async function createModifierGroup(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await productModel.get(req.shopId, productId);
    if (!product) return next(createError('Product not found', 404));
    const group = await modifierModel.createGroup(productId, req.body);
    const full = await modifierModel.listGroupsByProduct(productId);
    const created = full.find((g) => g.id === group.id) || group;
    return res.status(201).json({ modifierGroup: mapModifierGroup({ ...created, options: created.options || [] }) });
  } catch (err) {
    next(err);
  }
}

async function updateModifierGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await modifierModel.getGroupWithProduct(groupId);
    if (!group) return next(createError('Modifier group not found', 404));
    const product = await productModel.get(req.shopId, group.product_id);
    if (!product) return next(createError('Access denied', 403));
    const updated = await modifierModel.updateGroup(groupId, req.body);
    return res.json({ modifierGroup: mapModifierGroup({ ...updated, options: [] }) });
  } catch (err) {
    next(err);
  }
}

async function deleteModifierGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await modifierModel.getGroupWithProduct(groupId);
    if (!group) return next(createError('Modifier group not found', 404));
    const product = await productModel.get(req.shopId, group.product_id);
    if (!product) return next(createError('Access denied', 403));
    await modifierModel.deleteGroup(groupId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Modifier Options ────────────────────────────────────────────────────────

async function createModifierOption(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await modifierModel.getGroupWithProduct(groupId);
    if (!group) return next(createError('Modifier group not found', 404));
    const product = await productModel.get(req.shopId, group.product_id);
    if (!product) return next(createError('Access denied', 403));
    const option = await modifierModel.createOption(groupId, req.body);
    return res.status(201).json({ modifierOption: mapModifierOption(option) });
  } catch (err) {
    next(err);
  }
}

async function updateModifierOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const option = await modifierModel.getOption(optionId);
    if (!option) return next(createError('Modifier option not found', 404));
    const group = await modifierModel.getGroupWithProduct(option.group_id);
    if (!group) return next(createError('Modifier group not found', 404));
    const product = await productModel.get(req.shopId, group.product_id);
    if (!product) return next(createError('Access denied', 403));
    const updated = await modifierModel.updateOption(optionId, req.body);
    return res.json({ modifierOption: mapModifierOption(updated) });
  } catch (err) {
    next(err);
  }
}

async function deleteModifierOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const option = await modifierModel.getOption(optionId);
    if (!option) return next(createError('Modifier option not found', 404));
    const group = await modifierModel.getGroupWithProduct(option.group_id);
    if (!group) return next(createError('Modifier group not found', 404));
    const product = await productModel.get(req.shopId, group.product_id);
    if (!product) return next(createError('Access denied', 403));
    await modifierModel.deleteOption(optionId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

function mapModifierOption(row) {
  if (!row) return row;
  return {
    id: row.id,
    groupId: row.group_id ?? row.groupId,
    name: row.name,
    priceCents: row.price_cents ?? row.priceCents ?? 0,
    isDefault: row.is_default ?? row.isDefault ?? false,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    createdAt: row.created_at ?? row.createdAt,
  };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  createProduct,
  bulkCreateProducts,
  updateProduct,
  deleteProduct,
  listProductVariants,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  listModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  createModifierOption,
  updateModifierOption,
  deleteModifierOption,
};
