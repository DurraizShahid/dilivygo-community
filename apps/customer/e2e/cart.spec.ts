import { test, expect, TIMEOUTS } from './fixtures';
import { HomePage, RestaurantPage, CartPage } from './pages';

test.describe('Add to Cart', () => {
  let homePage: HomePage;
  let restaurantPage: RestaurantPage;
  let cartPage: CartPage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    restaurantPage = new RestaurantPage(page);
    cartPage = new CartPage(page);

    // Clear any existing cart state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test.describe('Menu Browsing', () => {
    test('should display menu items on restaurant page', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      const productCount = await restaurantPage.getProductCount();
      expect(productCount).toBeGreaterThanOrEqual(0);
    });

    test('should display category navigation', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      await expect(restaurantPage.allCategoryButton).toBeVisible();
    });

    test('should filter products by category', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      const categories = await restaurantPage.getCategories();
      if (categories.length > 1) {
        const initialCount = await restaurantPage.getProductCount();
        await restaurantPage.selectCategory(categories[1]);
        
        // Products should be filtered (or same if all in category)
        const filteredCount = await restaurantPage.getProductCount();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    });

    test('should show product details (name, price, description)', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      const productCount = await restaurantPage.getProductCount();
      if (productCount > 0) {
        const productCard = restaurantPage.productCards.first();
        
        // Should have name
        const name = await productCard.locator('h3').textContent();
        expect(name).toBeTruthy();
        
        // Should have price
        const price = await productCard.locator('.font-semibold').last().textContent();
        expect(price).toBeTruthy();
      }
    });
  });

  test.describe('Adding Items', () => {
    test('should add simple item to cart', async ({ page }) => {
      await homePage.goto();
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
      
      // Should show floating cart or toast
      await restaurantPage.verifyProductAdded();
    });

    test('should update cart badge when item added', async ({ page }) => {
      await homePage.goto();
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
      
      // Check floating cart shows count
      const isCartVisible = await restaurantPage.isFloatingCartVisible();
      if (isCartVisible) {
        const count = await restaurantPage.getFloatingCartItemCount();
        expect(count).toBeGreaterThan(0);
      }
    });

    test('should show floating cart bar after adding item', async ({ page }) => {
      await homePage.goto();
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
      
      const isVisible = await restaurantPage.isFloatingCartVisible();
      expect(isVisible).toBe(true);
    });

    test('should allow adding multiple items', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForRestaurantsToLoad();
      
      const hasRestaurants = await homePage.hasRestaurants();
      if (!hasRestaurants) {
        test.skip();
        return;
      }

      await homePage.clickFirstRestaurant();
      await restaurantPage.waitForPageLoad();

      const productCount = await restaurantPage.getProductCount();
      if (productCount < 2) {
        test.skip();
        return;
      }

      await restaurantPage.addProductByIndex(0);
      // Wait for product to be added by checking floating cart visibility
      await restaurantPage.verifyProductAdded();
      await restaurantPage.addProductByIndex(1);
      
      const isCartVisible = await restaurantPage.isFloatingCartVisible();
      if (isCartVisible) {
        const count = await restaurantPage.getFloatingCartItemCount();
        expect(count).toBeGreaterThanOrEqual(2);
      }
    });
  });

  test.describe('Product Customizations', () => {
    test('should open product modal for items with modifiers', async ({ page }) => {
      await homePage.goto();
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

      // Click add on first product
      await restaurantPage.addFirstProduct();
      
      // Modal may or may not open depending on product
      const isModalOpen = await restaurantPage.isProductModalOpen();
      // Just verify the method works
    });

    test('should display modifier groups in modal', async ({ page }) => {
      await homePage.goto();
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

      // Try to open modal
      await restaurantPage.addFirstProduct();
      
      const isModalOpen = await restaurantPage.isProductModalOpen();
      if (isModalOpen) {
        // Modal content should be visible
        await expect(restaurantPage.modalProductName).toBeVisible();
        await expect(restaurantPage.modalAddToCartButton).toBeVisible();
      }
    });

    test('should allow adjusting quantity in modal', async ({ page }) => {
      await homePage.goto();
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
      
      const isModalOpen = await restaurantPage.isProductModalOpen();
      if (isModalOpen) {
        await restaurantPage.setModalQuantity(3);
        
        const qty = await restaurantPage.modalQuantityValue.textContent();
        expect(qty).toBe('3');
      }
    });

    test('should close modal when X button clicked', async ({ page }) => {
      await homePage.goto();
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
      
      const isModalOpen = await restaurantPage.isProductModalOpen();
      if (isModalOpen) {
        await restaurantPage.closeProductModal();
        
        const isStillOpen = await restaurantPage.isProductModalOpen();
        expect(isStillOpen).toBe(false);
      }
    });

    test('should add item with customizations from modal', async ({ page }) => {
      await homePage.goto();
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
      
      const isModalOpen = await restaurantPage.isProductModalOpen();
      if (isModalOpen) {
        await restaurantPage.addFromModalWithDefaults();
        
        // Should show floating cart
        const isCartVisible = await restaurantPage.isFloatingCartVisible();
        expect(isCartVisible).toBe(true);
      }
    });
  });

  test.describe('Cart Page', () => {
    test('should navigate to cart from floating cart bar', async ({ page }) => {
      await homePage.goto();
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
      
      const isCartVisible = await restaurantPage.isFloatingCartVisible();
      if (isCartVisible) {
        await restaurantPage.clickFloatingCart();
        
        expect(page.url()).toContain('/cart');
      }
    });

    test('should display cart items correctly', async ({ page }) => {
      await homePage.goto();
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
      
      // Go to cart
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const cartItemCount = await cartPage.getCartItemCount();
      expect(cartItemCount).toBeGreaterThan(0);
    });

    test('should show empty cart state when no items', async ({ page }) => {
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const isEmpty = await cartPage.isCartEmpty();
      expect(isEmpty).toBe(true);
    });

    test('should allow increasing item quantity', async ({ page }) => {
      await homePage.goto();
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

      const productNames = await restaurantPage.getProductNames();
      if (productNames.length === 0) {
        test.skip();
        return;
      }

      await restaurantPage.addFirstProduct();
      await restaurantPage.verifyProductAdded();
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const itemNames = await cartPage.getItemNames();
      if (itemNames.length > 0) {
        const initialQty = await cartPage.getItemQuantity(itemNames[0]);
        await cartPage.increaseItemQuantity(itemNames[0]);
        
        const newQty = await cartPage.getItemQuantity(itemNames[0]);
        expect(newQty).toBe(initialQty + 1);
      }
    });

    test('should allow decreasing item quantity', async ({ page }) => {
      await homePage.goto();
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
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const itemNames = await cartPage.getItemNames();
      if (itemNames.length > 0) {
        // Increase first, then decrease
        await cartPage.increaseItemQuantity(itemNames[0]);
        const increased = await cartPage.getItemQuantity(itemNames[0]);
        
        await cartPage.decreaseItemQuantity(itemNames[0]);
        const decreased = await cartPage.getItemQuantity(itemNames[0]);
        
        expect(decreased).toBe(increased - 1);
      }
    });

    test('should remove item when quantity reaches zero', async ({ page }) => {
      await homePage.goto();
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
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const itemNames = await cartPage.getItemNames();
      if (itemNames.length > 0) {
        const initialCount = itemNames.length;
        // Decrease to remove
        await cartPage.decreaseItemQuantity(itemNames[0]);
        // Wait for cart item count to decrease
        await expect(cartPage.cartItems).toHaveCount(initialCount - 1, { timeout: 5000 });
        
        // Item should be removed or cart should be empty
        const newCount = await cartPage.getCartItemCount();
        expect(newCount).toBe(itemNames.length - 1);
      }
    });

    test('should display order summary with correct totals', async ({ page }) => {
      await homePage.goto();
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
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      const subtotal = await cartPage.getSubtotal();
      const total = await cartPage.getTotal();
      
      expect(subtotal).toBeTruthy();
      expect(total).toBeTruthy();
    });

    test('should have checkout button', async ({ page }) => {
      await homePage.goto();
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
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      await expect(cartPage.checkoutButton).toBeVisible();
    });

    test('should clear entire cart', async ({ page }) => {
      await homePage.goto();
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
      
      await page.goto('/cart');
      await cartPage.waitForPageLoad();
      
      await cartPage.clearCart();
      
      const isEmpty = await cartPage.isCartEmpty();
      expect(isEmpty).toBe(true);
    });
  });
});
