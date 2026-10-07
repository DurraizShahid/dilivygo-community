"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Store } from "lucide-react";
import { cn } from "@dilivygo/ui";
import type { Shop } from "@dilivygo/types";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";

export function ShopSelector() {
  const { activeShop, setActiveShop, setShops, shops } = useShopStore();

  const { data } = useQuery<{ shops: Shop[] }>({
    queryKey: ["shops"],
    queryFn: () => api.shops.list(),
  });

  useEffect(() => {
    if (data?.shops) {
      setShops(data.shops);
      if (!activeShop && data.shops.length > 0) {
        setActiveShop(data.shops[0]);
      }
      if (activeShop && !data.shops.find((s) => s.id === activeShop.id)) {
        setActiveShop(data.shops[0]);
      }
    }
  }, [data, activeShop, setActiveShop, setShops]);

  if (!shops.length) return null;
  if (shops.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
        <Store className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium truncate max-w-[140px]">
          {activeShop?.name ?? shops[0].name}
        </span>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 hover:bg-muted transition-colors">
        <Store className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium truncate max-w-[140px]">
          {activeShop?.name ?? "Select shop"}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>
      <div className="absolute left-0 top-full z-50 mt-1 hidden min-w-[200px] rounded-xl border border-border/60 bg-card p-1 shadow-lg group-hover:block">
        {shops.map((shop) => (
          <button
            key={shop.id}
            onClick={() => setActiveShop(shop)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
              activeShop?.id === shop.id
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            <Store className="size-3.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">{shop.name}</div>
              {shop.address && (
                <div className="text-[11px] opacity-70 truncate">{shop.address}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
