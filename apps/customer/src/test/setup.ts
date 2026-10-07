import "@testing-library/jest-dom";
import { afterEach, beforeEach, vi } from "vitest";
import React from "react";
import type { Customer, CartItem } from "@dilivygo/types";
import { I18nProvider } from "@dilivygo/i18n";
import { resources, ns, defaultNS } from "@/i18n";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Image component
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { src, alt, ...props }),
}));

// ============================================
// Auth Store Mock
// ============================================
interface MockAuthState {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const defaultAuthState: MockAuthState = {
  customer: null,
  isAuthenticated: false,
  isLoading: false,
};

let mockAuthState = { ...defaultAuthState };

export const mockAuthStore = {
  getState: () => ({
    ...mockAuthState,
    hydrate: vi.fn(),
    setCustomer: vi.fn(),
    logout: vi.fn(),
  }),
  setState: (state: Partial<MockAuthState>) => {
    mockAuthState = { ...mockAuthState, ...state };
  },
  reset: () => {
    mockAuthState = { ...defaultAuthState };
  },
  setAuthenticated: (customer: Customer) => {
    mockAuthState = {
      customer,
      isAuthenticated: true,
      isLoading: false,
    };
  },
};

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector?: (state: ReturnType<typeof mockAuthStore.getState>) => unknown) => {
    const state = mockAuthStore.getState();
    return selector ? selector(state) : state;
  },
}));

// ============================================
// Cart Store Mock (Zustand)
// ============================================
interface MockCartState {
  items: CartItem[];
  projectRef: string | null;
  shopId: string | null;
  currency: string | null;
  checkoutPromo: {
    code: string;
    discountCents: number;
    freeDelivery: boolean;
    promoCodeId: string;
  } | null;
}

const defaultCartState: MockCartState = {
  items: [],
  projectRef: null,
  shopId: null,
  currency: null,
  checkoutPromo: null,
};

let mockCartState = { ...defaultCartState };

export const mockCartStore = {
  getState: () => ({
    ...mockCartState,
    setItems: vi.fn((items: CartItem[]) => {
      mockCartState.items = items;
    }),
    setProjectRef: vi.fn((ref: string) => {
      mockCartState.projectRef = ref;
    }),
    setShopId: vi.fn((shopId: string) => {
      mockCartState.shopId = shopId;
    }),
    setCurrency: vi.fn((currency: string) => {
      mockCartState.currency = currency;
    }),
    addItem: vi.fn((item: CartItem) => {
      mockCartState.items = [...mockCartState.items, item];
    }),
    updateQuantity: vi.fn(),
    updateItemNotes: vi.fn(),
    removeItem: vi.fn((itemId: string) => {
      mockCartState.items = mockCartState.items.filter((i) => i.id !== itemId);
    }),
    setCheckoutPromo: vi.fn((promo: NonNullable<MockCartState["checkoutPromo"]>) => {
      mockCartState.checkoutPromo = promo;
    }),
    clearCheckoutPromo: vi.fn(() => {
      mockCartState.checkoutPromo = null;
    }),
    clear: vi.fn(() => {
      mockCartState = { ...defaultCartState };
    }),
    totalCents: () =>
      mockCartState.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    itemCount: () => mockCartState.items.reduce((sum, i) => sum + i.quantity, 0),
  }),
  setState: (state: Partial<MockCartState>) => {
    mockCartState = { ...mockCartState, ...state };
  },
  reset: () => {
    mockCartState = { ...defaultCartState };
  },
};

vi.mock("@/stores/cart-store", () => ({
  useCartStore: (selector?: (state: ReturnType<typeof mockCartStore.getState>) => unknown) => {
    const state = mockCartStore.getState();
    return selector ? selector(state) : state;
  },
}));

// ============================================
// Location Store Mock
// ============================================
interface MockLocationState {
  lat: number | null;
  lng: number | null;
  address: string | null;
  countryCode: string | null;
  savedAddressId: string | null;
}

const defaultLocationState: MockLocationState = {
  lat: null,
  lng: null,
  address: null,
  countryCode: null,
  savedAddressId: null,
};

let mockLocationState = { ...defaultLocationState };

export const mockLocationStore = {
  getState: () => ({
    ...mockLocationState,
    lon: mockLocationState.lng,
    countryCode: mockLocationState.countryCode,
    status: "idle" as const,
    setLocation: vi.fn((lat: number, lng: number, address: string) => {
      mockLocationState = {
        lat,
        lng,
        address,
        countryCode: mockLocationState.countryCode,
        savedAddressId: mockLocationState.savedAddressId,
      };
    }),
    clearLocation: vi.fn(() => {
      mockLocationState = { ...defaultLocationState };
    }),
    detectLocation: vi.fn(),
    applySavedAddress: vi.fn(),
    clearSavedAddressSelection: vi.fn(),
    clear: vi.fn(() => {
      mockLocationState = { ...defaultLocationState };
    }),
  }),
  setState: (state: Partial<MockLocationState>) => {
    mockLocationState = { ...mockLocationState, ...state };
  },
  reset: () => {
    mockLocationState = { ...defaultLocationState };
  },
};

vi.mock("@/stores/location-store", () => ({
  useLocationStore: (selector?: (state: ReturnType<typeof mockLocationStore.getState>) => unknown) => {
    const state = mockLocationStore.getState();
    return selector ? selector(state) : state;
  },
}));

// ============================================
// API Mock
// ============================================
vi.mock("@/lib/api", () => ({
  api: {
    auth: {
      getSession: vi.fn(),
      logout: vi.fn(),
    },
  },
}));

vi.mock("@/providers/cart-remote-sync-provider", () => ({
  CartRemoteSyncProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// ============================================
// Test Utilities
// ============================================
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

interface TestWrapperProps {
  children: React.ReactNode;
}

export function TestWrapper({ children }: TestWrapperProps) {
  const queryClient = createTestQueryClient();
  return React.createElement(I18nProvider, {
    resources,
    defaultNS,
    ns,
    languageConfig: { defaultLanguage: "en", locked: false },
    children: React.createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: TestWrapper, ...options });
}

// Reset all mocks before each test
beforeEach(() => {
  mockAuthStore.reset();
  mockCartStore.reset();
  mockLocationStore.reset();
  vi.clearAllMocks();
});

// Restore all mocks after each test
afterEach(() => {
  vi.restoreAllMocks();
});
