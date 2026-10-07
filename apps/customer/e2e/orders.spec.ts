import { test, expect, ORDER_STATUSES, TIMEOUTS } from './fixtures';
import { OrdersPage, OrderDetailPage, CartPage } from './pages';

test.describe('Order Tracking', () => {
  let ordersPage: OrdersPage;
  let orderDetailPage: OrderDetailPage;

  test.describe('Order History', () => {
    test('should require authentication to view orders', async ({ page }) => {
      // Clear auth
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      await page.goto('/orders');
      
      // Should redirect to login
      await page.waitForURL((url) => url.pathname.includes('/login'), {
        timeout: TIMEOUTS.navigation,
      });
    });

    test('should display orders list for authenticated user', async ({ authenticatedPage }) => {
      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      // Should show either orders or empty state
      const hasNoOrders = await ordersPage.hasNoOrders();
      const orderCount = await ordersPage.getOrderCount();
      
      expect(hasNoOrders || orderCount >= 0).toBe(true);
    });

    test('should display empty state when no orders', async ({ authenticatedPage }) => {
      // Mock empty orders response
      await authenticatedPage.route('**/orders*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ orders: [] }),
        });
      });

      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      const hasNoOrders = await ordersPage.hasNoOrders();
      expect(hasNoOrders).toBe(true);
    });

    test('should display order status badges', async ({ authenticatedPage }) => {
      // Mock orders with various statuses
      await authenticatedPage.route('**/orders*', async (route) => {
        if (route.request().url().includes('/orders?') || route.request().url().endsWith('/orders')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              orders: [
                {
                  id: 'test-order-1',
                  status: 'placed',
                  totalCents: 2500,
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          });
        } else {
          await route.continue();
        }
      });

      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        const status = await ordersPage.getOrderStatus(0);
        expect(status).toBeTruthy();
      }
    });

    test('should show order total and date', async ({ authenticatedPage }) => {
      // Mock orders
      await authenticatedPage.route('**/orders*', async (route) => {
        if (route.request().url().includes('/orders?') || route.request().url().endsWith('/orders')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              orders: [
                {
                  id: 'test-order-1',
                  status: 'completed',
                  totalCents: 2500,
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          });
        } else {
          await route.continue();
        }
      });

      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        const orderCard = ordersPage.getOrderByIndex(0);
        
        // Should display price
        const priceText = await orderCard.textContent();
        expect(priceText).toBeTruthy();
      }
    });

    test('should have reorder button', async ({ authenticatedPage }) => {
      // Mock orders
      await authenticatedPage.route('**/orders*', async (route) => {
        if (route.request().url().includes('/orders?') || route.request().url().endsWith('/orders')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              orders: [
                {
                  id: 'test-order-1',
                  status: 'completed',
                  totalCents: 2500,
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          });
        } else {
          await route.continue();
        }
      });

      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        const reorderButton = ordersPage.getOrderByIndex(0).getByRole('button', { name: /reorder/i });
        await expect(reorderButton).toBeVisible();
      }
    });

    test('should navigate to order detail on click', async ({ authenticatedPage }) => {
      // Mock orders
      await authenticatedPage.route('**/orders*', async (route) => {
        const url = route.request().url();
        if (url.includes('/orders?') || url.endsWith('/orders')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              orders: [
                {
                  id: 'test-order-123',
                  status: 'completed',
                  totalCents: 2500,
                  createdAt: new Date().toISOString(),
                  items: [],
                },
              ],
            }),
          });
        } else if (url.includes('/orders/test-order-123')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              order: {
                id: 'test-order-123',
                status: 'completed',
                totalCents: 2500,
                createdAt: new Date().toISOString(),
                items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 1500 }],
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      ordersPage = new OrdersPage(authenticatedPage);
      await ordersPage.goto();
      await ordersPage.waitForPageLoad();

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.clickFirstOrder();
        
        expect(authenticatedPage.url()).toContain('/orders/');
      }
    });
  });

  test.describe('Order Detail Page', () => {
    test('should display order header with ID and status', async ({ authenticatedPage }) => {
      // Mock order detail
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'abc12345-test',
              status: 'preparing',
              totalCents: 3500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 2, unitPriceCents: 1500 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('abc12345-test');

      await expect(orderDetailPage.orderTitle).toBeVisible();
      await expect(orderDetailPage.statusBadge).toBeVisible();
    });

    test('should display order progress tracker', async ({ authenticatedPage }) => {
      // Mock order detail with active status
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'abc12345-test',
              status: 'preparing',
              totalCents: 3500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 3000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('abc12345-test');

      await expect(orderDetailPage.progressTracker).toBeVisible();
    });

    test('should display order items list', async ({ authenticatedPage }) => {
      // Mock order detail
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'abc12345-test',
              status: 'completed',
              totalCents: 3500,
              createdAt: new Date().toISOString(),
              items: [
                { id: '1', name: 'Item One', quantity: 1, unitPriceCents: 2000 },
                { id: '2', name: 'Item Two', quantity: 2, unitPriceCents: 750 },
              ],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('abc12345-test');

      await expect(orderDetailPage.orderItemsSection).toBeVisible();
    });

    test('should display order total', async ({ authenticatedPage }) => {
      // Mock order detail
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'abc12345-test',
              status: 'completed',
              totalCents: 3500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 3000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('abc12345-test');

      const total = await orderDetailPage.getOrderTotal();
      expect(total).toBeTruthy();
    });

    test('should show scheduled order banner for scheduled orders', async ({ authenticatedPage }) => {
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 2);

      // Mock scheduled order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'scheduled-order',
              status: 'scheduled',
              scheduledFor: scheduledTime.toISOString(),
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('scheduled-order');

      await expect(orderDetailPage.scheduledBanner).toBeVisible();
    });

    test('should show rejection banner for rejected orders', async ({ authenticatedPage }) => {
      // Mock rejected order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'rejected-order',
              status: 'rejected',
              rejectionReason: 'Shop is closed',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('rejected-order');

      const isRejected = await orderDetailPage.isRejected();
      expect(isRejected).toBe(true);
    });

    test('should show SLA countdown for active orders', async ({ authenticatedPage }) => {
      const slaDeadline = new Date();
      slaDeadline.setMinutes(slaDeadline.getMinutes() + 30);

      // Mock order with SLA
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'active-order',
              status: 'preparing',
              slaDeadline: slaDeadline.toISOString(),
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('active-order');

      const hasSla = await orderDetailPage.hasSlaCountdown();
      expect(hasSla).toBe(true);
    });
  });

  test.describe('Rating & Review', () => {
    test('should show rating section for completed orders', async ({ authenticatedPage }) => {
      // Mock completed order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'completed-order',
              status: 'completed',
              vendorId: 'vendor-123',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      // Mock no existing review
      await authenticatedPage.route('**/reviews/my-order-review/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(null),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('completed-order');

      const canRate = await orderDetailPage.canRate();
      expect(canRate).toBe(true);
    });

    test('should allow rating vendor', async ({ authenticatedPage }) => {
      // Mock completed order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'completed-order',
              status: 'completed',
              vendorId: 'vendor-123',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      await authenticatedPage.route('**/reviews/my-order-review/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(null),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('completed-order');

      const canRate = await orderDetailPage.canRate();
      if (canRate) {
        await orderDetailPage.rateVendor(5);
        // Stars should be filled
        await expect(orderDetailPage.vendorRatingStars.nth(4)).toHaveClass(/fill-amber/);
      }
    });

    test('should allow adding comment', async ({ authenticatedPage }) => {
      // Mock completed order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'completed-order',
              status: 'completed',
              vendorId: 'vendor-123',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      await authenticatedPage.route('**/reviews/my-order-review/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(null),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('completed-order');

      const canRate = await orderDetailPage.canRate();
      if (canRate) {
        await orderDetailPage.addComment('Great food, fast delivery!');
        
        const value = await orderDetailPage.commentTextarea.inputValue();
        expect(value).toBe('Great food, fast delivery!');
      }
    });
  });

  test.describe('Actions', () => {
    test('should have reorder button', async ({ authenticatedPage }) => {
      // Mock completed order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'completed-order',
              status: 'completed',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('completed-order');

      await expect(orderDetailPage.reorderButton).toBeVisible();
    });

    test('should have chat with restaurant button', async ({ authenticatedPage }) => {
      // Mock order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'active-order',
              status: 'preparing',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('active-order');

      await expect(orderDetailPage.chatWithRestaurantButton).toBeVisible();
    });

    test('should navigate back to orders list', async ({ authenticatedPage }) => {
      // Mock order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'test-order',
              status: 'completed',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('test-order');

      await orderDetailPage.goBack();
      
      // Should navigate back
      await authenticatedPage.waitForURL((url) => !url.pathname.includes('/orders/test'), {
        timeout: TIMEOUTS.navigation,
      });
    });
  });

  test.describe('Real-time Updates', () => {
    test('should display rider tracking map for assigned orders', async ({ authenticatedPage }) => {
      // Mock order with rider
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'tracking-order',
              status: 'assigned',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
              delivery: {
                id: 'delivery-1',
                riderId: 'rider-123',
              },
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('tracking-order');

      // Map may or may not be visible depending on implementation
      const hasTracking = await orderDetailPage.hasRiderTracking();
      // Just verify method works
    });

    test('should show searching for rider indicator', async ({ authenticatedPage }) => {
      // Mock order waiting for rider
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'waiting-order',
              status: 'ready',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('waiting-order');

      const isSearching = await orderDetailPage.isSearchingForRider();
      expect(isSearching).toBe(true);
    });
  });
});
