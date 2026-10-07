import { create } from "zustand";
import type { User } from "@dilivygo/types";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  hydrate: async () => {
    try {
      const session = await api.auth.getAdminSession();
      if (session?.user) {
        set({
          user: session.user as unknown as User,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (get().user) {
        set({ isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      if (get().user) {
        set({ isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  logout: async () => {
    try {
      await api.auth.logoutAdmin();
    } catch {
      // ignore
    }
    // Drop persisted active shop so the next login (possibly another workspace)
    // never briefly reuses a stale shop id for catalog / queue / checkout calls.
    useShopStore.getState().setShops([]);
    set({ user: null, isAuthenticated: false });
  },
}));
