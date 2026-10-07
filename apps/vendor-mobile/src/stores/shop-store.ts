import { create } from "zustand";
import type { Shop } from "@dilivygo/types";

interface ShopState {
  activeShop: Shop | null;
  shops: Shop[];
  isLoaded: boolean;
  setActiveShop: (shop: Shop) => void;
  setShops: (shops: Shop[]) => void;
  clearShop: () => void;
}

export const useShopStore = create<ShopState>((set) => ({
  activeShop: null,
  shops: [],
  isLoaded: false,

  setActiveShop: (shop) => set({ activeShop: shop }),
  setShops: (shops) => set({ shops, isLoaded: true }),
  clearShop: () => set({ activeShop: null, shops: [], isLoaded: false }),
}));
