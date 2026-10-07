import type { CartItem } from "@dilivygo/types";

export type CheckoutDraftLine = {
  productId?: string;
  productVariantId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string;
  modifiers?: Array<{
    modifierOptionId?: string;
    groupName: string;
    optionName: string;
    priceCents?: number;
  }>;
};

export type CheckoutDraftGroup = {
  projectRef: string;
  shopId: string;
  items: CheckoutDraftLine[];
  subtotalCents: number;
  wantsCutlery?: boolean;
};

function lineSubtotalCents(item: CartItem): number {
  return item.quantity * item.unitPriceCents;
}

function serializeLine(item: CartItem): CheckoutDraftLine {
  const line: CheckoutDraftLine = {
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    ...(item.productVariantId ? { productVariantId: item.productVariantId } : {}),
    ...(item.notes ? { notes: item.notes } : {}),
  };
  if (item.selectedModifiers?.length) {
    line.modifiers = item.selectedModifiers.map((m) => ({
      modifierOptionId: m.modifierOptionId,
      groupName: m.groupName,
      optionName: m.optionName,
      priceCents: m.priceCents,
    }));
  }
  return line;
}

/**
 * Group cart lines by shop for multi-shop checkout. Uses per-line `shopId` / `projectRef`,
 * falling back to cart-level context for legacy single-shop lines.
 */
export function buildCheckoutDraftGroups(
  items: CartItem[],
  fallback: { shopId: string | null; projectRef: string | null },
): CheckoutDraftGroup[] {
  type Bucket = { projectRef: string; shopId: string; lines: CartItem[] };
  const buckets = new Map<string, Bucket>();

  for (const item of items) {
    const shopId = item.shopId ?? fallback.shopId;
    const projectRef = item.projectRef ?? fallback.projectRef;
    if (!shopId || !projectRef) {
      throw new Error("Cart is missing shop context for one or more items.");
    }
    const key = `${projectRef}::${shopId}`;
    let b = buckets.get(key);
    if (!b) {
      b = { projectRef, shopId, lines: [] };
      buckets.set(key, b);
    }
    b.lines.push(item);
  }

  return [...buckets.values()].map((b) => ({
    projectRef: b.projectRef,
    shopId: b.shopId,
    items: b.lines.map(serializeLine),
    subtotalCents: b.lines.reduce((s, li) => s + lineSubtotalCents(li), 0),
  }));
}

export function distinctShopCount(
  items: CartItem[],
  fallback: { shopId: string | null },
): number {
  const ids = new Set<string>();
  for (const item of items) {
    const sid = item.shopId ?? fallback.shopId;
    if (sid) ids.add(sid);
  }
  return ids.size;
}
