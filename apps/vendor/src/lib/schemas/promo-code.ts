import { z } from "zod";

export const promoCodeTypes = ["percentage", "fixed_amount", "free_delivery"] as const;
export type PromoCodeTypeLiteral = (typeof promoCodeTypes)[number];

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .max(64, "Keep the code under 64 characters"),
    type: z.enum(promoCodeTypes),
    value: z
      .number({ invalid_type_error: "Enter a number" })
      .min(0, "Value cannot be negative"),
    minOrderCents: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be an integer")
      .min(0, "Cannot be negative"),
    maxDiscountCents: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be an integer")
      .min(0, "Cannot be negative")
      .nullable(),
    maxUses: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be an integer")
      .min(0, "Cannot be negative")
      .nullable(),
    maxUsesPerCustomer: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Must be an integer")
      .min(1, "Must be at least 1"),
    startsAt: z.string(),
    endsAt: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "percentage") {
      if (values.value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Percentage must be greater than 0",
        });
      }
      if (values.value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Percentage cannot exceed 100",
        });
      }
    }
    if (values.type === "fixed_amount" && values.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Amount must be greater than 0",
      });
    }
    if (values.startsAt && values.endsAt) {
      const start = new Date(values.startsAt).getTime();
      const end = new Date(values.endsAt).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsAt"],
          message: "End date must be after the start date",
        });
      }
    }
  });

export type PromoCodeInput = z.infer<typeof promoCodeSchema>;

export const emptyPromoCodeForm = (): PromoCodeInput => ({
  code: "",
  type: "percentage",
  value: 10,
  minOrderCents: 0,
  maxDiscountCents: null,
  maxUses: null,
  maxUsesPerCustomer: 1,
  startsAt: "",
  endsAt: "",
  isActive: true,
});
