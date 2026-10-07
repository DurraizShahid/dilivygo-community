'use strict';

const { z } = require('zod');
const { orderItemSchema } = require('./order.validator');

const checkoutGroupSchema = z.object({
  projectRef: z.string().min(1).max(80),
  shopId: z.string().uuid(),
  items: z.array(orderItemSchema).min(1),
  subtotalCents: z.number().int().nonnegative(),
  wantsCutlery: z.boolean().optional(),
});

const checkoutDraftSchema = z.object({
  groups: z.array(checkoutGroupSchema).min(1).max(30),
  deliveryFeeCents: z.number().int().min(0),
  address: z.string().min(1).max(2000),
  notes: z.string().max(2000).optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  promoCode: z.string().max(40).optional().nullable(),
});

const createIntentSchema = z
  .object({
    amountCents: z.number().int().min(0),
    walletAmountCents: z.number().int().min(0).optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[a-zA-Z]{3}$/)
      .transform((s) => s.toLowerCase())
      .optional(),
    metadata: z.record(z.string()).optional().default({}),
    checkoutDraft: checkoutDraftSchema.optional(),
  })
  .refine(
    (d) =>
      Boolean(d.checkoutDraft) ||
      d.amountCents > 0 ||
      (d.walletAmountCents != null && d.walletAmountCents > 0),
    { message: 'amountCents must be positive when not using checkoutDraft' },
  );

const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['web', 'ios', 'android']),
});

module.exports = { createIntentSchema, checkoutDraftSchema, pushTokenSchema };
