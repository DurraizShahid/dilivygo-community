import { type ReactNode, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@dilivygo/i18n";
import type { OrderStatus } from "@dilivygo/types";
import { api, wsClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useShopStore } from "@/stores/shop-store";
import {
  getVendorRealtimeStore,
  useVendorRealtimeStore,
} from "@/stores/vendor-realtime-store";
import { VendorStatusBanner } from "@/components/vendor-status-banner";
import { VendorPlacedOrdersBanner } from "@/components/vendor-placed-orders-banner";

function isNewPlacedTransition(
  status: OrderStatus,
  previousStatus: OrderStatus | null | undefined,
): boolean {
  if (status !== "placed") return false;
  if (previousStatus == null) return true;
  return previousStatus === "scheduled";
}

function VendorRealtimeWsBridge() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation("mobile");
  const tRef = useRef(t);
  tRef.current = t;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeShopId = useShopStore((s) => s.activeShop?.id ?? null);
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lang = i18n.language;

  const scheduleFlashRemoval = useCallback((orderId: string) => {
    const existing = flashTimers.current[orderId];
    if (existing) clearTimeout(existing);
    flashTimers.current[orderId] = setTimeout(() => {
      getVendorRealtimeStore().removeFlashOrderId(orderId);
      delete flashTimers.current[orderId];
    }, 12_000);
  }, []);

  const considerNewOrderForShop = useCallback(
    async (orderId: string) => {
      if (!activeShopId) return;
      try {
        const order = await api.orders.get(orderId);
        if (order.shopId !== activeShopId) return;
        const store = getVendorRealtimeStore();
        store.addFlashOrderId(orderId);
        scheduleFlashRemoval(orderId);
      } catch {
        /* order may not be visible yet */
      }
    },
    [activeShopId, scheduleFlashRemoval],
  );

  const showStatusIfOurShop = useCallback(async (orderId: string, message: string) => {
    if (!activeShopId) return;
    try {
      const order = await api.orders.get(orderId);
      if (order.shopId !== activeShopId) return;
      getVendorRealtimeStore().setStatusBanner({
        id: `${orderId}-${message}`,
        message,
      });
    } catch {
      /* ignore */
    }
  }, [activeShopId]);

  useEffect(() => {
    if (!isAuthenticated) {
      wsClient.disconnect();
      const s = getVendorRealtimeStore();
      s.setStatusBanner(null);
      s.setPendingPushOrderId(null);
      for (const id of Object.keys(s.flashOrderIds)) {
        s.removeFlashOrderId(id);
      }
      s.setPlacedBannerDismissed(false);
      return;
    }

    wsClient.connect();

    const tr = tRef.current;

    const unsubStatus = wsClient.subscribe("order:status_changed", (event) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });

      const prev = event.previousStatus as OrderStatus | null | undefined;
      if (isNewPlacedTransition(event.status, prev)) {
        void considerNewOrderForShop(event.orderId);
        return;
      }

      if (event.status === "placed") return;

      const shortId = event.orderId.slice(0, 8).toUpperCase();
      const statusLabel = tr(`orderStatus.${event.status}`);
      void showStatusIfOurShop(
        event.orderId,
        tr("alerts.statusChanged", { shortId, status: statusLabel }),
      );
    });

    const unsubRejected = wsClient.subscribe("order:rejected", (event) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      const shortId = event.orderId.slice(0, 8).toUpperCase();
      void showStatusIfOurShop(event.orderId, tr("alerts.orderRejected", { shortId }));
    });

    const unsubDelayed = wsClient.subscribe("order:delayed", (event) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      const shortId = event.orderId.slice(0, 8).toUpperCase();
      void showStatusIfOurShop(event.orderId, tr("alerts.orderDelayed", { shortId }));
    });

    return () => {
      unsubStatus();
      unsubRejected();
      unsubDelayed();
    };
  }, [
    isAuthenticated,
    queryClient,
    considerNewOrderForShop,
    showStatusIfOurShop,
    lang,
  ]);

  const pendingPushOrderId = useVendorRealtimeStore((s) => s.pendingPushOrderId);
  const setPendingPushOrderId = useVendorRealtimeStore((s) => s.setPendingPushOrderId);

  useEffect(() => {
    if (!pendingPushOrderId || !activeShopId) return;
    let cancelled = false;
    void (async () => {
      try {
        const order = await api.orders.get(pendingPushOrderId);
        if (cancelled) return;
        if (order.shopId === activeShopId && order.status === "placed") {
          const store = getVendorRealtimeStore();
          store.addFlashOrderId(pendingPushOrderId);
          scheduleFlashRemoval(pendingPushOrderId);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setPendingPushOrderId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingPushOrderId, activeShopId, setPendingPushOrderId, scheduleFlashRemoval]);

  return null;
}

export function VendorOrderRealtimeHost({ children }: { children: ReactNode }) {
  return (
    <>
      <VendorRealtimeWsBridge />
      {children}
      <VendorStatusBanner />
      <VendorPlacedOrdersBanner />
    </>
  );
}
