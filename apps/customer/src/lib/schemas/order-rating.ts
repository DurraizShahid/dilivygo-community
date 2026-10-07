import { z } from "zod";

/**
 * Order-rating form state. Uses the same cross-field rules that the
 * shared `canSubmitOrderRating` helper enforces, but surfaces individual
 * field errors where they make sense.
 *
 * Inputs:
 *  - `vendorRating`, `riderRating` are integers 0..5 (0 = unrated)
 *  - `customTipCentsInput` is a free-form decimal string entered by the user
 *    (empty string allowed). It's parsed at submit time.
 */

export const ratingValue = z.number().int().min(0).max(5);

export type OrderRatingFormInput = {
  vendorRating: number;
  riderRating: number;
  comment: string;
  tipCents: number | null;
  customTipCentsInput: string;
};

export function makeOrderRatingSchema(opts: {
  shopNeeded: boolean;
  hasRider: boolean;
}) {
  const { shopNeeded, hasRider } = opts;

  return z
    .object({
      vendorRating: ratingValue,
      riderRating: ratingValue,
      comment: z.string().max(2000, "Keep the comment under 2000 characters."),
      tipCents: z.number().int().min(0).nullable(),
      customTipCentsInput: z.string().default(""),
    })
    .superRefine((values, ctx) => {
      // If we show shop stars, they must be picked.
      if (shopNeeded && values.vendorRating <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vendorRating"],
          message: "Please pick a star rating for the restaurant.",
        });
      }

      // If rider present, rider rating is required (tip alone is not enough).
      if (hasRider && values.riderRating <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["riderRating"],
          message: "Please rate the rider.",
        });
      }

      // Custom tip string, when provided, must be a non-negative integer.
      const raw = values.customTipCentsInput.trim();
      if (raw.length > 0) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || !/^\d+$/.test(raw)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customTipCentsInput"],
            message: "Enter a positive whole number (in minor units).",
          });
        }
      }

      // At least one thing to submit: shop, rider, or tip.
      const tipCents = resolveTipCents(values);
      const hasSubmittable =
        (shopNeeded && values.vendorRating > 0) ||
        (hasRider && values.riderRating > 0) ||
        (hasRider && tipCents > 0);
      if (!hasSubmittable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vendorRating"],
          message: "Add a rating (and optional tip) before submitting.",
        });
      }
    });
}

export function resolveTipCents(values: OrderRatingFormInput): number {
  if (values.tipCents != null) return values.tipCents;
  const raw = values.customTipCentsInput.trim();
  if (raw.length === 0) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const emptyOrderRatingForm = (): OrderRatingFormInput => ({
  vendorRating: 0,
  riderRating: 0,
  comment: "",
  tipCents: null,
  customTipCentsInput: "",
});
