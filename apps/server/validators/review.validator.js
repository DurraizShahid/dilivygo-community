'use strict';

const { z } = require('zod');

const createReviewSchema = z.object({
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const listShopReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const moderateReviewSchema = z.object({
  moderationStatus: z.enum(['visible', 'hidden']),
  moderationReason: z.string().max(500).optional().nullable(),
});

module.exports = {
  createReviewSchema,
  listShopReviewsQuerySchema,
  moderateReviewSchema,
};
