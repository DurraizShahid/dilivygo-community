'use strict';

const { z } = require('zod');

const createTipSchema = z.object({
  orderId: z.string().uuid(),
  toRiderId: z.string(),
  amountCents: z.number().int().positive(),
});

module.exports = { createTipSchema };
