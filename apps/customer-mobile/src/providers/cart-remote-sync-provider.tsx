import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { hydrateCartFromServer, syncCartToServer } from "@/lib/cart-remote";

const DEBOUNCE_MS = 700;

export function CartRemoteSyncProvider({ children }: { children: ReactNode }) {
  const customerId = useAuthStore((s) => s.customer?.id);
  const authLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [cartHydrated, setCartHydrated] = useState(() => useCartStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useCartStore.persist.onFinishHydration(() => setCartHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!cartHydrated || authLoading || !customerId) return;
    void hydrateCartFromServer().catch(() => {});
  }, [cartHydrated, customerId, authLoading]);

  useEffect(() => {
    if (!cartHydrated || authLoading || !isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useCartStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!useAuthStore.getState().isAuthenticated) return;
        void syncCartToServer().catch(() => {});
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [cartHydrated, authLoading, isAuthenticated]);

  return <>{children}</>;
}
