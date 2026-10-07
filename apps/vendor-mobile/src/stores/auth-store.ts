import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { User } from "@dilivygo/types";
import { api, VENDOR_STAFF_TOKEN_KEY, setApiAuthToken } from "@/lib/api";
import { unregisterPushToken } from "@/lib/notifications";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(VENDOR_STAFF_TOKEN_KEY);
      setApiAuthToken(token);
      const session = await api.auth.getAdminSession();
      if (session?.user) {
        set({ user: session.user as unknown as User, isAuthenticated: true, isLoading: false });
      } else {
        await SecureStore.deleteItemAsync(VENDOR_STAFF_TOKEN_KEY);
        setApiAuthToken(null);
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      await SecureStore.deleteItemAsync(VENDOR_STAFF_TOKEN_KEY).catch(() => {});
      setApiAuthToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  logout: async () => {
    try {
      await api.auth.logoutAdmin();
    } catch {}
    await unregisterPushToken().catch(() => {});
    await SecureStore.deleteItemAsync(VENDOR_STAFF_TOKEN_KEY).catch(() => {});
    setApiAuthToken(null);
    set({ user: null, isAuthenticated: false });
  },
}));
