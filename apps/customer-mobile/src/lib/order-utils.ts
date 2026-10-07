import type { Order } from "@dilivygo/types";
import { useCartStore } from "@/stores/cart-store";

export function addOrderItemsToCart(order: Order): number {
  const items = order.items ?? [];
  if (!items.length) return 0;

  const {
    setProjectRef,
    setShopId,
    setCurrency,
    addItem,
  } = useCartStore.getState();

  setProjectRef(order.projectRef);
  if (order.shopId) setShopId(order.shopId);
  if (order.currency) setCurrency(order.currency.toUpperCase());

  let added = 0;
  for (const item of items) {
    if (!item.name || item.quantity <= 0 || item.unitPriceCents <= 0) continue;
    addItem({
      id: `local-${Date.now()}-${added}`,
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
