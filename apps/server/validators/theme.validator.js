'use strict';

/**
 * Community Edition: theme/map/delivery-fee validation schemas.
 *
 * Extracted from the commercial superadmin validator — these three schemas
 * validate workspace theme overlays merged by lib/workspace-public-theme-merge.
 * They contain no commercial logic; they are pure zod shapes.
 */

const { z } = require('zod');
const { isSafeCssColorValue } = require('../lib/platform-theme');

const optionalThemeColor = z
  .string()
  .trim()
  .max(120)
  .optional()
  .nullable()
  .refine(
    (val) => val == null || val === '' || isSafeCssColorValue(val),
    { message: 'Invalid CSS color' },
  );

const themeColorsPartialSchema = z
  .object({
    primary: optionalThemeColor,
    primaryForeground: optionalThemeColor,
    secondary: optionalThemeColor,
    secondaryForeground: optionalThemeColor,
    accent: optionalThemeColor,
    accentForeground: optionalThemeColor,
    background: optionalThemeColor,
    foreground: optionalThemeColor,
    muted: optionalThemeColor,
    mutedForeground: optionalThemeColor,
    destructive: optionalThemeColor,
    card: optionalThemeColor,
    cardForeground: optionalThemeColor,
    border: optionalThemeColor,
  })
  .strict();

const updateMapSettingsSchema = z.object({
  tilePreset: z.string().max(60).optional(),
  customTileUrl: z.string().max(500).optional().nullable(),
  darkTilePreset: z.string().max(60).optional().nullable(),
  customDarkTileUrl: z.string().max(500).optional().nullable(),
  riderMarkerColor: z.string().max(30).optional(),
  shopMarkerColor: z.string().max(30).optional(),
  customerMarkerColor: z.string().max(30).optional(),
  showZoomControls: z.boolean().optional(),
  showAttribution: z.boolean().optional(),
  defaultZoom: z.number().int().min(1).max(20).optional(),
});

const deliveryFeeTierSchema = z.object({
  upToCents: z.number().int().min(0).nullable(),
  feeCents: z.number().int().min(0),
});

const updateDeliveryFeeConfigSchema = z.object({
  type: z.enum(['flat', 'tiered']).optional(),
  flatFeeCents: z.number().int().min(0).optional(),
  freeDeliveryThresholdCents: z.number().int().min(0).optional(),
  tiers: z.array(deliveryFeeTierSchema).max(20).optional(),
});

module.exports = {
  themeColorsPartialSchema,
  updateMapSettingsSchema,
  updateDeliveryFeeConfigSchema,
};
