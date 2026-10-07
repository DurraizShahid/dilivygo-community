'use strict';

const { z } = require('zod');

const geoPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()).min(2).max(3))).min(1),
}).optional().nullable();

const timeRangeSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/, 'Use HH:MM or HH:MM:SS 24h format'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/, 'Use HH:MM or HH:MM:SS 24h format'),
});

const operatingHoursSchema = z.object({
  sun: z.array(timeRangeSchema).optional(),
  mon: z.array(timeRangeSchema).optional(),
  tue: z.array(timeRangeSchema).optional(),
  wed: z.array(timeRangeSchema).optional(),
  thu: z.array(timeRangeSchema).optional(),
  fri: z.array(timeRangeSchema).optional(),
  sat: z.array(timeRangeSchema).optional(),
}).optional().nullable();

const optionalImageUrl = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.string().url().max(2048), z.null()]).optional()
);

const createShopSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: optionalImageUrl,
  bannerUrl: optionalImageUrl,
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  deliveryGeofence: geoPolygonSchema,
  isActive: z.boolean().optional(),
  operatingHours: operatingHoursSchema,
  timezone: z.string().min(1).max(100).optional(),
  currency: z.string().trim().regex(/^[a-z]{3}$/).max(3).optional().nullable(),
  browseCategoryIds: z.array(z.string().max(40)).max(30).optional(),
});

const updateShopSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: optionalImageUrl,
  bannerUrl: optionalImageUrl,
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  deliveryGeofence: geoPolygonSchema,
  isActive: z.boolean().optional(),
  operatingHours: operatingHoursSchema,
  timezone: z.string().min(1).max(100).optional(),
  currency: z.string().trim().regex(/^[a-z]{3}$/).max(3).optional().nullable(),
  browseCategoryIds: z.array(z.string().max(40)).max(30).optional(),
});

const assignUserSchema = z.object({
  userId: z.string().uuid(),
});

module.exports = {
  createShopSchema,
  updateShopSchema,
  assignUserSchema,
  geoPolygonSchema,
  optionalImageUrl,
};
