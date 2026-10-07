import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeOrder } from "@dilivygo/api";
import { api } from "@/lib/api";
import { useWSEvent } from "@/providers/ws-provider";
import { useAuthStore } from "@/stores/auth-store";
import type { Order, OrderItem } from "@dilivygo/types";

export function useOrders() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: () => api.orders.list({ limit: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });
}

export function useOrder(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Order & { items: OrderItem[] }>({
    queryKey: ["orders", id],
    queryFn: async () => {
      const res = await api.orders.get(id);
      const raw = (res as { order?: unknown })?.order ?? res;
      const normalized = normalizeOrder(raw);
      if (!normalized) {
        throw new Error("Invalid order response");
      }
      return { ...normalized, items: normalized.items ?? [] };
    },
    enabled: !!id,
    refetchInterval: 10_000,
  });

  useWSEvent("order:rejected", (event) => {
    if (event.orderId === id) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    }
  });

  useWSEvent("order:delayed", (event) => {
    if (event.orderId === id) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    }
  });

  useWSEvent("order:status_changed", (event) => {
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

  useWSEvent("delivery:rider_assigned", (event) => {
    if (event.orderId === id) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    }
  });

  return query;
}
