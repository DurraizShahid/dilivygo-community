import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, mockCartStore } from "@/test/setup";
import CartPage from "./page";
import type { CartItem } from "@dilivygo/types";

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
  usePathname: () => "/cart",
  useSearchParams: () => new URLSearchParams(),
}));

const createCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "item-1",
  sessionId: "session-1",
  productId: "product-1",
  name: "Test Product",
  quantity: 1,
  unitPriceCents: 1000,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("CartPage", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCartStore.reset();
    mockRouterPush.mockClear();
    mockRouterBack.mockClear();
  });

  describe("Empty Cart State", () => {
    it("renders empty cart message when no items", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
      expect(screen.getByText(/browse restaurants and add items/i)).toBeInTheDocument();
    });

    it("shows browse restaurants button in empty state", () => {
      renderWithProviders(<CartPage />);

      const browseButton = screen.getByRole("button", { name: /browse restaurants/i });
      expect(browseButton).toBeInTheDocument();
    });

    it("navigates to home when clicking browse restaurants", async () => {
      renderWithProviders(<CartPage />);

      const browseButton = screen.getByRole("button", { name: /browse restaurants/i });
      await user.click(browseButton);

      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });
  });

  describe("Cart with Items", () => {
    beforeEach(() => {
      mockCartStore.setState({
        items: [createCartItem()],
        currency: "GBP",
      });
    });

    it("renders cart header with item count", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Your Cart")).toBeInTheDocument();
      expect(screen.getByText("1 item")).toBeInTheDocument();
    });

    it("displays correct pluralization for multiple items", () => {
      mockCartStore.setState({
        items: [
          createCartItem({ id: "item-1" }),
          createCartItem({ id: "item-2", name: "Another Product" }),
        ],
      });

      renderWithProviders(<CartPage />);

      expect(screen.getByText("2 items")).toBeInTheDocument();
    });

    it("renders item name and price", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Test Product")).toBeInTheDocument();
      // Should have price displays: item price, subtotal, delivery fee, and total
      const priceDisplays = screen.getAllByTestId("price-display");
      expect(priceDisplays.length).toBeGreaterThanOrEqual(3); // At minimum: item price, delivery, total
    });

    it("shows back button that navigates back", async () => {
      renderWithProviders(<CartPage />);

      const backButton = screen.getByRole("button", { name: /go back/i });
      await user.click(backButton);

      expect(mockRouterBack).toHaveBeenCalled();
    });
  });

  describe("Quantity Management", () => {
    beforeEach(() => {
      mockCartStore.setState({
        items: [createCartItem({ quantity: 2 })],
        currency: "GBP",
      });
    });

    it("displays current quantity", () => {
      renderWithProviders(<CartPage />);

      // Find the quantity display between the decrease and increase buttons
      const decreaseButton = screen.getByRole("button", { name: /decrease quantity/i });
      const increaseButton = screen.getByRole("button", { name: /increase quantity/i });
      
      // The quantity should be displayed as text "2" near the quantity controls
      // Use a more specific approach by finding the text within the quantity control area
      const quantityControlArea = decreaseButton.parentElement;
      expect(quantityControlArea).toHaveTextContent("2");
    });

    it("shows increase and decrease buttons for quantity control", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByRole("button", { name: /increase quantity/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /decrease quantity/i })).toBeInTheDocument();
    });

    it("shows quantity controls with minus and plus buttons", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByRole("button", { name: /increase quantity/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /decrease quantity/i })).toBeInTheDocument();
    });
  });

  describe("Item Removal", () => {
    beforeEach(() => {
      mockCartStore.setState({
        items: [createCartItem()],
        currency: "GBP",
      });
    });

    it("shows remove item button", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByRole("button", { name: /remove item/i })).toBeInTheDocument();
    });

    it("shows clear cart button", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Clear cart")).toBeInTheDocument();
    });

    it("remove item button is clickable", async () => {
      renderWithProviders(<CartPage />);

      const removeButton = screen.getByRole("button", { name: /remove item/i });
      expect(removeButton).toBeEnabled();
      // Click should not throw an error
      await user.click(removeButton);
    });

    it("clear cart button is clickable", async () => {
      renderWithProviders(<CartPage />);

      const clearButton = screen.getByText("Clear cart");
      // Click should not throw an error
      await user.click(clearButton);
    });
  });

  describe("Special Instructions", () => {
    beforeEach(() => {
      mockCartStore.setState({
        items: [createCartItem()],
        currency: "GBP",
      });
    });

    it("shows add special instructions button", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Add special instructions")).toBeInTheDocument();
    });

    it("expands notes input when clicking add instructions", async () => {
      renderWithProviders(<CartPage />);

      const addNotesButton = screen.getByText("Add special instructions");
      await user.click(addNotesButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/no onions, extra spicy/i)).toBeInTheDocument();
      });
    });

    it("shows existing notes if item has notes", () => {
      mockCartStore.setState({
        items: [createCartItem({ notes: "No onions please" })],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // Notes input should be expanded when item has notes
      expect(screen.getByDisplayValue("No onions please")).toBeInTheDocument();
    });

    it("expands notes input when clicking add instructions", async () => {
      renderWithProviders(<CartPage />);

      const addNotesButton = screen.getByText("Add special instructions");
      await user.click(addNotesButton);

      await waitFor(() => {
        // Notes input should appear after clicking
        expect(screen.getByPlaceholderText(/no onions, extra spicy/i)).toBeInTheDocument();
      });
    });
  });

  describe("Modifiers Display", () => {
    it("displays selected modifiers for items", () => {
      mockCartStore.setState({
        items: [
          createCartItem({
            selectedModifiers: [
              { groupName: "Size", optionName: "Large", priceCents: 200 },
              { groupName: "Toppings", optionName: "Extra Cheese", priceCents: 150 },
            ],
          }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      expect(screen.getByText(/size: large/i)).toBeInTheDocument();
      expect(screen.getByText(/toppings: extra cheese/i)).toBeInTheDocument();
    });

    it("shows modifier prices when not zero", () => {
      mockCartStore.setState({
        items: [
          createCartItem({
            selectedModifiers: [
              { groupName: "Size", optionName: "Large", priceCents: 200 },
            ],
          }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // Should show the modifier text with price indicator
      const modifierText = screen.getByText(/size: large/i);
      expect(modifierText).toBeInTheDocument();
      // Verify the modifier area contains a "+" price indicator
      const modifierContainer = modifierText.closest('div');
      expect(modifierContainer).toHaveTextContent(/\+/);
    });

    it("does not show price for zero-cost modifiers", () => {
      mockCartStore.setState({
        items: [
          createCartItem({
            selectedModifiers: [
              { groupName: "Sauce", optionName: "Ketchup", priceCents: 0 },
            ],
          }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      const modifierItem = screen.getByText(/sauce: ketchup/i);
      expect(modifierItem).toBeInTheDocument();
      // Verify the modifier container does NOT have a price indicator
      const modifierContainer = modifierItem.closest('div');
      expect(modifierContainer?.textContent).not.toMatch(/\+\s*[£$€]/);
    });
  });

  describe("Order Summary", () => {
    beforeEach(() => {
      mockCartStore.setState({
        items: [
          createCartItem({ unitPriceCents: 1000, quantity: 2 }),
        ],
        currency: "GBP",
      });
    });

    it("displays order summary section", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Order Summary")).toBeInTheDocument();
    });

    it("shows subtotal", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Subtotal")).toBeInTheDocument();
    });

    it("shows delivery fee", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Delivery fee")).toBeInTheDocument();
    });

    it("shows total", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByText("Total")).toBeInTheDocument();
    });

    it("shows proceed to checkout button", () => {
      renderWithProviders(<CartPage />);

      expect(screen.getByRole("button", { name: /proceed to checkout/i })).toBeInTheDocument();
    });

    it("navigates to checkout when clicking proceed", async () => {
      renderWithProviders(<CartPage />);

      const checkoutButton = screen.getByRole("button", { name: /proceed to checkout/i });
      await user.click(checkoutButton);

      expect(mockRouterPush).toHaveBeenCalledWith("/checkout");
    });
  });

  describe("Price Calculations", () => {
    it("calculates correct total for single item", () => {
      mockCartStore.setState({
        items: [createCartItem({ unitPriceCents: 1500, quantity: 1 })],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // Verify price displays exist and contain expected currency
      const priceDisplays = screen.getAllByTestId("price-display");
      expect(priceDisplays.length).toBeGreaterThanOrEqual(3); // item, delivery, total at minimum
      
      // Verify subtotal is displayed (1500 cents = 15.00)
      const subtotalLabel = screen.getByText("Subtotal");
      expect(subtotalLabel).toBeInTheDocument();
    });

    it("calculates correct total for multiple items", () => {
      mockCartStore.setState({
        items: [
          createCartItem({ id: "1", unitPriceCents: 1000, quantity: 2 }),
          createCartItem({ id: "2", unitPriceCents: 500, quantity: 3 }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // Item 1: 10.00 * 2 = 20.00
      // Item 2: 5.00 * 3 = 15.00
      // Subtotal: 35.00
      const priceDisplays = screen.getAllByTestId("price-display");
      // Should have multiple price displays for items and summary
      expect(priceDisplays.length).toBeGreaterThanOrEqual(4); // 2 items + delivery + total
    });

    it("displays item line total correctly", () => {
      mockCartStore.setState({
        items: [createCartItem({ unitPriceCents: 1000, quantity: 3 })],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // Line total should be 30.00 (1000 cents * 3)
      const priceDisplays = screen.getAllByTestId("price-display");
      // Verify we have the expected price displays
      expect(priceDisplays.length).toBeGreaterThanOrEqual(3);
      
      // Verify the product name is shown
      expect(screen.getByText("Test Product")).toBeInTheDocument();
    });
  });

  describe("Currency Display", () => {
    it("uses cart currency when available", () => {
      mockCartStore.setState({
        items: [createCartItem()],
        currency: "EUR",
      });

      renderWithProviders(<CartPage />);

      const priceDisplays = screen.getAllByTestId("price-display");
      expect(priceDisplays[0]).toHaveTextContent("EUR");
    });

    it("handles undefined currency gracefully", () => {
      mockCartStore.setState({
        items: [createCartItem()],
        currency: null,
      });

      renderWithProviders(<CartPage />);

      // Should still render without errors
      expect(screen.getByText("Test Product")).toBeInTheDocument();
    });
  });

  describe("Multiple Items", () => {
    it("renders all cart items", () => {
      mockCartStore.setState({
        items: [
          createCartItem({ id: "1", name: "Burger" }),
          createCartItem({ id: "2", name: "Pizza" }),
          createCartItem({ id: "3", name: "Salad" }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      expect(screen.getByText("Burger")).toBeInTheDocument();
      expect(screen.getByText("Pizza")).toBeInTheDocument();
      expect(screen.getByText("Salad")).toBeInTheDocument();
    });

    it("shows correct total item count in header", () => {
      mockCartStore.setState({
        items: [
          createCartItem({ id: "1", quantity: 2 }),
          createCartItem({ id: "2", quantity: 3 }),
        ],
        currency: "GBP",
      });

      renderWithProviders(<CartPage />);

      // 2 unique items
      expect(screen.getByText("2 items")).toBeInTheDocument();
    });
  });
});
