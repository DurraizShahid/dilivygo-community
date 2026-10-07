import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Checkout Page Object Model
 * Handles checkout flow including address, delivery time, promo codes, and payment
 */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout';

  // Header
  readonly backButton: Locator;
  readonly pageTitle: Locator;

  // Delivery address
  readonly addressSection: Locator;
  readonly addressInput: Locator;
  readonly savedAddressButtons: Locator;
  readonly newAddressButton: Locator;
  readonly checkingDeliveryIndicator: Locator;
  readonly deliveryUnavailableWarning: Locator;

  // Order items
  readonly orderItemsSection: Locator;
  readonly orderItems: Locator;

  // Promo code
  readonly promoSection: Locator;
  readonly promoInput: Locator;
  readonly applyPromoButton: Locator;
  readonly appliedPromoTag: Locator;
  readonly removePromoButton: Locator;
  readonly promoError: Locator;

  // Delivery time
  readonly deliveryTimeSection: Locator;
  readonly asapButton: Locator;
  readonly scheduleLaterButton: Locator;
  readonly scheduleDateInput: Locator;
  readonly scheduleTimeInput: Locator;

  // Payment summary
  readonly paymentSummary: Locator;
  readonly subtotalLine: Locator;
  readonly discountLine: Locator;
  readonly deliveryLine: Locator;
  readonly totalLine: Locator;
  readonly minimumOrderWarning: Locator;

  // Payment button
  readonly payButton: Locator;
  readonly loadingSpinner: Locator;

  // Stripe payment elements (inside iframe)
  readonly stripePaymentForm: Locator;
  readonly confirmPaymentButton: Locator;
  readonly paymentBackButton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.pageTitle = page.locator('h1').filter({ hasText: /checkout|payment/i });

    // Delivery address
    this.addressSection = page.locator('text=Delivery Address').locator('..').locator('..');
    this.addressInput = page.getByPlaceholder(/enter your delivery address/i);
    this.savedAddressButtons = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /(default)|[A-Za-z]/ });
    this.newAddressButton = page.getByRole('button', { name: /new address/i });
    this.checkingDeliveryIndicator = page.locator('text=Checking delivery availability');
    this.deliveryUnavailableWarning = page.locator('text=/doesn\'t deliver to your area/i');

    // Order items
    this.orderItemsSection = page.locator('text=Order Items').locator('..').locator('..');
    this.orderItems = this.orderItemsSection.locator('.text-sm.text-muted-foreground');

    // Promo code
    this.promoSection = page.locator('text=Promo Code').locator('..').locator('..');
    this.promoInput = page.getByPlaceholder(/enter promo code/i);
    this.applyPromoButton = page.getByRole('button', { name: /apply/i });
    this.appliedPromoTag = page.locator('.bg-emerald-50, .bg-emerald-950');
    this.removePromoButton = this.appliedPromoTag.locator('button');
    this.promoError = page.locator('.text-destructive').filter({ hasText: /.+/ });

    // Delivery time
    this.deliveryTimeSection = page.locator('text=Delivery Time').locator('..').locator('..');
    this.asapButton = page.getByRole('button', { name: /as soon as possible/i });
    this.scheduleLaterButton = page.getByRole('button', { name: /schedule for later/i });
    this.scheduleDateInput = page.locator('#sched-date');
    this.scheduleTimeInput = page.locator('#sched-time');

    // Payment summary
    this.paymentSummary = page.locator('text=Payment Summary').locator('..').locator('..');
    this.subtotalLine = page.locator('text=Subtotal').locator('..');
    this.discountLine = page.locator('text=Discount').locator('..');
    this.deliveryLine = page.locator('text=Delivery').locator('..').first();
    this.totalLine = page.locator('.font-bold').filter({ hasText: /total/i }).locator('..');
    this.minimumOrderWarning = page.locator('.bg-amber-50, .bg-amber-950').filter({ hasText: /minimum order/i });

    // Payment button
    this.payButton = page.getByRole('button', { name: /pay|schedule/i }).filter({ has: page.locator('svg') });
    this.loadingSpinner = page.locator('.animate-spin');

    // Stripe payment (after initiating payment)
    this.stripePaymentForm = page.locator('[class*="Elements"]').or(page.locator('iframe[name*="stripe"]'));
    this.confirmPaymentButton = page.getByRole('button', { name: /confirm/i });
    this.paymentBackButton = page.getByRole('button', { name: /back/i });
  }

  /**
   * Wait for checkout page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.addressInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /**
   * Enter delivery address
   */
  async enterAddress(address: string): Promise<void> {
    await this.addressInput.fill(address);
    // Wait for address input event to trigger, then wait for delivery check indicator
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for delivery check to complete
    await this.checkingDeliveryIndicator.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  /**
   * Select a saved address
   */
  async selectSavedAddress(label: string): Promise<void> {
    const addressButton = this.page.getByRole('button', { name: new RegExp(label, 'i') });
    await addressButton.click();
    // Wait for delivery check to complete
    await this.checkingDeliveryIndicator.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  /**
   * Click new address button
   */
  async clickNewAddress(): Promise<void> {
    await this.newAddressButton.click();
    await this.addressInput.clear();
  }

  /**
   * Check if delivery is available
   */
  async isDeliveryAvailable(): Promise<boolean> {
    return !(await this.deliveryUnavailableWarning.isVisible());
  }

  /**
   * Enter promo code
   */
  async enterPromoCode(code: string): Promise<void> {
    await this.promoInput.fill(code);
  }

  /**
   * Apply promo code
   */
  async applyPromoCode(code: string): Promise<void> {
    await this.enterPromoCode(code);
    await this.applyPromoButton.click();
    // Wait for promo validation response by checking for applied tag or error
    await Promise.race([
      this.appliedPromoTag.waitFor({ state: 'visible', timeout: 5_000 }),
      this.promoError.waitFor({ state: 'visible', timeout: 5_000 }),
    ]).catch(() => {});
  }

  /**
   * Check if promo code was applied
   */
  async isPromoApplied(): Promise<boolean> {
    return await this.appliedPromoTag.isVisible();
  }

  /**
   * Remove applied promo code
   */
  async removePromoCode(): Promise<void> {
    await this.removePromoButton.click();
  }

  /**
   * Get promo error message
   */
  async getPromoError(): Promise<string | null> {
    try {
      return await this.promoError.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Select ASAP delivery
   */
  async selectAsapDelivery(): Promise<void> {
    await this.asapButton.click();
  }

  /**
   * Select scheduled delivery
   */
  async selectScheduledDelivery(date: string, time: string): Promise<void> {
    await this.scheduleLaterButton.click();
    await this.scheduleDateInput.waitFor({ state: 'visible' });
    await this.scheduleDateInput.fill(date);
    await this.scheduleTimeInput.fill(time);
  }

  /**
   * Get subtotal amount
   */
  async getSubtotal(): Promise<string | null> {
    return await this.subtotalLine.locator('span').last().textContent();
  }

  /**
   * Get total amount
   */
  async getTotal(): Promise<string | null> {
    return await this.totalLine.locator('.font-bold').last().textContent();
  }

  /**
   * Check if minimum order warning is shown
   */
  async hasMinimumOrderWarning(): Promise<boolean> {
    return await this.minimumOrderWarning.isVisible();
  }

  /**
   * Click pay button to initiate payment
   */
  async clickPay(): Promise<void> {
    await this.payButton.click();
  }

  /**
   * Check if on payment step (Stripe form visible)
   */
  async isOnPaymentStep(): Promise<boolean> {
    return await this.stripePaymentForm.isVisible();
  }

  /**
   * Fill Stripe test card
   * Note: This interacts with Stripe's iframe elements
   */
  async fillStripeTestCard(cardNumber = '4242424242424242', expiry = '1234', cvc = '123'): Promise<void> {
    // Wait for Stripe iframe to load
    const stripeFrame = this.page.frameLocator('iframe[name*="stripe"]').first();
    
    // Fill card number
    const cardInput = stripeFrame.locator('[name="number"], [placeholder*="card number"]');
    await cardInput.fill(cardNumber);

    // Fill expiry
    const expiryInput = stripeFrame.locator('[name="expiry"], [placeholder*="MM"]');
    await expiryInput.fill(expiry);

    // Fill CVC
    const cvcInput = stripeFrame.locator('[name="cvc"], [placeholder*="CVC"]');
    await cvcInput.fill(cvc);
  }

  /**
   * Confirm payment
   */
  async confirmPayment(): Promise<void> {
    await this.confirmPaymentButton.click();
  }

  /**
   * Complete full checkout flow
   */
  async completeCheckout(address: string): Promise<void> {
    await this.enterAddress(address);
    await this.selectAsapDelivery();
    await this.clickPay();

    // Handle payment step if not dummy
    const isPaymentStep = await this.isOnPaymentStep();
    if (isPaymentStep) {
      await this.fillStripeTestCard();
      await this.confirmPayment();
    }

    // Wait for redirect to orders page
    await this.page.waitForURL('/orders', { timeout: 30_000 });
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Verify checkout elements are visible
   */
  async verifyCheckoutReady(): Promise<void> {
    await expect(this.addressInput).toBeVisible();
    await expect(this.paymentSummary).toBeVisible();
    await expect(this.payButton).toBeVisible();
  }
}
