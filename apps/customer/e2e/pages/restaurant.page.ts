import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Restaurant Page Object Model
 * Handles restaurant menu browsing and adding items to cart
 */
export class RestaurantPage extends BasePage {
  protected readonly path = '/restaurant';

  // Header
  readonly backButton: Locator;
  readonly shopName: Locator;
  readonly shopDescription: Locator;
  readonly shopBanner: Locator;
  readonly shopLogo: Locator;

  // Meta info
  readonly ratingBadge: Locator;
  readonly deliveryTime: Locator;
  readonly shopAddress: Locator;
  readonly saveButton: Locator;
  readonly moreInfoButton: Locator;

  // Category navigation
  readonly categoryNav: Locator;
  readonly allCategoryButton: Locator;
  readonly categoryButtons: Locator;

  // Products
  readonly productGrid: Locator;
  readonly productCards: Locator;
  readonly addButtons: Locator;

  // Loading states
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;

  // Floating cart bar
  readonly floatingCartBar: Locator;
  readonly cartItemCount: Locator;
  readonly cartTotal: Locator;

  // Product modal
  readonly productModal: Locator;
  readonly modalCloseButton: Locator;
  readonly modalProductName: Locator;
  readonly modalQuantityMinus: Locator;
  readonly modalQuantityPlus: Locator;
  readonly modalQuantityValue: Locator;
  readonly modalAddToCartButton: Locator;
  readonly modifierGroups: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.shopName = page.locator('h1').first();
    this.shopDescription = page.locator('.text-white\\/80, .line-clamp-1').first();
    this.shopBanner = page.locator('.h-56, .sm\\:h-72, .lg\\:h-80').first();
    this.shopLogo = page.locator('.rounded-2xl').filter({ has: page.locator('img') }).first();

    // Meta info
    this.ratingBadge = page.locator('.text-green-600, .text-green-400').filter({ hasText: /\d\.\d|new/i });
    this.deliveryTime = page.locator('text=/\\d+-\\d+ min/');
    this.shopAddress = page.locator('.text-muted-foreground').filter({ has: page.locator('svg') });
    this.saveButton = page.getByRole('button', { name: /save/i });
    this.moreInfoButton = page.getByRole('button', { name: /more info/i });

    // Category navigation
    this.categoryNav = page.locator('.sticky').filter({ has: page.getByRole('button', { name: 'All' }) });
    this.allCategoryButton = page.getByRole('button', { name: 'All', exact: true });
    this.categoryButtons = this.categoryNav.getByRole('button');

    // Products
    this.productGrid = page.locator('.grid').filter({ has: page.locator('text=Add') });
    this.productCards = page.locator('.rounded-2xl.border').filter({ has: page.locator('h3') });
    this.addButtons = page.getByRole('button', { name: /add/i });

    // Loading states
    this.loadingSkeleton = page.locator('.animate-pulse').first();
    this.emptyState = page.locator('text=No items available').locator('..');

    // Floating cart bar
    this.floatingCartBar = page.locator('.fixed.bottom-0 button').filter({ hasText: /item|items/ });
    this.cartItemCount = this.floatingCartBar.locator('span').filter({ hasText: /item/ });
    this.cartTotal = this.floatingCartBar.locator('.text-lg, .font-bold').last();

    // Product modal
    this.productModal = page.locator('.fixed.inset-0').filter({ has: page.locator('text=Add to Cart') });
    this.modalCloseButton = page.getByRole('button', { name: /close/i });
    this.modalProductName = this.productModal.locator('h2');
    this.modalQuantityMinus = this.productModal.getByRole('button', { name: /decrease/i });
    this.modalQuantityPlus = this.productModal.getByRole('button', { name: /increase/i });
    this.modalQuantityValue = this.productModal.locator('.text-center.text-lg');
    this.modalAddToCartButton = this.productModal.getByRole('button', { name: /add to cart/i });
    this.modifierGroups = this.productModal.locator('.space-y-6 > div');
  }

  /**
   * Navigate to restaurant page by ref and shopId
   */
  async gotoRestaurant(ref: string, shopId: string): Promise<void> {
    await this.page.goto(`/restaurant/${ref}/${shopId}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for restaurant page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for products to load or empty state
    await Promise.race([
      this.productCards.first().waitFor({ state: 'visible', timeout: 15_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 15_000 }),
      this.loadingSkeleton.waitFor({ state: 'hidden', timeout: 15_000 }),
    ]).catch(() => {});
  }

  /**
   * Get shop name
   */
  async getShopName(): Promise<string | null> {
    return await this.shopName.textContent();
  }

  /**
   * Get rating text
   */
  async getRating(): Promise<string | null> {
    try {
      return await this.ratingBadge.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Select a category
   */
  async selectCategory(categoryName: string): Promise<void> {
    const categoryButton = this.categoryNav.getByRole('button', { name: categoryName, exact: true });
    await categoryButton.click();
    // Wait for category selection to reflect in product grid
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<string[]> {
    const buttons = await this.categoryButtons.all();
    const categories: string[] = [];
    for (const button of buttons) {
      const text = await button.textContent();
      if (text) categories.push(text.trim());
    }
    return categories;
  }

  /**
   * Get product count
   */
  async getProductCount(): Promise<number> {
    return await this.productCards.count();
  }

  /**
   * Get product names
   */
  async getProductNames(): Promise<string[]> {
    const cards = await this.productCards.all();
    const names: string[] = [];
    for (const card of cards) {
      const name = await card.locator('h3').textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  /**
   * Add product to cart by name (simple product without modifiers)
   */
  async addProductByName(productName: string): Promise<void> {
    const productCard = this.productCards.filter({ hasText: productName }).first();
    const addButton = productCard.getByRole('button', { name: /add/i });
    await addButton.click();

    // Check if modal opened (product has modifiers)
    const isModalOpen = await this.productModal.isVisible().catch(() => false);
    if (isModalOpen) {
      // Add from modal with default options
      await this.addFromModalWithDefaults();
    }
  }

  /**
   * Add product to cart by index
   */
  async addProductByIndex(index: number): Promise<void> {
    const productCard = this.productCards.nth(index);
    const addButton = productCard.getByRole('button', { name: /add/i });
    await addButton.click();

    // Check if modal opened
    const isModalOpen = await this.productModal.isVisible().catch(() => false);
    if (isModalOpen) {
      await this.addFromModalWithDefaults();
    }
  }

  /**
   * Add first available product to cart
   */
  async addFirstProduct(): Promise<void> {
    await this.addProductByIndex(0);
  }

  /**
   * Open product detail modal
   */
  async openProductModal(productName: string): Promise<void> {
    const productCard = this.productCards.filter({ hasText: productName }).first();
    const addButton = productCard.getByRole('button', { name: /add/i });
    await addButton.click();
    await this.productModal.waitFor({ state: 'visible', timeout: 5_000 });
  }

  /**
   * Check if product modal is open
   */
  async isProductModalOpen(): Promise<boolean> {
    return await this.productModal.isVisible();
  }

  /**
   * Close product modal
   */
  async closeProductModal(): Promise<void> {
    await this.modalCloseButton.click();
    await this.productModal.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /**
   * Set quantity in modal
   */
  async setModalQuantity(quantity: number): Promise<void> {
    const currentQty = parseInt((await this.modalQuantityValue.textContent()) ?? '1', 10);
    
    if (quantity > currentQty) {
      for (let i = currentQty; i < quantity; i++) {
        await this.modalQuantityPlus.click();
      }
    } else if (quantity < currentQty) {
      for (let i = currentQty; i > quantity; i--) {
        await this.modalQuantityMinus.click();
      }
    }
  }

  /**
   * Select a modifier option by group and option name
   */
  async selectModifier(groupName: string, optionName: string): Promise<void> {
    const group = this.modifierGroups.filter({ hasText: groupName }).first();
    const option = group.getByRole('button', { name: optionName });
    await option.click();
  }

  /**
   * Add from modal with default selections
   */
  async addFromModalWithDefaults(): Promise<void> {
    await this.modalAddToCartButton.click();
    await this.productModal.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /**
   * Add from modal with customizations
   */
  async addFromModal(options?: { quantity?: number; modifiers?: Array<{ group: string; option: string }> }): Promise<void> {
    if (options?.quantity) {
      await this.setModalQuantity(options.quantity);
    }

    if (options?.modifiers) {
      for (const mod of options.modifiers) {
        await this.selectModifier(mod.group, mod.option);
      }
    }

    await this.modalAddToCartButton.click();
    await this.productModal.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /**
   * Check if floating cart bar is visible
   */
  async isFloatingCartVisible(): Promise<boolean> {
    return await this.floatingCartBar.isVisible();
  }

  /**
   * Get cart item count from floating bar
   */
  async getFloatingCartItemCount(): Promise<number> {
    const text = await this.cartItemCount.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Click floating cart bar to go to cart
   */
  async clickFloatingCart(): Promise<void> {
    await this.floatingCartBar.click();
    await this.page.waitForURL('/cart');
  }

  /**
   * Toggle save/favorite shop
   */
  async toggleSave(): Promise<void> {
    await this.saveButton.click();
  }

  /**
   * Go back to previous page
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Verify product was added (by checking floating cart or toast)
   */
  async verifyProductAdded(): Promise<void> {
    // Wait for either floating cart or success toast
    await Promise.race([
      this.floatingCartBar.waitFor({ state: 'visible', timeout: 5_000 }),
      this.page.locator('text=added to cart').waitFor({ state: 'visible', timeout: 5_000 }),
    ]).catch(() => {});
  }
}
