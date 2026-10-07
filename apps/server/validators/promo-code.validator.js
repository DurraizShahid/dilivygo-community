'use strict';

const { z } = require('zod');

const createPromoCodeSchema = z.object({
  code: z.string().min(2).max(40).transform((s) => s.toUpperCase()),
  type: z.enum(['percentage', 'fixed_amount', 'free_delivery']),
  value: z.number().int().min(0).default(0),
  minOrderCents: z.number().int().min(0).default(0),
  maxDiscountCents: z.number().int().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  maxUsesPerCustomer: z.number().int().min(1).default(1),
  startsAt: z.string().max(100).optional().nullable(),
  endsAt: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  shopId: z.string().uuid().optional().nullable(),
  projectRef: z.string().max(60).optional().nullable(),
});

const updatePromoCodeSchema = z.object({
  code: z.string().min(2).max(40).transform((s) => s.toUpperCase()).optional(),
  type: z.enum(['percentage', 'fixed_amount', 'free_delivery']).optional(),
  value: z.number().int().min(0).optional(),
  minOrderCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  maxUsesPerCustomer: z.number().int().min(1).optional(),
  startsAt: z.string().max(100).optional().nullable(),
  endsAt: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  shopId: z.string().uuid().optional().nullable(),
});

const validatePromoSchema = z.object({
  code: z.string().min(1).max(40),
  shopId: z.string().uuid().optional().nullable(),
  subtotalCents: z.number().int().min(0),
  deliveryFeeCents: z.number().int().min(0).optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[a-zA-Z]{3}$/)
    .transform((s) => s.toLowerCase())
    .optional(),
});

module.exports = {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  validatePromoSchema,
};
