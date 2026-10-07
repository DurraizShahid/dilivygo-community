import { z } from "zod";

export const deliveryModes = ["third_party", "vendor_rider"] as const;

export const vendorSettingsSchema = z
  .object({
    autoAccept: z.boolean(),
    defaultPrepTimeMinutes: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be a whole number")
      .min(1, "At least 1 minute")
      .max(120, "At most 120 minutes"),
    deliveryMode: z.enum(deliveryModes),
    autoDispatchDelayMinutes: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(60, "At most 60 minutes"),
    minimumOrderCents: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    cutleryOffered: z.boolean(),
    cutleryFeeCents: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(100000, "Too high"),
  })
  .superRefine((values, ctx) => {
    if (values.cutleryOffered && values.cutleryFeeCents > 5000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cutleryFeeCents"],
        message: "Cutlery fee seems too high — keep it under 50.00",
      });
    }
  });

export type VendorSettingsInput = z.infer<typeof vendorSettingsSchema>;

export const adminWorkspaceSettingsSchema = z.object({
  avgDeliveryTimeMinutes: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Must be a whole number")
    .min(1, "At least 1 minute")
    .max(120, "At most 120 minutes"),
  autoDispatchDelayMinutes: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(60, "At most 60 minutes"),
  maxSearchRadiusKm: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0.5, "At least 0.5 km")
    .max(100, "At most 100 km"),
});

export type AdminWorkspaceSettingsInput = z.infer<typeof adminWorkspaceSettingsSchema>;
