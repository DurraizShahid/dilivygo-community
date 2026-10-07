'use strict';

const { z } = require('zod');

const updateAdminSettingsSchema = z.object({
  avgDeliveryTimeMinutes: z.number().int().min(1).max(120).optional(),
  autoDispatchDelayMinutes: z.number().int().min(0).max(60).optional(),
  maxSearchRadiusKm: z.number().min(0.5).max(100).optional(),
});

module.exports = { updateAdminSettingsSchema };
