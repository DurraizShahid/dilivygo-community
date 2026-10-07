import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Shop } from "@dilivygo/types";

const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
);

interface ShopState {
  activeShop: Shop | null;
  shops: Shop[];
  setActiveShop: (shop: Shop) => void;
  setShops: (shops: Shop[]) => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeShop: null,
      shops: [],
      setActiveShop: (shop) => set({ activeShop: shop }),
      setShops: (shops) =>
        set((state) => ({
          shops,
          activeShop:
            state.activeShop && shops.some((s) => s.id === state.activeShop?.id)
              ? state.activeShop
              : shops[0] || null,
        })),
    }),
    {
      name: "dilivygo-pos-shop",
      storage: safeStorage,
      partialize: (state) => ({ activeShop: state.activeShop }),
    }
  )
);
