"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useOrders } from "@/hooks/use-orders";

type VendorPlacedOrdersValue = {
  placedCount: number;
  placedOrderIds: ReadonlySet<string>;
};

const VendorPlacedOrdersContext = createContext<VendorPlacedOrdersValue>({
  placedCount: 0,
  placedOrderIds: new Set(),
});

export function VendorPlacedOrdersProvider({ children }: { children: ReactNode }) {
  const { data: orders } = useOrders();
  const value = useMemo<VendorPlacedOrdersValue>(() => {
    const placed = (orders || []).filter((o) => o.status === "placed");
    return {
      placedCount: placed.length,
      placedOrderIds: new Set(placed.map((o) => o.id)),
    };
  }, [orders]);
  return (
    <VendorPlacedOrdersContext.Provider value={value}>{children}</VendorPlacedOrdersContext.Provider>
  );
}

export function useVendorPlacedOrders() {
  return useContext(VendorPlacedOrdersContext);
}
