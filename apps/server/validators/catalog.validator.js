'use strict';

const { z } = require('zod');

/** Preset + custom shop tags; validated against vendor_settings in catalog controller. */
const dietaryTagCode = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/)
  .transform((s) => s.toLowerCase());
const dietaryTagsSchema = z
  .array(dietaryTagCode)
  .max(20)
  .transform((tags) => [...new Set(tags)]);

/** Trimmed product code; empty → null (max 64 for barcode / SKU columns). */
const productCodeSchema = z
  .string()
  .max(64)
  .optional()
  .nullable()
  .transform((s) => {
    if (s == null) return null;
    const t = s.trim();
    return t.length ? t : null;
  });

const productCodeUpdateSchema = z
  .union([z.string().max(64), z.null()])
  .optional()
  .transform((s) => {
    if (s === undefined) return undefined;
    if (s === null) return null;
    const t = s.trim();
    return t.length ? t : null;
  });

const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const createProductSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.number().int().min(0).max(10_000_00),
  category: z.string().min(1).max(80).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  barcode: productCodeSchema,
  sku: productCodeSchema,
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  dietaryTags: dietaryTagsSchema.optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  category: z.string().min(1).max(80).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  barcode: productCodeUpdateSchema,
  sku: productCodeUpdateSchema,
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  dietaryTags: dietaryTagsSchema.optional(),
});

/** Same fields as create product; trims blanks to null for category / image / description. */
const bulkProductItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z
    .string()
    .max(2000)
    .nullish()
    .transform((s) => {
      if (s == null) return null;
      const t = s.trim();
      return t.length ? t : null;
    }),
  priceCents: z.number().int().min(0).max(10_000_00),
  category: z
    .string()
    .max(80)
    .nullish()
    .transform((s) => {
      if (s == null) return null;
      const t = s.trim();
      return t.length ? t : null;
    }),
  imageUrl: z
    .string()
    .max(500)
    .nullish()
    .transform((s) => {
      if (s == null) return null;
      const t = s.trim();
      return t.length ? t : null;
    })
    .superRefine((val, ctx) => {
      if (val == null) return;
      try {
        const u = new URL(val);
        if (!/^https?:$/i.test(u.protocol)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid URL' });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid URL' });
      }
    }),
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  dietaryTags: dietaryTagsSchema.optional(),
  barcode: productCodeSchema,
  sku: productCodeSchema,
  /** Optional first variant to create after the product row (menu CSV import). */
  initialVariant: z
    .object({
      name: z.string().min(1).max(120),
      priceCents: z.number().int().min(0).max(10_000_00),
      sku: productCodeSchema,
      barcode: productCodeSchema,
      imageUrl: z
        .string()
        .max(500)
        .nullish()
        .transform((s) => {
          if (s == null) return null;
          const t = s.trim();
          return t.length ? t : null;
        })
        .superRefine((val, ctx) => {
          if (val == null) return;
          try {
            const u = new URL(val);
            if (!/^https?:$/i.test(u.protocol)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid URL' });
            }
          } catch {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid URL' });
          }
        }),
      available: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(10_000).optional(),
      stockQuantity: z.number().int().min(0).max(99_999_999).optional().nullable(),
    })
    .optional(),
});

const bulkCreateProductsSchema = z.object({
  items: z.array(bulkProductItemSchema).min(1).max(500),
});

const createModifierGroupSchema = z.object({
  name: z.string().min(1).max(120),
  required: z.boolean().optional(),
  minSelections: z.number().int().min(0).max(20).optional(),
  maxSelections: z.number().int().min(1).max(20).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const updateModifierGroupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  required: z.boolean().optional(),
  minSelections: z.number().int().min(0).max(20).optional(),
  maxSelections: z.number().int().min(1).max(20).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const createModifierOptionSchema = z.object({
  name: z.string().min(1).max(120),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const updateModifierOptionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const createProductVariantSchema = z.object({
  name: z.string().min(1).max(120),
  priceCents: z.number().int().min(0).max(10_000_00),
  imageUrl: z.string().url().max(500).optional().nullable(),
  barcode: productCodeSchema,
  sku: productCodeSchema,
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  stockQuantity: z.number().int().min(0).max(99_999_999).optional().nullable(),
});

const updateProductVariantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  barcode: productCodeUpdateSchema,
  sku: productCodeUpdateSchema,
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  stockQuantity: z.number().int().min(0).max(99_999_999).optional().nullable(),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  bulkCreateProductsSchema,
  createModifierGroupSchema,
  updateModifierGroupSchema,
  createModifierOptionSchema,
  updateModifierOptionSchema,
  createProductVariantSchema,
  updateProductVariantSchema,
};

