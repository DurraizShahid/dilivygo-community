'use strict';

const { z } = require('zod');

const createRatingSchema = z.object({
  orderId: z.string().uuid(),
  toUserId: z.string(),
  toRole: z.enum(['vendor', 'rider']),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

module.exports = { createRatingSchema };
