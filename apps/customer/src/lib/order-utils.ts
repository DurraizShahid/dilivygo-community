import type { Order, OrderItem } from "@dilivygo/types";
import { normalizeOrder as normalizeOrderFromApi } from "@dilivygo/api";
import type { useCartStore } from "@/stores/cart-store";

export const normalizeOrder = normalizeOrderFromApi;

type CartActions = Pick<
  ReturnType<typeof useCartStore.getState>,
  "addItem" | "clear" | "setProjectRef" | "setShopId" | "setCurrency"
>;

export function addOrderItemsToCart(order: Order, cart: CartActions): number {
  const items = order.items ?? [];
  if (!items.length) return 0;

  cart.setProjectRef(order.projectRef);
  if (order.shopId) cart.setShopId(order.shopId);
  if (order.currency) cart.setCurrency(order.currency.toUpperCase());

  let added = 0;
  for (const item of items) {
    if (!item.name || item.quantity <= 0 || item.unitPriceCents <= 0) continue;
    cart.addItem({
      id: crypto.randomUUID(),
      sessionId: "",
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      createdAt: new Date().toISOString(),
      ...(order.shopId ? { shopId: order.shopId } : {}),
      projectRef: order.projectRef,
      ...(order.shop?.name ? { shopName: order.shop.name } : {}),
    });
    added += 1;
  }
  return added;
}
