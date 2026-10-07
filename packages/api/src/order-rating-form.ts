/**
 * Shared rules for customer order rating forms (shop review + rider rating + tip).
 * Shop reviews are tied to `shopId` on the order, not legacy `vendorId`.
 */
export type OrderRatingFormState = {
  shopId?: string | null;
  existingShopReview: boolean;
  vendorRating: number;
  riderId?: string | null;
  riderRating: number;
  tipCents: number;
};

export function canSubmitOrderRating(s: OrderRatingFormState): boolean {
  const shopNeeded = Boolean(s.shopId && !s.existingShopReview);
  const riderPresent = Boolean(s.riderId);
  const shopSatisfied = !shopNeeded || s.vendorRating > 0;
  const riderSatisfied = !riderPresent || s.riderRating > 0;
  const hasSomethingToSubmit =
    (shopNeeded && s.vendorRating > 0) ||
    (riderPresent && s.riderRating > 0) ||
    (riderPresent && s.tipCents > 0);
  return shopSatisfied && riderSatisfied && hasSomethingToSubmit;
}
