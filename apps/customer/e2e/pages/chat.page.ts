import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Chat List Page Object Model
 * Handles conversation list view
 */
export class ChatListPage extends BasePage {
  protected readonly path = '/chat';

  // Header
  readonly backButton: Locator;
  readonly pageTitle: Locator;

  // Conversation list
  readonly conversationCards: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeleton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.pageTitle = page.locator('h1').filter({ hasText: /messages/i });

    // Conversation list
    this.conversationCards = page.locator('a[href*="/chat/"]').filter({ has: page.locator('text=Order #') });
    this.emptyState = page.locator('text=No conversations').locator('..');
    this.loadingSkeleton = page.locator('.animate-pulse').first();
  }

  /**
   * Wait for chat list page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for conversations or empty state
    await Promise.race([
      this.conversationCards.first().waitFor({ state: 'visible', timeout: 10_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10_000 }),
      this.loadingSkeleton.waitFor({ state: 'hidden', timeout: 10_000 }),
    ]).catch(() => {});
  }

  /**
   * Check if conversation list is empty
   */
  async hasNoConversations(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Get conversation count
   */
  async getConversationCount(): Promise<number> {
    return await this.conversationCards.count();
  }

  /**
   * Click on conversation by index
   */
  async clickConversationByIndex(index: number): Promise<void> {
    await this.conversationCards.nth(index).click();
    await this.page.waitForURL(/\/chat\/[^/]+$/);
  }

  /**
   * Click on first conversation
   */
  async clickFirstConversation(): Promise<void> {
    await this.clickConversationByIndex(0);
  }

  /**
   * Get conversation type by index (Restaurant or Rider)
   */
  async getConversationType(index: number): Promise<string | null> {
    return await this.conversationCards.nth(index).locator('.font-semibold').textContent();
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }
}

/**
 * Chat Page Object Model
 * Handles individual chat conversation
 */
export class ChatPage extends BasePage {
  protected readonly path = '/chat';

  // Header
  readonly backButton: Locator;
  readonly chatTitle: Locator;

  // Messages
  readonly messagesContainer: Locator;
  readonly messageItems: Locator;
  readonly myMessages: Locator;
  readonly otherMessages: Locator;
  readonly loadingSkeleton: Locator;

  // Input
  readonly messageInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.backButton = page.getByRole('button', { name: /go back/i });
    this.chatTitle = page.locator('h2').filter({ hasText: /chat/i });

    // Messages
    this.messagesContainer = page.locator('.overflow-y-auto.px-4.py-4');
    this.messageItems = page.locator('.rounded-2xl.px-4.py-2');
    this.myMessages = page.locator('.justify-end').locator('.rounded-2xl.bg-primary');
    this.otherMessages = page.locator('.justify-start').locator('.rounded-2xl.bg-muted');
    this.loadingSkeleton = page.locator('.animate-pulse').first();

    // Input
    this.messageInput = page.getByPlaceholder(/type a message/i);
    this.sendButton = page.getByRole('button').filter({ has: page.locator('svg') }).last();
  }

  /**
   * Navigate to chat page
   */
  async gotoChat(conversationId: string): Promise<void> {
    await this.page.goto(`/chat/${conversationId}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for chat page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.messageInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /**
   * Send a message
   */
  async sendMessage(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.sendButton.click();
    // Wait for the sent message to appear in the message list
    const sentMessage = this.myMessages.filter({ hasText: text });
    await sentMessage.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  }

  /**
   * Get all messages
   */
  async getAllMessages(): Promise<string[]> {
    const messages = await this.messageItems.all();
    const texts: string[] = [];
    for (const msg of messages) {
      const text = await msg.textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }

  /**
   * Get my messages
   */
  async getMyMessages(): Promise<string[]> {
    const messages = await this.myMessages.all();
    const texts: string[] = [];
    for (const msg of messages) {
      const text = await msg.textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }

  /**
   * Get message count
   */
  async getMessageCount(): Promise<number> {
    return await this.messageItems.count();
  }

  /**
   * Check if message exists
   */
  async messageExists(text: string): Promise<boolean> {
    const message = this.messageItems.filter({ hasText: text });
    return await message.isVisible();
  }

  /**
   * Verify message was sent
   */
  async verifySentMessage(text: string): Promise<void> {
    const message = this.myMessages.filter({ hasText: text });
    await expect(message).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Wait for new message to appear
   */
  async waitForNewMessage(timeout = 10_000): Promise<void> {
    const initialCount = await this.getMessageCount();
    await this.page.waitForFunction(
      (expected) => {
        const messages = document.querySelectorAll('.rounded-2xl.px-4.py-2');
        return messages.length > expected;
      },
      initialCount,
      { timeout }
    );
  }

  /**
   * Check if input is enabled
   */
  async canSendMessage(): Promise<boolean> {
    return await this.sendButton.isEnabled();
  }

  /**
   * Clear message input
   */
  async clearInput(): Promise<void> {
    await this.messageInput.clear();
  }

  /**
   * Get current input value
   */
  async getInputValue(): Promise<string> {
    return await this.messageInput.inputValue();
  }
}
