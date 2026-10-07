'use strict';

const { z } = require('zod');

const addItemSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().positive(),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(0),
});

const mergeCartSchema = z.object({
  guestSessionId: z.string().min(1),
});

const selectedModifierSchema = z.object({
  groupName: z.string().min(1),
  optionName: z.string().min(1),
  priceCents: z.number().int().min(0),
  modifierOptionId: z.string().uuid().optional(),
});

const syncLineSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid().optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().min(0),
    notes: z.string().max(2000).optional(),
    selectedModifiers: z.array(selectedModifierSchema).max(40).optional(),
    shopId: z.string().uuid().optional(),
    sessionId: z.string().max(64).optional(),
    shopName: z.string().max(200).optional(),
    projectRef: z.string().max(128).optional(),
    createdAt: z.string().max(64).optional(),
  })
  .passthrough();

const syncCartSchema = z.object({
  items: z.array(syncLineSchema).max(120),
  shopId: z.string().uuid().nullable().optional(),
  currency: z.string().max(16).nullable().optional(),
});

module.exports = {
  addItemSchema,
  updateItemSchema,
  mergeCartSchema,
  syncCartSchema,
};
