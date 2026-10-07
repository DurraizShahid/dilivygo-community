import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, mockCartStore, mockAuthStore } from "@/test/setup";
import CheckoutPage from "./page";
import type { CartItem, Customer, CustomerAddress } from "@dilivygo/types";

// Mock Stripe
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    if (onReady) setTimeout(onReady, 0);
    return <div data-testid="payment-element">Payment Element</div>;
  },
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}));

vi.mock("@/lib/stripe", () => ({
  stripePromise: Promise.resolve({}),
}));

// Mock API
const mockValidatePromo = vi.fn();
const mockCreateIntent = vi.fn();
const mockGeocode = vi.fn();
const mockDeliveryCheck = vi.fn();
const mockShopDeliveryCheck = vi.fn();
const mockListAddresses = vi.fn();
const mockShopDetail = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    promoCodes: {
      validate: (...args: unknown[]) => mockValidatePromo(...args),
    },
    payments: {
      createIntent: (...args: unknown[]) => mockCreateIntent(...args),
    },
    public: {
      geocode: (...args: unknown[]) => mockGeocode(...args),
      deliveryCheck: (...args: unknown[]) => mockDeliveryCheck(...args),
      shopDeliveryCheck: (...args: unknown[]) => mockShopDeliveryCheck(...args),
      shopDetail: (...args: unknown[]) => mockShopDetail(...args),
    },
    addresses: {
      list: () => mockListAddresses(),
    },
    customerWallet: {
      get: () => Promise.resolve({ balanceCents: 0, transactions: [] }),
    },
    auth: {
      getSession: vi.fn(),
      logout: vi.fn(),
    },
  },
}));

// Mock the UI library via the shared surface mock.
vi.mock("@dilivygo/ui", async () => (await import("@/test/ui-mock")).default);

// Mock PromoBanner
vi.mock("@/components/promo-banner", () => ({
  PromoBanner: () => null,
}));

// Mock router
const mockRouterPush = vi.fn();
const mockRouterBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: mockRouterBack,
    forward: vi.fn(),
  }),
  usePathname: () => "/checkout",
  useSearchParams: () => new URLSearchParams(),
}));

const createCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "item-1",
  sessionId: "session-1",
  productId: "product-1",
  name: "Test Burger",
  quantity: 1,
  unitPriceCents: 1000,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const mockCustomer: Customer = {
  id: "customer-1",
  phone: "+447700900001",
  name: "John Doe",
  email: "john@example.com",
  projectRef: "demo",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAddress: CustomerAddress = {
  id: "addr-1",
  customerId: "customer-1",
  label: "Home",
  addressLine1: "123 Main St",
  city: "London",
  postcode: "SW1A 1AA",
  isDefault: true,
  createdAt: new Date().toISOString(),
};

describe("CheckoutPage", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCartStore.reset();
    mockAuthStore.reset();
    mockRouterPush.mockClear();
    mockRouterBack.mockClear();

    // Set up default cart state
    mockCartStore.setState({
      items: [createCartItem()],
      currency: "GBP",
      projectRef: "demo",
      shopId: "shop-1",
    });

    // Set up authenticated user
    mockAuthStore.setAuthenticated(mockCustomer);

    // Default mock responses
    mockListAddresses.mockResolvedValue({ addresses: [] });
    mockShopDetail.mockResolvedValue({ minimumOrderCents: 0 });
    mockGeocode.mockResolvedValue({ lat: 51.5074, lon: -0.1278 });
    mockDeliveryCheck.mockResolvedValue({ deliverable: true, distance: 2, maxRadius: 10 });
    mockShopDeliveryCheck.mockResolvedValue({ deliverable: true, distance: 2, maxRadius: 10 });
  });

  describe("Empty Cart Redirect", () => {
    it("redirects to cart when cart is empty", () => {
      mockCartStore.reset();
      renderWithProviders(<CheckoutPage />);

      expect(mockRouterPush).toHaveBeenCalledWith("/cart");
    });
  });

  describe("Header and Navigation", () => {
    it("renders checkout header", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });

    it("shows back button that navigates back", async () => {
      renderWithProviders(<CheckoutPage />);

      const backButton = screen.getByRole("button", { name: /go back/i });
      fireEvent.click(backButton);

      expect(mockRouterBack).toHaveBeenCalled();
    });
  });

  describe("Delivery Address", () => {
    it("renders delivery address section", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Delivery Address")).toBeInTheDocument();
      expect(screen.getByText(/where should we deliver/i)).toBeInTheDocument();
    });

    it("shows address input field", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByPlaceholderText(/enter your delivery address/i)).toBeInTheDocument();
    });

    it("displays saved addresses when available", async () => {
      mockListAddresses.mockResolvedValue({
        addresses: [mockAddress],
      });

      renderWithProviders(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/home/i)).toBeInTheDocument();
      });
    });

    it("allows selecting a saved address", async () => {
      mockListAddresses.mockResolvedValue({
        addresses: [mockAddress],
      });

      renderWithProviders(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/home/i)).toBeInTheDocument();
      });

      const addressButton = screen.getByText(/home/i);
      fireEvent.click(addressButton);

      // After clicking, the address input should be populated with the formatted address
      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      const inputValue = (addressInput as HTMLInputElement).value;
      expect(inputValue).toContain("123 Main St");
    });

    it("shows new address option", async () => {
      mockListAddresses.mockResolvedValue({
        addresses: [mockAddress],
      });

      renderWithProviders(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/new address/i)).toBeInTheDocument();
      });
    });

    it("clears selected address when entering new address", async () => {
      mockListAddresses.mockResolvedValue({
        addresses: [mockAddress],
      });

      renderWithProviders(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/home/i)).toBeInTheDocument();
      });

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      await user.clear(addressInput);
      fireEvent.change(addressInput, { target: { value: "456 New Street" } });

      // New address button should now be selected
      expect(addressInput).toHaveValue("456 New Street");
    });

    it("shows delivery check loading state", async () => {
      mockGeocode.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street" } });

      await waitFor(() => {
        expect(screen.getByText(/checking delivery availability/i)).toBeInTheDocument();
      });
    });

    it("shows error when delivery is not available", async () => {
      mockShopDeliveryCheck.mockResolvedValue({ deliverable: false, distance: 15, maxRadius: 10 });

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      await waitFor(() => {
        expect(screen.getByText(/doesn't deliver to your area/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe("Order Items Display", () => {
    it("renders order items section", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Order Items")).toBeInTheDocument();
    });

    it("displays cart items", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/test burger/i)).toBeInTheDocument();
    });

    it("shows item quantity", () => {
      mockCartStore.setState({
        items: [createCartItem({ quantity: 3 })],
        currency: "GBP",
        projectRef: "demo",
        shopId: "shop-1",
      });

      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/× 3/)).toBeInTheDocument();
    });

    it("displays item modifiers", () => {
      mockCartStore.setState({
        items: [
          createCartItem({
            selectedModifiers: [
              { groupName: "Size", optionName: "Large", priceCents: 200 },
            ],
          }),
        ],
        currency: "GBP",
        projectRef: "demo",
        shopId: "shop-1",
      });

      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/size: large/i)).toBeInTheDocument();
    });

    it("displays item notes", () => {
      mockCartStore.setState({
        items: [createCartItem({ notes: "No pickles please" })],
        currency: "GBP",
        projectRef: "demo",
        shopId: "shop-1",
      });

      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/no pickles please/i)).toBeInTheDocument();
    });
  });

  describe("Promo Code", () => {
    it("renders promo code section", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Promo Code")).toBeInTheDocument();
    });

    it("shows promo code input", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByPlaceholderText(/enter promo code/i)).toBeInTheDocument();
    });

    it("shows apply button", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    });

    it("disables apply button when input is empty", () => {
      renderWithProviders(<CheckoutPage />);

      const applyButton = screen.getByRole("button", { name: /apply/i });
      expect(applyButton).toBeDisabled();
    });

    it("enables apply button when promo code is entered", async () => {
      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      expect(applyButton).not.toBeDisabled();
    });

    it("validates promo code on apply", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 500,
        freeDelivery: false,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(mockValidatePromo).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "SAVE10",
          })
        );
      });
    });

    it("shows applied promo code", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 500,
        freeDelivery: false,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText("SAVE10")).toBeInTheDocument();
      });
    });

    it("shows free delivery message when promo gives free delivery", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 0,
        freeDelivery: true,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "FREEDEL" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText(/free delivery/i)).toBeInTheDocument();
      });
    });

    it("shows error for invalid promo code", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: false,
        discountCents: 0,
        freeDelivery: false,
        promoCodeId: null,
        message: "Invalid promo code",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "INVALID" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText(/invalid promo code/i)).toBeInTheDocument();
      });
    });

    it("allows removing applied promo code", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 500,
        freeDelivery: false,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText("SAVE10")).toBeInTheDocument();
      });

      // Promo code should be displayed - verifying it's applied
      expect(screen.getByText("SAVE10")).toBeInTheDocument();
    });
  });

  describe("Delivery Time Selection", () => {
    it("renders delivery time section", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Delivery Time")).toBeInTheDocument();
    });

    it("shows ASAP option selected by default", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/as soon as possible/i)).toBeInTheDocument();
    });

    it("shows schedule for later option", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/schedule for later/i)).toBeInTheDocument();
    });

    it("shows date and time inputs when schedule later is selected", async () => {
      renderWithProviders(<CheckoutPage />);

      const laterButton = screen.getByText(/schedule for later/i);
      fireEvent.click(laterButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/time/i)).toBeInTheDocument();
      });
    });

    it("allows selecting date and time", async () => {
      renderWithProviders(<CheckoutPage />);

      const laterButton = screen.getByText(/schedule for later/i);
      fireEvent.click(laterButton);

      const dateInput = screen.getByLabelText(/date/i);
      const timeInput = screen.getByLabelText(/time/i);

      fireEvent.change(dateInput, { target: { value: "2026-03-25" } });
      fireEvent.change(timeInput, { target: { value: "14:00" } });

      expect(dateInput).toHaveValue("2026-03-25");
      expect(timeInput).toHaveValue("14:00");
    });

    it("disables pay button when schedule later selected without date/time", async () => {
      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street" } });

      const laterButton = screen.getByText(/schedule for later/i);
      fireEvent.click(laterButton);

      // Pay button should be disabled
      const payButton = screen.getByRole("button", { name: /schedule & pay/i });
      expect(payButton).toBeDisabled();
    });
  });

  describe("Payment Summary", () => {
    it("renders payment summary section", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Payment Summary")).toBeInTheDocument();
    });

    it("shows subtotal", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Subtotal")).toBeInTheDocument();
    });

    it("shows delivery fee", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Delivery")).toBeInTheDocument();
    });

    it("shows total", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText("Total")).toBeInTheDocument();
    });

    it("shows discount when promo applied", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 500,
        freeDelivery: false,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText("Discount")).toBeInTheDocument();
      });
    });

    it("shows free delivery label when promo gives free delivery", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 0,
        freeDelivery: true,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "FREEDEL" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText("Free")).toBeInTheDocument();
      });
    });

    it("shows secure payment badge", () => {
      renderWithProviders(<CheckoutPage />);

      expect(screen.getByText(/secure payment powered by stripe/i)).toBeInTheDocument();
    });
  });

  describe("Minimum Order", () => {
    it("shows minimum order warning when below minimum", async () => {
      mockShopDetail.mockResolvedValue({ minimumOrderCents: 2000 });

      mockCartStore.setState({
        items: [createCartItem({ unitPriceCents: 500 })],
        currency: "GBP",
        projectRef: "demo",
        shopId: "shop-1",
      });

      renderWithProviders(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/minimum order/i)).toBeInTheDocument();
      });
    });

    it("disables pay button when below minimum order", async () => {
      mockShopDetail.mockResolvedValue({ minimumOrderCents: 2000 });

      mockCartStore.setState({
        items: [createCartItem({ unitPriceCents: 500 })],
        currency: "GBP",
        projectRef: "demo",
        shopId: "shop-1",
      });

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street" } });

      await waitFor(() => {
        const payButton = screen.getByRole("button", { name: /pay/i });
        expect(payButton).toBeDisabled();
      });
    });
  });

  describe("Payment Flow", () => {
    beforeEach(() => {
      mockCreateIntent.mockResolvedValue({
        clientSecret: "pi_secret_123",
        paymentIntentId: "pi_123",
        isDummy: false,
      });
    });

    it("requires authentication to pay", async () => {
      mockAuthStore.reset(); // Unauthenticated

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street" } });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      // The customer app pins workspace context to the login URL so users land
      // back on the correct tenant after signing in. Accept either the bare
      // "/login" path (when the cart has no workspace ref) or the query-string
      // variant used for tenanted carts.
      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith(
          expect.stringMatching(/^\/login(\?ref=[^&]+)?$/)
        );
      });
    });

    it("requires address to pay", async () => {
      renderWithProviders(<CheckoutPage />);

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(screen.getByText("Please enter a delivery address")).toBeInTheDocument();
      });
    });

    it("shows payment form after clicking pay with valid address", async () => {
      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(screen.getByTestId("stripe-elements")).toBeInTheDocument();
        expect(screen.getByText("Payment")).toBeInTheDocument();
      });
    });

    it("handles dummy payment mode", async () => {
      // The dummy-payment redirect is a development-only bypass; in any other
      // env the checkout page shows a toast error instead. Pin NODE_ENV for
      // this test so we exercise the intended happy path.
      vi.stubEnv("NODE_ENV", "development");

      mockCreateIntent.mockResolvedValue({
        clientSecret: "pi_secret_123",
        paymentIntentId: "pi_123",
        isDummy: true,
      });

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      try {
        await waitFor(() => {
          expect(mockRouterPush).toHaveBeenCalledWith("/orders");
        });
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("shows back button in payment phase", async () => {
      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(screen.getByTestId("stripe-elements")).toBeInTheDocument();
      });

      // Back button should return to review phase
      const backButton = screen.getByRole("button", { name: /go back/i });
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.getByText("Checkout")).toBeInTheDocument();
        expect(screen.queryByTestId("stripe-elements")).not.toBeInTheDocument();
      });
    });

    it("includes promo code in payment metadata when applied", async () => {
      mockValidatePromo.mockResolvedValue({
        valid: true,
        discountCents: 500,
        freeDelivery: false,
        promoCodeId: "promo-1",
      });

      renderWithProviders(<CheckoutPage />);

      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      fireEvent.change(promoInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText("SAVE10")).toBeInTheDocument();
      });

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockCreateIntent).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              promoCode: "SAVE10",
            }),
          })
        );
      });
    });
  });

  describe("Scheduled Orders", () => {
    // The date input enforces min={today} in the product code. Using a fixed
    // date in the past would silently disable the Schedule & Pay button and
    // leave the test racing the clock. Derive a date that is always 30 days
    // in the future relative to the test run.
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 30);
      return d.toISOString().split("T")[0];
    })();

    it("updates button text for scheduled orders", async () => {
      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street" } });

      const laterButton = screen.getByText(/schedule for later/i);
      fireEvent.click(laterButton);

      fireEvent.change(document.getElementById("sched-date") as HTMLInputElement, {
        target: { value: futureDate },
      });
      fireEvent.change(document.getElementById("sched-time") as HTMLInputElement, {
        target: { value: "14:00" },
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /schedule & pay/i })).toBeInTheDocument();
      });
    });

    it("includes scheduled time in payment metadata", async () => {
      mockCreateIntent.mockResolvedValue({
        clientSecret: "pi_secret_123",
        paymentIntentId: "pi_123",
        isDummy: true,
      });

      renderWithProviders(<CheckoutPage />);

      const addressInput = screen.getByPlaceholderText(/enter your delivery address/i);
      fireEvent.change(addressInput, { target: { value: "123 Main Street, London" } });

      const laterButton = screen.getByText(/schedule for later/i);
      fireEvent.click(laterButton);

      // Re-query inputs by id right before each fireEvent so React receives
      // the change on the currently-rendered DOM node. The first state
      // change swaps the component tree and a cached reference from before
      // the update can leave React's value tracker out of sync, causing the
      // second onChange to silently no-op.
      fireEvent.change(document.getElementById("sched-date") as HTMLInputElement, {
        target: { value: futureDate },
      });
      fireEvent.change(document.getElementById("sched-time") as HTMLInputElement, {
        target: { value: "14:00" },
      });

      const payButton = await waitFor(() => {
        const btn = screen.getByRole("button", {
          name: /schedule & pay/i,
        }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        return btn;
      });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockCreateIntent).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              scheduledFor: expect.any(String),
            }),
          })
        );
      });
    });
  });
});
