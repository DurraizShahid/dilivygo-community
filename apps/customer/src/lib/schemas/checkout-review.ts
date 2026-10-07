import { z } from "zod";

export const checkoutReviewSchema = z
  .object({
    address: z.string().trim().min(1, "Please enter a delivery address."),
    deliveryNotes: z.string().max(500, "Notes are too long.").default(""),
    scheduleMode: z.enum(["now", "later"]),
    scheduledDate: z.string().default(""),
    scheduledTime: z.string().default(""),
    promoCode: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleMode !== "later") return;
    if (!data.scheduledDate.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a delivery date.",
        path: ["scheduledDate"],
      });
    }
    if (!data.scheduledTime.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a delivery time.",
        path: ["scheduledTime"],
      });
    }
  });

export type CheckoutReviewInput = z.infer<typeof checkoutReviewSchema>;

export const emptyCheckoutReview: CheckoutReviewInput = {
  address: "",
  deliveryNotes: "",
  scheduleMode: "now",
  scheduledDate: "",
  scheduledTime: "",
  promoCode: "",
};
