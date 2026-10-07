import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartItem } from "@dilivygo/types";

interface CartState {
  items: CartItem[];
  projectRef: string | null;
  shopId: string | null;
  currency: string | null;
  setItems: (items: CartItem[]) => void;
  setProjectRef: (ref: string) => void;
  setShopId: (shopId: string) => void;
  setCurrency: (currency: string) => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateItemNotes: (itemId: string, notes: string) => void;
  removeItem: (itemId: string) => void;
  clear: () => void;
  totalCents: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      projectRef: null,
      shopId: null,
      currency: null,
      setItems: (items) => set({ items }),
      setProjectRef: (ref) => set({ projectRef: ref }),
      setShopId: (shopId) => set({ shopId }),
      setCurrency: (currency) => set({ currency }),
      addItem: (item) => {
        const cartShopId = get().shopId;
        const effectiveShopId = item.shopId ?? cartShopId;

        const itemHasModifiers =
          Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0;

        if (itemHasModifiers) {
          set({ items: [...get().items, item] });
          return;
        }

        const existing = get().items.find((i) => {
          if (i.productId !== item.productId) return false;
          if ((i.productVariantId || "") !== (item.productVariantId || "")) return false;
          if (i.selectedModifiers && i.selectedModifiers.length > 0) return false;
          const iShop = i.shopId ?? cartShopId;
          return iShop === effectiveShopId;
        });

        if (existing) {
          set({
            items: get().items.map((i) =>
              i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          });
        } else {
          set({ items: [...get().items, item] });
        }
      },
      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== itemId) });
        } else {
          set({ items: get().items.map((i) => (i.id === itemId ? { ...i, quantity } : i)) });
        }
      },
      updateItemNotes: (itemId, notes) => {
        set({
          items: get().items.map((i) =>
            i.id === itemId ? { ...i, notes: notes || undefined } : i
          ),
        });
      },
      removeItem: (itemId) => set({ items: get().items.filter((i) => i.id !== itemId) }),
      clear: () => set({ items: [], projectRef: null, shopId: null, currency: null }),
      totalCents: () => get().items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "dilivygo-cart",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        items: s.items,
        projectRef: s.projectRef,
        shopId: s.shopId,
        currency: s.currency,
      }),
    }
  )
);
