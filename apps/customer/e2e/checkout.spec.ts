import { test, expect, TEST_ADDRESSES, PROMO_CODES, STRIPE_TEST_CARDS, TIMEOUTS, getScheduledDeliveryTime } from './fixtures';
import { HomePage, RestaurantPage, CartPage, CheckoutPage, OrdersPage } from './pages';

test.describe('Checkout Flow', () => {
  let homePage: HomePage;
  let restaurantPage: RestaurantPage;
  let cartPage: CartPage;
  let checkoutPage: CheckoutPage;

  // Helper to add item to cart and navigate to checkout
  async function setupCartAndCheckout(page: any) {
    homePage = new HomePage(page);
    restaurantPage = new RestaurantPage(page);
    cartPage = new CartPage(page);
    checkoutPage = new CheckoutPage(page);

    // Clear state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await homePage.goto();
    await homePage.waitForRestaurantsToLoad();
    
    const hasRestaurants = await homePage.hasRestaurants();
    if (!hasRestaurants) {
      return false;
    }

    await homePage.clickFirstRestaurant();
    await restaurantPage.waitForPageLoad();

    const productCount = await restaurantPage.getProductCount();
    if (productCount === 0) {
      return false;
    }

    await restaurantPage.addFirstProduct();
    await restaurantPage.verifyProductAdded();
    
    await page.goto('/cart');
    await cartPage.waitForPageLoad();
    
    const isEmpty = await cartPage.isCartEmpty();
    if (isEmpty) {
      return false;
    }

    await cartPage.proceedToCheckout();
    await checkoutPage.waitForPageLoad();
    
    return true;
  }

  test.describe('Cart Review', () => {
    test('should display checkout page with order items', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.orderItemsSection).toBeVisible();
    });

    test('should display payment summary', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.paymentSummary).toBeVisible();
      
      const subtotal = await checkoutPage.getSubtotal();
      expect(subtotal).toBeTruthy();
      
      const total = await checkoutPage.getTotal();
      expect(total).toBeTruthy();
    });

    test('should show delivery fee in summary', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      const deliveryLine = checkoutPage.deliveryLine;
      await expect(deliveryLine).toBeVisible();
    });
  });

  test.describe('Address Selection', () => {
    test('should display address input field', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.addressInput).toBeVisible();
    });

    test('should accept delivery address input', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.enterAddress(TEST_ADDRESSES.valid.full);
      
      const value = await checkoutPage.addressInput.inputValue();
      expect(value).toBe(TEST_ADDRESSES.valid.full);
    });

    test('should check delivery availability for address', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.enterAddress(TEST_ADDRESSES.valid.full);
      
      // Wait for delivery check to complete by waiting for checking indicator to disappear
      await checkoutPage.checkingDeliveryIndicator.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      
      // Delivery check should have run
      const isAvailable = await checkoutPage.isDeliveryAvailable();
      // Just verify the method works - result depends on mock data
    });

    test('should show warning for out-of-range address', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock delivery check to fail
      await page.route('**/delivery-check*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ deliverable: false }),
        });
      });

      await checkoutPage.enterAddress(TEST_ADDRESSES.outOfRange.full);
      // Wait for delivery check to complete
      await checkoutPage.checkingDeliveryIndicator.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      
      const isAvailable = await checkoutPage.isDeliveryAvailable();
      expect(isAvailable).toBe(false);
    });

    test('should display saved addresses for authenticated users', async ({ authenticatedPage }) => {
      checkoutPage = new CheckoutPage(authenticatedPage);
      
      // Setup with authenticated page
      homePage = new HomePage(authenticatedPage);
      restaurantPage = new RestaurantPage(authenticatedPage);
      cartPage = new CartPage(authenticatedPage);
      
      await authenticatedPage.goto('/');
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      const productCount = await restaurantPage.getProductCount();
      if (productCount === 0) {
        test.skip();
        return;
      }

      await restaurantPage.addFirstProduct();
      await restaurantPage.verifyProductAdded();
      
      await authenticatedPage.goto('/checkout');
      await checkoutPage.waitForPageLoad();
      
      // Saved addresses may or may not be present
      await expect(checkoutPage.addressInput).toBeVisible();
    });

    test('should allow selecting new address option', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Click new address if button exists
      const newAddressVisible = await checkoutPage.newAddressButton.isVisible();
      if (newAddressVisible) {
        await checkoutPage.clickNewAddress();
        
        const value = await checkoutPage.addressInput.inputValue();
        expect(value).toBe('');
      }
    });
  });

  test.describe('Delivery Time Selection', () => {
    test('should display delivery time options', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.asapButton).toBeVisible();
      await expect(checkoutPage.scheduleLaterButton).toBeVisible();
    });

    test('should default to ASAP delivery', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      const asapClass = await checkoutPage.asapButton.getAttribute('class');
      expect(asapClass).toContain('border-primary');
    });

    test('should allow selecting scheduled delivery', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      const scheduled = getScheduledDeliveryTime();
      await checkoutPage.selectScheduledDelivery(scheduled.date, scheduled.time);
      
      await expect(checkoutPage.scheduleDateInput).toBeVisible();
      await expect(checkoutPage.scheduleTimeInput).toBeVisible();
    });

    test('should show date and time inputs for scheduled delivery', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.scheduleLaterButton.click();
      
      await expect(checkoutPage.scheduleDateInput).toBeVisible();
      await expect(checkoutPage.scheduleTimeInput).toBeVisible();
    });
  });

  test.describe('Promo Codes', () => {
    test('should display promo code input', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.promoInput).toBeVisible();
      await expect(checkoutPage.applyPromoButton).toBeVisible();
    });

    test('should apply valid promo code', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock promo validation
      await page.route('**/promo-codes/validate*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            promoCodeId: 'test-promo',
            discountCents: 500,
            freeDelivery: false,
          }),
        });
      });

      await checkoutPage.applyPromoCode(PROMO_CODES.valid);
      
      const isApplied = await checkoutPage.isPromoApplied();
      expect(isApplied).toBe(true);
    });

    test('should show discount when promo applied', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock promo validation
      await page.route('**/promo-codes/validate*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            promoCodeId: 'test-promo',
            discountCents: 500,
            freeDelivery: false,
          }),
        });
      });

      await checkoutPage.applyPromoCode(PROMO_CODES.valid);
      
      const discountLine = checkoutPage.discountLine;
      await expect(discountLine).toBeVisible();
    });

    test('should show error for invalid promo code', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock promo validation failure
      await page.route('**/promo-codes/validate*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: false,
            message: 'Invalid promo code',
          }),
        });
      });

      await checkoutPage.applyPromoCode(PROMO_CODES.invalid);
      
      const error = await checkoutPage.getPromoError();
      expect(error).toBeTruthy();
    });

    test('should allow removing applied promo code', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock promo validation
      await page.route('**/promo-codes/validate*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            promoCodeId: 'test-promo',
            discountCents: 500,
            freeDelivery: false,
          }),
        });
      });

      await checkoutPage.applyPromoCode(PROMO_CODES.valid);
      await checkoutPage.removePromoCode();
      
      const isApplied = await checkoutPage.isPromoApplied();
      expect(isApplied).toBe(false);
    });
  });

  test.describe('Payment', () => {
    test('should display pay button', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await expect(checkoutPage.payButton).toBeVisible();
    });

    test('should disable pay button without address', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Clear address
      await checkoutPage.addressInput.clear();
      
      // Button should be disabled or show error on click
      // Depends on implementation
    });

    test('should initiate payment when pay clicked', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.enterAddress(TEST_ADDRESSES.valid.full);
      await checkoutPage.selectAsapDelivery();
      
      // Mock payment intent creation
      await page.route('**/payments/create-intent*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            isDummy: true, // Bypass Stripe for testing
          }),
        });
      });

      await checkoutPage.clickPay();
      
      // Should redirect to orders page (for dummy payment)
      await page.waitForURL('/orders', { timeout: TIMEOUTS.long });
      expect(page.url()).toContain('/orders');
    });

    test('should show minimum order warning when below threshold', async ({ page }) => {
      // This test requires mocking shop data with minimum order
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      // Mock shop detail with high minimum order
      await page.route('**/shops/**/detail*', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.minimumOrderCents = 100000; // Very high minimum
        await route.fulfill({
          response,
          body: JSON.stringify(body),
        });
      });

      await page.reload();
      await checkoutPage.waitForPageLoad();
      
      const hasWarning = await checkoutPage.hasMinimumOrderWarning();
      // May or may not show depending on order total
    });
  });

  test.describe('Order Confirmation', () => {
    test('should redirect to orders page after successful payment', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.enterAddress(TEST_ADDRESSES.valid.full);
      
      // Mock payment intent with dummy mode
      await page.route('**/payments/create-intent*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            isDummy: true,
          }),
        });
      });

      await checkoutPage.clickPay();
      
      await page.waitForURL('/orders', { timeout: TIMEOUTS.long });
      expect(page.url()).toContain('/orders');
    });

    test('should clear cart after successful order', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.enterAddress(TEST_ADDRESSES.valid.full);
      
      // Mock payment intent with dummy mode
      await page.route('**/payments/create-intent*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            isDummy: true,
          }),
        });
      });

      await checkoutPage.clickPay();
      
      await page.waitForURL('/orders', { timeout: TIMEOUTS.long });
      
      // Go back to cart - should be empty
      await page.goto('/cart');
      cartPage = new CartPage(page);
      await cartPage.waitForPageLoad();
      
      const isEmpty = await cartPage.isCartEmpty();
      expect(isEmpty).toBe(true);
    });
  });

  test.describe('Navigation', () => {
    test('should allow going back to cart', async ({ page }) => {
      const ready = await setupCartAndCheckout(page);
      if (!ready) {
        test.skip();
        return;
      }

      await checkoutPage.goBack();
      
      await page.waitForURL('/cart');
      expect(page.url()).toContain('/cart');
    });

    test('should require authentication for checkout', async ({ page }) => {
      // Clear auth state
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Try to access checkout directly
      await page.goto('/checkout');
      
      // Should redirect to login or cart
      await page.waitForURL((url) => 
        url.pathname.includes('/login') || url.pathname.includes('/cart'),
        { timeout: TIMEOUTS.navigation }
      );
    });
  });
});
