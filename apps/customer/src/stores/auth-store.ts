import { create } from "zustand";
import type { Customer } from "@dilivygo/types";
import { api } from "@/lib/api";

const TOKEN_KEY = "dilivygo_customer_token";
const CUSTOMER_KEY = "dilivygo_customer";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredCustomer(): Customer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAuth(customer: Customer | null, token?: string | null) {
  if (typeof window === "undefined") return;

  if (!customer) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    return;
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

interface AuthState {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  setCustomer: (customer: Customer | null, token?: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  customer: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: async () => {
    try {
      // First, try cookie-based session check
      const session = await api.auth.getSession();
      if (session?.customer) {
        set({
          customer: session.customer,
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }
    } catch {
      // Cookie-based session failed, fall through to token fallback
    }

    // Fallback: check localStorage for a stored token and customer
    const storedToken = getStoredToken();
    const storedCustomer = getStoredCustomer();

    if (storedToken && storedCustomer) {
      // We have a stored token - restore the session optimistically
      // The token will be validated on next API call that requires auth
      set({
        customer: storedCustomer,
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }

    // No valid session found
    set({ customer: null, isAuthenticated: false, isLoading: false });
  },

  setCustomer: (customer, token) => {
    const nextToken = token !== undefined ? token : getStoredToken();
    storeAuth(customer, nextToken ?? undefined);
    set({ customer, isAuthenticated: !!customer, isLoading: false });
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    storeAuth(null);
    set({ customer: null, isAuthenticated: false });
  },
}));

/** Get stored auth token for API requests */
export function getAuthToken(): string | null {
  return getStoredToken();
}
