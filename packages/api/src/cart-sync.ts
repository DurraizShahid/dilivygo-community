import type { CartItem } from "@dilivygo/types";

/**
 * Stable key for merging guest/local lines with server lines (login + multi-device).
 */
export function cartLineFingerprint(item: CartItem): string {
  const mods = (item.selectedModifiers ?? [])
    .map(
      (m) =>
        `${m.groupName}\0${m.optionName}\0${m.priceCents}\0${m.modifierOptionId ?? ""}`
    )
    .sort()
    .join("|");
  const notes = (item.notes ?? "").trim();
  return `${item.productId ?? ""}::${item.productVariantId ?? ""}::${item.shopId ?? ""}::${item.projectRef ?? ""}::${mods}::${notes}`;
}

/**
 * Merge remote (server) cart with local Zustand cart: matching lines sum quantities;
 * prefer server row id; fill display fields from local when missing on remote.
 */
export function mergeCartLinesForLogin(remote: CartItem[], local: CartItem[]): CartItem[] {
  const byFp = new Map<string, CartItem>();
  const byId = new Map<string, string>();
  for (const r of remote) {
    const fp = cartLineFingerprint(r);
    byFp.set(fp, { ...r });
    if (r.id) byId.set(r.id, fp);
  }
  for (const l of local) {
    const idMatchKey = l.id ? byId.get(l.id) : undefined;
    if (idMatchKey) {
      const existing = byFp.get(idMatchKey);
      if (existing) {
        const next = {
          ...existing,
          ...l,
          id: existing.id ?? l.id,
          quantity: l.quantity,
          shopName: l.shopName ?? existing.shopName,
          projectRef: l.projectRef ?? existing.projectRef,
        };
        const nextKey = cartLineFingerprint(next);
        if (nextKey !== idMatchKey) {
          byFp.delete(idMatchKey);
        }
        byFp.set(nextKey, next);
        if (next.id) byId.set(next.id, nextKey);
        continue;
      }
    }

    const k = cartLineFingerprint(l);
    const existing = byFp.get(k);
    if (existing) {
      const next = {
        ...existing,
        quantity: existing.quantity + l.quantity,
        shopName: existing.shopName ?? l.shopName,
        projectRef: existing.projectRef ?? l.projectRef,
      };
      byFp.set(k, next);
      if (next.id) byId.set(next.id, k);
    } else {
      byFp.set(k, l);
      if (l.id) byId.set(l.id, k);
    }
  }
  return Array.from(byFp.values());
}
