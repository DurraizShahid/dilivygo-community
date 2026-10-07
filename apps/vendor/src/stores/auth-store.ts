import { create } from "zustand";
import type { User } from "@dilivygo/types";
import { api } from "@/lib/api";
import { unregisterVendorWebPush } from "@/lib/vendor-web-push";

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
        set({ user: session.user as unknown as User, isAuthenticated: true, isLoading: false });
      } else {
        // Avoid immediately logging the user out right after a successful login.
        // There can be a short window where the cookie isn't yet visible to the
        // subsequent /api/auth/session request.
        if (get().user) {
          set({ isLoading: false });
        } else {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      }
    } catch {
      if (get().user) {
        set({ isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, isLoading: false }),

  logout: async () => {
    await unregisterVendorWebPush().catch(() => {});
    try {
      await api.auth.logoutAdmin();
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },
}));
