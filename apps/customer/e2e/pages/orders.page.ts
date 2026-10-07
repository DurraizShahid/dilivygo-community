import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Orders Page Object Model
 * Handles order history list view
 */
export class OrdersPage extends BasePage {
  protected readonly path = '/orders';

  // Header
  readonly pageTitle: Locator;

  // Order list
  readonly orderCards: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeleton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.pageTitle = page.locator('h1').filter({ hasText: /your orders/i });

    // Order list
    this.orderCards = page.locator('a[href*="/orders/"]').filter({ has: page.locator('text=Order #') });
    this.emptyState = page.locator('text=No orders yet').locator('..');
    this.loadingSkeleton = page.locator('.animate-pulse').first();
  }

  /**
   * Wait for orders page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for orders to load or empty state
    await Promise.race([
      this.orderCards.first().waitFor({ state: 'visible', timeout: 10_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10_000 }),
      this.loadingSkeleton.waitFor({ state: 'hidden', timeout: 10_000 }),
    ]).catch(() => {});
  }

  /**
   * Check if orders list is empty
   */
  async hasNoOrders(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Get order count
   */
  async getOrderCount(): Promise<number> {
    return await this.orderCards.count();
  }

  /**
   * Get order card by index
   */
  getOrderByIndex(index: number): Locator {
    return this.orderCards.nth(index);
  }

  /**
   * Get order card by order ID
   */
  getOrderById(orderId: string): Locator {
    return this.orderCards.filter({ hasText: orderId.slice(0, 8) });
  }

  /**
   * Click on order by index
   */
  async clickOrderByIndex(index: number): Promise<void> {
    await this.getOrderByIndex(index).click();
    await this.page.waitForURL(/\/orders\/[^/]+$/);
  }

  /**
   * Click on first order
   */
  async clickFirstOrder(): Promise<void> {
    await this.clickOrderByIndex(0);
  }

  /**
   * Reorder by index
   */
  async reorderByIndex(index: number): Promise<void> {
    const reorderButton = this.getOrderByIndex(index).getByRole('button', { name: /reorder/i });
    await reorderButton.click();
  }

  /**
   * Get order status badge by index
   */
  async getOrderStatus(index: number): Promise<string | null> {
    const statusBadge = this.getOrderByIndex(index).locator('[class*="badge"], .rounded-full.px-2');
    return await statusBadge.textContent();
  }

  /**
   * Get all order IDs
   */
  async getOrderIds(): Promise<string[]> {
    const cards = await this.orderCards.all();
    const ids: string[] = [];
    for (const card of cards) {
      const href = await card.getAttribute('href');
      if (href) {
        const match = href.match(/\/orders\/([^/]+)/);
        if (match) ids.push(match[1]);
      }
    }
    return ids;
  }

  /**
   * Verify order exists by partial ID
   */
  async verifyOrderExists(partialId: string): Promise<void> {
    const order = this.orderCards.filter({ hasText: partialId });
    await expect(order).toBeVisible();
  }
}

/**
 * Order Detail Page Object Model
 * Handles individual order detail view with tracking
 */
export class OrderDetailPage extends BasePage {
  protected readonly path = '/orders';

  // Header
  readonly backButton: Locator;
  readonly orderTitle: Locator;
  readonly orderDate: Locator;
  readonly statusBadge: Locator;
  readonly receiptButton: Locator;

  // Scheduled order banner
  readonly scheduledBanner: Locator;

  // Status states
  readonly rejectedBanner: Locator;
  readonly lateBanner: Locator;
  readonly slaCountdown: Locator;

  // Progress tracker
  readonly progressTracker: Locator;
  readonly progressSteps: Locator;

  // Rider tracking
  readonly riderTrackingMap: Locator;
  readonly searchingForRider: Locator;

  // Rating section
  readonly ratingSection: Locator;
  readonly vendorRatingStars: Locator;
  readonly riderRatingStars: Locator;
  readonly commentTextarea: Locator;
  readonly tipButtons: Locator;
  readonly customTipInput: Locator;
  readonly submitRatingButton: Locator;

  // Order items sidebar
  readonly orderItemsSection: Locator;
  readonly orderItems: Locator;
  readonly orderTotal: Locator;

  // Action buttons
  readonly reorderButton: Locator;
  readonly chatWithRestaurantButton: Locator;
  readonly chatWithRiderButton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.orderTitle = page.locator('h1').filter({ hasText: /order #/i });
    this.orderDate = page.locator('.text-xs.text-muted-foreground').first();
    this.statusBadge = page.locator('[class*="badge"]').filter({ hasText: /placed|accepted|preparing|ready|assigned|picked|arrived|completed|cancelled|rejected|scheduled/i });
    this.receiptButton = page.getByRole('button', { name: /pdf receipt/i });

    // Scheduled banner
    this.scheduledBanner = page.locator('text=Scheduled Order').locator('..');

    // Status states
    this.rejectedBanner = page.locator('text=Order Rejected').locator('..');
    this.lateBanner = page.locator('text=Order is later than expected').locator('..');
    this.slaCountdown = page.locator('text=Estimated delivery').locator('..');

    // Progress tracker
    this.progressTracker = page.locator('text=Order Progress').locator('..').locator('..');
    this.progressSteps = this.progressTracker.locator('.flex.flex-col.items-center');

    // Rider tracking
    this.riderTrackingMap = page.locator('[class*="map"], .leaflet-container');
    this.searchingForRider = page.locator('text=Searching for a rider');

    // Rating section
    this.ratingSection = page.locator('text=Rate Your Experience').locator('..').locator('..');
    this.vendorRatingStars = page.locator('text=Food / Restaurant').locator('..').locator('button');
    this.riderRatingStars = page.locator('text=Delivery / Rider').locator('..').locator('button');
    this.commentTextarea = page.locator('textarea[placeholder*="experience"]');
    this.tipButtons = page.locator('text=Tip for rider').locator('..').locator('button');
    this.customTipInput = page.locator('input[type="number"][placeholder="0"]');
    this.submitRatingButton = page.getByRole('button', { name: /submit rating/i });

    // Order items sidebar
    this.orderItemsSection = page.locator('text=Order Items').locator('..').locator('..').first();
    this.orderItems = this.orderItemsSection.locator('.space-y-2 > div').filter({ has: page.locator('.text-muted-foreground') });
    this.orderTotal = page.locator('.font-bold').filter({ hasText: /total/i }).locator('..').locator('.font-bold').last();

    // Action buttons
    this.reorderButton = page.getByRole('button', { name: /reorder/i }).first();
    this.chatWithRestaurantButton = page.getByRole('button', { name: /chat with restaurant/i });
    this.chatWithRiderButton = page.getByRole('button', { name: /chat with rider/i });
  }

  /**
   * Navigate to order detail page
   */
  async gotoOrder(orderId: string): Promise<void> {
    await this.page.goto(`/orders/${orderId}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for order detail page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.orderTitle.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /**
   * Get order ID from title
   */
  async getOrderId(): Promise<string | null> {
    const title = await this.orderTitle.textContent();
    const match = title?.match(/Order #([a-f0-9]+)/i);
    return match?.[1] ?? null;
  }

  /**
   * Get order status
   */
  async getOrderStatus(): Promise<string | null> {
    return await this.statusBadge.textContent();
  }

  /**
   * Check if order is rejected
   */
  async isRejected(): Promise<boolean> {
    return await this.rejectedBanner.isVisible();
  }

  /**
   * Check if order is late
   */
  async isLate(): Promise<boolean> {
    return await this.lateBanner.isVisible();
  }

  /**
   * Check if SLA countdown is visible
   */
  async hasSlaCountdown(): Promise<boolean> {
    return await this.slaCountdown.isVisible();
  }

  /**
   * Get current progress step
   */
  async getCurrentProgressStep(): Promise<number> {
    const steps = await this.progressSteps.all();
    for (let i = 0; i < steps.length; i++) {
      const stepClass = await steps[i].locator('.rounded-full').getAttribute('class');
      if (stepClass?.includes('bg-primary')) {
        // Find last active step
        const nextStepClass = i < steps.length - 1 
          ? await steps[i + 1].locator('.rounded-full').getAttribute('class')
          : '';
        if (!nextStepClass?.includes('bg-primary')) {
          return i + 1;
        }
      }
    }
    return 0;
  }

  /**
   * Check if rating section is visible
   */
  async canRate(): Promise<boolean> {
    return await this.ratingSection.isVisible();
  }

  /**
   * Rate vendor
   */
  async rateVendor(stars: number): Promise<void> {
    await this.vendorRatingStars.nth(stars - 1).click();
  }

  /**
   * Rate rider
   */
  async rateRider(stars: number): Promise<void> {
    await this.riderRatingStars.nth(stars - 1).click();
  }

  /**
   * Add comment
   */
  async addComment(comment: string): Promise<void> {
    await this.commentTextarea.fill(comment);
  }

  /**
   * Select tip amount
   */
  async selectTip(amountIndex: number): Promise<void> {
    await this.tipButtons.nth(amountIndex).click();
  }

  /**
   * Enter custom tip
   */
  async enterCustomTip(amount: string): Promise<void> {
    await this.customTipInput.fill(amount);
  }

  /**
   * Submit rating
   */
  async submitRating(): Promise<void> {
    await this.submitRatingButton.click();
  }

  /**
   * Reorder
   */
  async clickReorder(): Promise<void> {
    await this.reorderButton.click();
    await this.page.waitForURL('/cart');
  }

  /**
   * Open chat with restaurant
   */
  async openRestaurantChat(): Promise<void> {
    await this.chatWithRestaurantButton.click();
    await this.page.waitForURL(/\/chat\//);
  }

  /**
   * Open chat with rider
   */
  async openRiderChat(): Promise<void> {
    await this.chatWithRiderButton.click();
    await this.page.waitForURL(/\/chat\//);
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Download receipt
   */
  async downloadReceipt(): Promise<void> {
    await this.receiptButton.click();
  }

  /**
   * Check if rider tracking map is visible
   */
  async hasRiderTracking(): Promise<boolean> {
    return await this.riderTrackingMap.isVisible();
  }

  /**
   * Check if searching for rider indicator is visible
   */
  async isSearchingForRider(): Promise<boolean> {
    return await this.searchingForRider.isVisible();
  }

  /**
   * Get order total
   */
  async getOrderTotal(): Promise<string | null> {
    return await this.orderTotal.textContent();
  }

  /**
   * Get order item count
   */
  async getOrderItemCount(): Promise<number> {
    return await this.orderItems.count();
  }

  /**
   * Verify order detail elements are visible
   */
  async verifyOrderDetailReady(): Promise<void> {
    await expect(this.orderTitle).toBeVisible();
    await expect(this.statusBadge).toBeVisible();
    await expect(this.orderItemsSection).toBeVisible();
  }
}
