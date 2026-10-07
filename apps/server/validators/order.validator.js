'use strict';

const { z } = require('zod');

const selectedModifierSchema = z.object({
  modifierOptionId: z.string().uuid().optional(),
  groupName: z.string().min(1),
  optionName: z.string().min(1),
  priceCents: z.number().int().min(0).default(0),
});

const orderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  productVariantId: z.string().uuid().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  modifiers: z.array(selectedModifierSchema).max(50).optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
  totalCents: z.number().int().positive(),
  paymentIntentId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  customerId: z.string().uuid().optional(),
});

const posCheckoutSchema = z.object({
  shopId: z.string().uuid(),
  items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
  totalCents: z.number().int().positive().optional(),
  paymentMethod: z.enum(['cash', 'card', 'split']).default('cash'),
  note: z.string().max(500).optional(),
  // quick = walk-in sale (completed immediately); kitchen = prep queue (no rider dispatch).
  checkoutMode: z.enum(['quick', 'kitchen']).default('quick'),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'placed', 'accepted', 'rejected', 'preparing', 'ready',
    'assigned', 'picked_up', 'arrived', 'completed', 'cancelled', 'scheduled',
  ]),
});

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

const acceptSchema = z.object({
  prepTimeMinutes: z.number().int().min(5).max(120).optional(),
});

const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
  initiator: z.enum(['customer', 'vendor', 'admin']).optional(),
});

const listOrdersSchema = z.object({
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
  shopId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const extendSlaSchema = z.object({
  additionalMinutes: z.number().int().min(5).max(60).optional(),
});

const analyticsQuerySchema = z.object({
  rangeDays: z.coerce.number().int().refine((v) => [7, 14, 30, 90].includes(v)).optional(),
  shopId: z.string().uuid().optional(),
});

const reorderSchema = z.object({
  clearExisting: z.boolean().optional(),
});

const createRefundRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(2000),
  requestedAmountCents: z.number().int().positive().optional(),
  conversationId: z.string().uuid().optional(),
});

module.exports = {
  orderItemSchema,
  createOrderSchema,
  posCheckoutSchema,
  updateStatusSchema,
  refundSchema,
  cancelSchema,
  listOrdersSchema,
  rejectSchema,
  acceptSchema,
  extendSlaSchema,
  analyticsQuerySchema,
  reorderSchema,
  createRefundRequestSchema,
};
