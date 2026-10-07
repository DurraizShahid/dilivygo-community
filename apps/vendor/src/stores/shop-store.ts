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
  isLoaded: boolean;
  setActiveShop: (shop: Shop) => void;
  setShops: (shops: Shop[]) => void;
  clearShop: () => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeShop: null,
      shops: [],
      isLoaded: false,

      setActiveShop: (shop) => set({ activeShop: shop }),
      setShops: (shops) => set({ shops, isLoaded: true }),
      clearShop: () => set({ activeShop: null, shops: [], isLoaded: false }),
    }),
    {
      name: "dilivygo-vendor-shop",
      storage: safeStorage,
      partialize: (state) => ({ activeShop: state.activeShop }),
    }
  )
);
