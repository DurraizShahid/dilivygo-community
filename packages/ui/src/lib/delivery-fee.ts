import type { DeliveryFeeConfig } from "@dilivygo/types";

const DEFAULT_FEE_CENTS = 250;

/**
 * Compute the delivery fee in cents from the platform config and order subtotal.
 * Returns 0 when the subtotal exceeds the free-delivery threshold (if set).
 */
export function computeDeliveryFee(
  config: DeliveryFeeConfig | undefined | null,
  subtotalCents: number,
): number {
  if (!config) return DEFAULT_FEE_CENTS;

  if (
    config.freeDeliveryThresholdCents > 0 &&
    subtotalCents >= config.freeDeliveryThresholdCents
  ) {
    return 0;
  }

  if (config.type === "tiered" && config.tiers?.length) {
    for (const tier of config.tiers) {
      if (tier.upToCents == null || subtotalCents <= tier.upToCents) {
        return tier.feeCents;
      }
    }
    const last = config.tiers[config.tiers.length - 1];
    return last.feeCents;
  }

  return config.flatFeeCents ?? DEFAULT_FEE_CENTS;
}
