import { z } from "zod";

export function makeRefundRequestSchema(opts: {
  totalCents: number;
  reasonRequiredMessage: string;
  invalidPartialMessage: string;
}) {
  const { totalCents, reasonRequiredMessage, invalidPartialMessage } = opts;

  return z
    .object({
      reason: z.string().trim().min(1, reasonRequiredMessage),
      partialAmountInput: z.string().default(""),
    })
    .superRefine((data, ctx) => {
      const raw = data.partialAmountInput.trim();
      if (!raw.length) return;
      const n = Number.parseInt(raw, 10);
      if (Number.isNaN(n) || n <= 0 || n > totalCents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["partialAmountInput"],
          message: invalidPartialMessage,
        });
      }
    });
}

export type RefundRequestFormInput = {
  reason: string;
  partialAmountInput: string;
};

export const emptyRefundRequestForm = (): RefundRequestFormInput => ({
  reason: "",
  partialAmountInput: "",
});
