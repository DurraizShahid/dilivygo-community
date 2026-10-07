'use strict';

const { z } = require('zod');

const createAddressSchema = z.object({
  label: z.string().max(60).optional().nullable(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = z.object({
  label: z.string().max(60).optional().nullable(),
  addressLine1: z.string().min(1).max(500).optional(),
  addressLine2: z.string().max(500).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().optional(),
});

module.exports = {
  createAddressSchema,
  updateAddressSchema,
};
