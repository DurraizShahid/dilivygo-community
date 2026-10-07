import { Page, Locator, expect } from '@playwright/test';

/**
 * Base Page Object Model class
 * All page objects should extend this class to inherit common functionality
 */
export abstract class BasePage {
  /**
   * The Playwright page instance
   */
  readonly page: Page;

  /**
   * The base URL for this page (relative path)
   */
  protected abstract readonly path: string;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to this page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForPageLoad();
  }

  /**
   * Navigate to this page with query parameters
   */
  async gotoWithParams(params: Record<string, string>): Promise<void> {
    const searchParams = new URLSearchParams(params);
    await this.page.goto(`${this.path}?${searchParams.toString()}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the page to fully load
   * Override in child classes for custom wait conditions
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the current page URL
   */
  getUrl(): string {
    return this.page.url();
  }

  /**
   * Get the current page path (without base URL)
   */
  getPath(): string {
    const url = new URL(this.page.url());
    return url.pathname;
  }

  /**
   * Get query parameter from current URL
   */
  getQueryParam(name: string): string | null {
    const url = new URL(this.page.url());
    return url.searchParams.get(name);
  }

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Assert that the page is currently active
   */
  async assertOnPage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path));
  }

  /**
   * Wait for a selector to be visible
   */
  async waitForSelector(selector: string, timeout?: number): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Wait for text to appear on the page
   */
  async waitForText(text: string, timeout?: number): Promise<void> {
    await this.page.getByText(text).waitFor({ state: 'visible', timeout });
  }

  /**
   * Click an element by selector
   */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /**
   * Click an element by text
   */
  async clickByText(text: string): Promise<void> {
    await this.page.getByText(text).click();
  }

  /**
   * Click a button by text
   */
  async clickButton(text: string): Promise<void> {
    await this.page.getByRole('button', { name: text }).click();
  }

  /**
   * Click a link by text
   */
  async clickLink(text: string): Promise<void> {
    await this.page.getByRole('link', { name: text }).click();
  }

  /**
   * Fill an input field
   */
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Fill an input field by label
   */
  async fillByLabel(label: string, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Fill an input field by placeholder
   */
  async fillByPlaceholder(placeholder: string, value: string): Promise<void> {
    await this.page.getByPlaceholder(placeholder).fill(value);
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  /**
   * Check a checkbox
   */
  async check(selector: string): Promise<void> {
    await this.page.check(selector);
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(selector: string): Promise<void> {
    await this.page.uncheck(selector);
  }

  /**
   * Check if an element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isVisible();
  }

  /**
   * Check if text is visible on the page
   */
  async isTextVisible(text: string): Promise<boolean> {
    return await this.page.getByText(text).isVisible();
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string | null> {
    return await this.page.locator(selector).textContent();
  }

  /**
   * Get all text contents matching a selector
   */
  async getAllTexts(selector: string): Promise<string[]> {
    return await this.page.locator(selector).allTextContents();
  }

  /**
   * Get input value
   */
  async getInputValue(selector: string): Promise<string> {
    return await this.page.locator(selector).inputValue();
  }

  /**
   * Get attribute value of an element
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    return await this.page.locator(selector).getAttribute(attribute);
  }

  /**
   * Count elements matching a selector
   */
  async count(selector: string): Promise<number> {
    return await this.page.locator(selector).count();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for a specific URL pattern
   */
  async waitForUrl(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  /**
   * Take a screenshot of the page
   */
  async screenshot(name: string): Promise<Buffer> {
    return await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * Scroll to an element
   */
  async scrollTo(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Press a keyboard key
   */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * Type text character by character
   */
  async type(selector: string, text: string, delay?: number): Promise<void> {
    await this.page.locator(selector).type(text, { delay });
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<void> {
    await this.page.hover(selector);
  }

  /**
   * Focus on an element
   */
  async focus(selector: string): Promise<void> {
    await this.page.focus(selector);
  }

  /**
   * Wait for a specific amount of time.
   * @deprecated Use this as a LAST RESORT only. Prefer using:
   * - `await expect(element).toBeVisible()` for element visibility
   * - `await page.waitForURL(pattern)` for navigation
   * - `await page.waitForLoadState('networkidle')` for network activity
   * - `await page.waitForResponse(url)` for API responses
   * - `await locator.waitFor({ state: 'visible' })` for specific elements
   * @param ms - Time to wait in milliseconds
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Execute JavaScript in the browser context
   */
  async evaluate<T>(fn: () => T): Promise<T> {
    return await this.page.evaluate(fn);
  }

  /**
   * Assert element is visible
   */
  async assertVisible(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  /**
   * Assert element is hidden
   */
  async assertHidden(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeHidden();
  }

  /**
   * Assert element has specific text
   */
  async assertText(selector: string, text: string): Promise<void> {
    await expect(this.page.locator(selector)).toHaveText(text);
  }

  /**
   * Assert element contains specific text
   */
  async assertContainsText(selector: string, text: string): Promise<void> {
    await expect(this.page.locator(selector)).toContainText(text);
  }

  /**
   * Assert input has specific value
   */
  async assertInputValue(selector: string, value: string): Promise<void> {
    await expect(this.page.locator(selector)).toHaveValue(value);
  }

  /**
   * Assert element count
   */
  async assertCount(selector: string, count: number): Promise<void> {
    await expect(this.page.locator(selector)).toHaveCount(count);
  }

  /**
   * Get a locator for a selector
   */
  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Get by role
   */
  getByRole(role: Parameters<Page['getByRole']>[0], options?: Parameters<Page['getByRole']>[1]): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * Get by text
   */
  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator {
    return this.page.getByText(text, options);
  }

  /**
   * Get by test ID
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * Get by label
   */
  getByLabel(label: string | RegExp, options?: { exact?: boolean }): Locator {
    return this.page.getByLabel(label, options);
  }

  /**
   * Get by placeholder
   */
  getByPlaceholder(placeholder: string | RegExp, options?: { exact?: boolean }): Locator {
    return this.page.getByPlaceholder(placeholder, options);
  }
}
