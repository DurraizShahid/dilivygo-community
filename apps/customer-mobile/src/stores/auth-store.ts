import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { Customer } from "@dilivygo/types";
import { api, setApiAuthToken } from "@/lib/api";

interface AuthState {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  setCustomer: (customer: Customer | null, token?: string | null) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  customer: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync("customer_auth_token");
      setApiAuthToken(token);
      const session = await api.auth.getSession();
      if (session?.customer) {
        set({ customer: session.customer, isAuthenticated: true, isLoading: false });
      } else {
        await SecureStore.deleteItemAsync("customer_auth_token");
        setApiAuthToken(null);
        set({ customer: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      await SecureStore.deleteItemAsync("customer_auth_token");
      setApiAuthToken(null);
      set({ customer: null, isAuthenticated: false, isLoading: false });
    }
  },

  setCustomer: async (customer, token) => {
    if (token) {
      await SecureStore.setItemAsync("customer_auth_token", token);
      setApiAuthToken(token);
    }
    set({ customer, isAuthenticated: !!customer, isLoading: false });
  },

  logout: async () => {
    try {
      await api.auth.logout();
      await SecureStore.deleteItemAsync("customer_auth_token");
    } catch {}
    setApiAuthToken(null);
    set({ customer: null, isAuthenticated: false });
  },
}));
