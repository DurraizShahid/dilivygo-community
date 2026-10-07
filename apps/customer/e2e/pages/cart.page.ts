import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Cart Page Object Model
 * Handles cart review and management
 */
export class CartPage extends BasePage {
  protected readonly path = '/cart';

  // Header
  readonly backButton: Locator;
  readonly pageTitle: Locator;
  readonly itemCount: Locator;

  // Cart items
  readonly cartItems: Locator;
  readonly emptyCartState: Locator;
  readonly browseRestaurantsButton: Locator;

  // Item controls
  readonly clearCartButton: Locator;

  // Order summary
  readonly orderSummary: Locator;
  readonly subtotal: Locator;
  readonly deliveryFee: Locator;
  readonly total: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.pageTitle = page.locator('h1').filter({ hasText: /your cart/i });
    this.itemCount = page.locator('text=/\\d+ item/');

    // Cart items
    this.cartItems = page.locator('.rounded-2xl.border').filter({ has: page.getByRole('button', { name: /decrease/i }) });
    this.emptyCartState = page.locator('text=Your cart is empty').locator('..');
    this.browseRestaurantsButton = page.getByRole('button', { name: /browse restaurants/i });

    // Controls
    this.clearCartButton = page.getByRole('button', { name: /clear cart/i });

    // Order summary
    this.orderSummary = page.locator('text=Order Summary').locator('..');
    this.subtotal = page.locator('text=Subtotal').locator('..').locator('span').last();
    this.deliveryFee = page.locator('text=Delivery fee').locator('..').locator('span').last();
    this.total = page.locator('text=Total').locator('..').locator('.font-bold').last();
    this.checkoutButton = page.getByRole('button', { name: /proceed to checkout/i });
  }

  /**
   * Wait for cart page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for either cart items or empty state
    await Promise.race([
      this.cartItems.first().waitFor({ state: 'visible', timeout: 10_000 }),
      this.emptyCartState.waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => {});
  }

  /**
   * Check if cart is empty
   */
  async isCartEmpty(): Promise<boolean> {
    return await this.emptyCartState.isVisible();
  }

  /**
   * Get number of items in cart
   */
  async getCartItemCount(): Promise<number> {
    return await this.cartItems.count();
  }

  /**
   * Get cart item by name
   */
  getCartItem(name: string): Locator {
    return this.cartItems.filter({ hasText: name }).first();
  }

  /**
   * Increase item quantity
   */
  async increaseItemQuantity(itemName: string): Promise<void> {
    const item = this.getCartItem(itemName);
    const plusButton = item.getByRole('button', { name: /increase/i });
    await plusButton.click();
  }

  /**
   * Decrease item quantity
   */
  async decreaseItemQuantity(itemName: string): Promise<void> {
    const item = this.getCartItem(itemName);
    const minusButton = item.getByRole('button', { name: /decrease/i });
    await minusButton.click();
  }

  /**
   * Get item quantity
   */
  async getItemQuantity(itemName: string): Promise<number> {
    const item = this.getCartItem(itemName);
    const quantityText = await item.locator('.text-center').textContent();
    return parseInt(quantityText ?? '0', 10);
  }

  /**
   * Remove item from cart
   */
  async removeItem(itemName: string): Promise<void> {
    const item = this.getCartItem(itemName);
    const removeButton = item.getByRole('button', { name: /remove/i });
    await removeButton.click();
  }

  /**
   * Add special instructions to item
   */
  async addSpecialInstructions(itemName: string, instructions: string): Promise<void> {
    const item = this.getCartItem(itemName);
    const instructionsButton = item.locator('text=Add special instructions').or(item.locator('text=no onions'));
    await instructionsButton.click();
    const input = item.locator('input[placeholder*="no onions"]');
    await input.fill(instructions);
  }

  /**
   * Clear entire cart
   */
  async clearCart(): Promise<void> {
    await this.clearCartButton.click();
    await this.emptyCartState.waitFor({ state: 'visible' });
  }

  /**
   * Get subtotal value
   */
  async getSubtotal(): Promise<string | null> {
    return await this.subtotal.textContent();
  }

  /**
   * Get total value
   */
  async getTotal(): Promise<string | null> {
    return await this.total.textContent();
  }

  /**
   * Proceed to checkout
   */
  async proceedToCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await this.page.waitForURL('/checkout');
  }

  /**
   * Go back to previous page
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Browse restaurants (from empty cart)
   */
  async browseRestaurants(): Promise<void> {
    await this.browseRestaurantsButton.click();
    await this.page.waitForURL('/');
  }

  /**
   * Verify item exists in cart
   */
  async verifyItemInCart(itemName: string): Promise<void> {
    const item = this.getCartItem(itemName);
    await expect(item).toBeVisible();
  }

  /**
   * Get all item names in cart
   */
  async getItemNames(): Promise<string[]> {
    const items = await this.cartItems.all();
    const names: string[] = [];
    for (const item of items) {
      const name = await item.locator('h3, .font-semibold').first().textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }
}
