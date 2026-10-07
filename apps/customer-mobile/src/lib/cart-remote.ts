import { mergeCartLinesForLogin } from "@dilivygo/api";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { defaultWorkspaceRef } from "@/lib/workspace-ref";

export function cartProjectRefHeaders(projectRef: string): Record<string, string> {
  return { "x-project-ref": projectRef };
}

export function resolveCartSyncProjectRef(): string {
  const s = useCartStore.getState();
  const fromItems = s.items.find((i) => i.projectRef)?.projectRef;
  return s.projectRef || fromItems || defaultWorkspaceRef();
}

export async function hydrateCartFromServer(): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated) return;
  const projectRef = resolveCartSyncProjectRef();
  const headers = cartProjectRefHeaders(projectRef);
  const remote = await api.cart.get(headers);
  const localItems = useCartStore.getState().items;
  const merged = mergeCartLinesForLogin(remote.items ?? [], localItems);
  const { setItems, setShopId, setCurrency, setProjectRef } = useCartStore.getState();
  setItems(merged);
  if (remote.shopId) setShopId(remote.shopId);
  else if (merged[0]?.shopId) setShopId(merged[0].shopId);
  if (remote.currency) setCurrency(remote.currency);
  setProjectRef(remote.projectRef ?? projectRef);
  const after = useCartStore.getState();
  await api.cart.sync(
    {
      items: after.items,
      shopId: after.shopId,
      currency: after.currency,
    },
    headers
  );
}

export async function syncCartToServer(): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated) return;
  const projectRef = resolveCartSyncProjectRef();
  const headers = cartProjectRefHeaders(projectRef);
  const { items, shopId, currency } = useCartStore.getState();
  await api.cart.sync({ items, shopId, currency }, headers);
}
