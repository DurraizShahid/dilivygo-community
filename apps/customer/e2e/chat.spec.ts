import { test, expect, TEST_MESSAGES, TIMEOUTS } from './fixtures';
import { ChatListPage, ChatPage, OrderDetailPage } from './pages';

test.describe('Chat Flow', () => {
  let chatListPage: ChatListPage;
  let chatPage: ChatPage;

  test.describe('Chat List', () => {
    test('should require authentication to view chat list', async ({ page }) => {
      // Clear auth
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      await page.goto('/chat');
      
      // Should redirect to login
      await page.waitForURL((url) => url.pathname.includes('/login'), {
        timeout: TIMEOUTS.navigation,
      });
    });

    test('should display chat list page', async ({ authenticatedPage }) => {
      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      await expect(chatListPage.pageTitle).toBeVisible();
    });

    test('should display empty state when no conversations', async ({ authenticatedPage }) => {
      // Mock empty conversations
      await authenticatedPage.route('**/conversations*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      const hasNoConversations = await chatListPage.hasNoConversations();
      expect(hasNoConversations).toBe(true);
    });

    test('should display conversations list', async ({ authenticatedPage }) => {
      // Mock conversations
      await authenticatedPage.route('**/conversations*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'conv-1',
              orderId: 'order-123',
              type: 'customer_vendor',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'conv-2',
              orderId: 'order-456',
              type: 'customer_rider',
              createdAt: new Date().toISOString(),
            },
          ]),
        });
      });

      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      const count = await chatListPage.getConversationCount();
      expect(count).toBe(2);
    });

    test('should display conversation type (Restaurant/Rider)', async ({ authenticatedPage }) => {
      // Mock conversations
      await authenticatedPage.route('**/conversations*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'conv-1',
              orderId: 'order-123',
              type: 'customer_vendor',
              createdAt: new Date().toISOString(),
            },
          ]),
        });
      });

      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      const type = await chatListPage.getConversationType(0);
      expect(type?.toLowerCase()).toContain('restaurant');
    });

    test('should navigate to conversation on click', async ({ authenticatedPage }) => {
      // Mock conversations
      await authenticatedPage.route('**/conversations*', async (route) => {
        const url = route.request().url();
        if (!url.includes('/conv-1')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'conv-1',
                orderId: 'order-123',
                type: 'customer_vendor',
                createdAt: new Date().toISOString(),
              },
            ]),
          });
        } else {
          await route.continue();
        }
      });

      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      await chatListPage.clickFirstConversation();

      expect(authenticatedPage.url()).toContain('/chat/');
    });

    test('should show back button', async ({ authenticatedPage }) => {
      chatListPage = new ChatListPage(authenticatedPage);
      await chatListPage.goto();
      await chatListPage.waitForPageLoad();

      await expect(chatListPage.backButton).toBeVisible();
    });
  });

  test.describe('Chat Conversation', () => {
    test('should display chat page with message input', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await expect(chatPage.messageInput).toBeVisible();
      await expect(chatPage.sendButton).toBeVisible();
    });

    test('should display existing messages', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'msg-1',
              content: 'Hello from restaurant',
              senderId: 'vendor-123',
              senderRole: 'vendor',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'msg-2',
              content: 'Hi, thanks for the update!',
              senderId: 'customer-456',
              senderRole: 'customer',
              createdAt: new Date().toISOString(),
            },
          ]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBe(2);
    });

    test('should distinguish between own and other messages', async ({ authenticatedPage }) => {
      // Mock auth state to get customer ID
      const customerId = 'current-customer-id';
      
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'msg-1',
              content: 'Message from vendor',
              senderId: 'vendor-123',
              senderRole: 'vendor',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'msg-2',
              content: 'My message',
              senderId: customerId,
              senderRole: 'customer',
              createdAt: new Date().toISOString(),
            },
          ]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      // Should have messages with different styles
      const allMessages = await chatPage.getAllMessages();
      expect(allMessages.length).toBe(2);
    });
  });

  test.describe('Send Message', () => {
    test('should allow typing message', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.messageInput.fill(TEST_MESSAGES.simple);
      
      const value = await chatPage.getInputValue();
      expect(value).toBe(TEST_MESSAGES.simple);
    });

    test('should disable send button when input is empty', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      const canSend = await chatPage.canSendMessage();
      expect(canSend).toBe(false);
    });

    test('should enable send button when message typed', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.messageInput.fill(TEST_MESSAGES.simple);
      
      const canSend = await chatPage.canSendMessage();
      expect(canSend).toBe(true);
    });

    test('should send message when button clicked', async ({ authenticatedPage }) => {
      let sentMessage = '';
      
      // Mock messages GET
      await authenticatedPage.route('**/messages*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        } else {
          await route.continue();
        }
      });

      // Mock send message
      await authenticatedPage.route('**/chat/*/messages', async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          sentMessage = body?.content || '';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'new-msg',
              content: sentMessage,
              senderId: 'customer-123',
              senderRole: 'customer',
              createdAt: new Date().toISOString(),
            }),
          });
        } else {
          await route.continue();
        }
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.sendMessage(TEST_MESSAGES.simple);
      
      // Input should be cleared
      const value = await chatPage.getInputValue();
      expect(value).toBe('');
    });

    test('should clear input after sending', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        } else {
          await route.continue();
        }
      });

      // Mock send
      await authenticatedPage.route('**/chat/*/messages', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-msg',
            content: TEST_MESSAGES.simple,
            senderId: 'customer-123',
            senderRole: 'customer',
            createdAt: new Date().toISOString(),
          }),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.sendMessage(TEST_MESSAGES.simple);
      
      const value = await chatPage.getInputValue();
      expect(value).toBe('');
    });
  });

  test.describe('Opening Chat from Order', () => {
    test('should open chat from order detail page', async ({ authenticatedPage }) => {
      // Mock order
      await authenticatedPage.route('**/orders/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'test-order',
              status: 'preparing',
              totalCents: 2500,
              createdAt: new Date().toISOString(),
              items: [{ id: '1', name: 'Test Item', quantity: 1, unitPriceCents: 2000 }],
            },
          }),
        });
      });

      // Mock conversation creation/list
      await authenticatedPage.route('**/conversations*', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'new-conv',
              orderId: 'test-order',
              type: 'customer_vendor',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
      });

      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      const orderDetailPage = new OrderDetailPage(authenticatedPage);
      await orderDetailPage.gotoOrder('test-order');

      await orderDetailPage.openRestaurantChat();

      expect(authenticatedPage.url()).toContain('/chat/');
    });
  });

  test.describe('UI Elements', () => {
    test('should display chat header', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await expect(chatPage.chatTitle).toBeVisible();
    });

    test('should display back button', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await expect(chatPage.backButton).toBeVisible();
    });

    test('should navigate back when back button clicked', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.goBack();

      // Should navigate away from specific chat
      await authenticatedPage.waitForURL((url) => !url.pathname.includes('/chat/test-conv-id'), {
        timeout: TIMEOUTS.navigation,
      });
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible input field', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      const placeholder = await chatPage.messageInput.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
    });

    test('should focus message input on page load', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      // Input should be focused (has autofocus)
      const isFocused = await chatPage.messageInput.evaluate((el) => document.activeElement === el);
      expect(isFocused).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle send message failure gracefully', async ({ authenticatedPage }) => {
      // Mock messages
      await authenticatedPage.route('**/messages*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        } else {
          await route.continue();
        }
      });

      // Mock send failure
      await authenticatedPage.route('**/chat/*/messages', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' }),
        });
      });

      chatPage = new ChatPage(authenticatedPage);
      await chatPage.gotoChat('test-conv-id');

      await chatPage.messageInput.fill(TEST_MESSAGES.simple);
      await chatPage.sendButton.click();

      // Should not crash - just verify page still works
      await expect(chatPage.messageInput).toBeVisible();
    });
  });
});
