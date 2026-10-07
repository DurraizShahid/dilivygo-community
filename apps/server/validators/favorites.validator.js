'use strict';

const { z } = require('zod');

const favoriteShopParamsSchema = z.object({
  shopId: z.string().uuid(),
});

const favoriteProductParamsSchema = z.object({
  productId: z.string().uuid(),
});

module.exports = {
  favoriteShopParamsSchema,
  favoriteProductParamsSchema,
};
