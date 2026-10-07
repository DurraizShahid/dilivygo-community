'use strict';

const { z } = require('zod');
const { PRESET_DIETARY_CODES, MAX_VENDOR_CUSTOM_DIETARY_TAGS } = require('../lib/dietary-tags');

const customDietaryTagRow = z.object({
  code: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z][a-z0-9_]*$/i)
    .transform((s) => s.toLowerCase().trim()),
  label: z.string().min(1).max(80).trim(),
});

const customDietaryTagsSchema = z
  .array(customDietaryTagRow)
  .max(MAX_VENDOR_CUSTOM_DIETARY_TAGS)
  .superRefine((rows, ctx) => {
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (PRESET_DIETARY_CODES.has(r.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Code "${r.code}" is reserved for a built-in tag`,
          path: [i, 'code'],
        });
      }
      if (seen.has(r.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate tag code',
          path: [i, 'code'],
        });
      }
      seen.add(r.code);
    }
  });

const updateSettingsSchema = z.object({
  autoAccept: z.boolean().optional(),
  defaultPrepTimeMinutes: z.number().int().min(5).max(120).optional(),
  deliveryMode: z.enum(['third_party', 'vendor_rider']).optional(),
  autoDispatchDelayMinutes: z.number().int().min(0).max(60).optional(),
  minimumOrderCents: z.number().int().min(0).max(100_000).optional(),
  cutleryOffered: z.boolean().optional(),
  cutleryFeeCents: z.number().int().min(0).max(100_000).optional(),
  customDietaryTags: customDietaryTagsSchema.optional(),
});

module.exports = { updateSettingsSchema };
