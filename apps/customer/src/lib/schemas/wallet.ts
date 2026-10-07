import { z } from "zod";

/**
 * Wallet top-up amount. The user types a decimal amount in the major
 * currency unit (e.g. "10.50" = 1050 cents). The server-side minimum
 * is 50 cents; we enforce that at submit time too.
 */
export const walletTopupSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount.")
    .refine((raw) => {
      const n = Number.parseFloat(raw.replace(",", "."));
      return Number.isFinite(n) && n > 0;
    }, "Enter a positive amount.")
    .refine((raw) => {
      const n = Number.parseFloat(raw.replace(",", "."));
      const cents = Math.round(n * 100);
      return cents >= 50;
    }, "Top-up must be at least 0.50."),
});

export type WalletTopupInput = z.infer<typeof walletTopupSchema>;

export function parseTopupAmountCents(raw: string): number {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
