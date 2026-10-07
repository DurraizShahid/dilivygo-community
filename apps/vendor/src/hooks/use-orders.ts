import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeOrder } from "@dilivygo/api";
import { api } from "@/lib/api";
import type { Order, OrderItem } from "@dilivygo/types";
import { useShopStore } from "@/stores/shop-store";
import { useWSEvent } from "@/providers/ws-provider";

export function useOrders(status?: string) {
  const activeShop = useShopStore((s) => s.activeShop);
  return useQuery<Order[]>({
    queryKey: ["orders", status ?? "all", activeShop?.id ?? "all-shops"],
    queryFn: () =>
      api.orders.list({
        ...(status ? { status } : {}),
        limit: 100,
        shopId: activeShop?.id,
      }),
    refetchInterval: 15_000,
  });
}

export function useOrder(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Order & { items: OrderItem[] }>({
    queryKey: ["orders", id],
    queryFn: async () => {
      const res = await api.orders.get(id);
      const raw = (res as { order?: unknown }).order ?? res;
      const normalized = normalizeOrder(raw);
      if (!normalized) {
        throw new Error("Invalid order response");
      }
      return { ...normalized, items: normalized.items ?? [] };
    },
    enabled: !!id,
    refetchInterval: 10_000,
  });

  useWSEvent("order:status_changed", (event) => {
    if (event.orderId === id) {
      queryClient.setQueryData<Order & { items: OrderItem[] }>(
        ["orders", id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: event.status as Order["status"],
            updatedAt: event.updatedAt ?? prev.updatedAt,
          };
        },
      );

      queryClient.setQueriesData<Order[]>({
        queryKey: ["orders"],
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "orders" &&
          q.queryKey.length === 3,
      }, (prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((o) =>
          o.id === id
            ? { ...o, status: event.status as Order["status"], updatedAt: event.updatedAt ?? o.updatedAt }
            : o
        );
      });
    }
  });

  useWSEvent("delivery:rider_assigned", (event) => {
    if (event.orderId === id) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    }
  });

  useWSEvent("delivery:rider_arrived", (event) => {
    if (event.orderId === id) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    }
  });

  return query;
}
