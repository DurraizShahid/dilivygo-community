import { test, expect } from '@playwright/test';

/**
 * Example E2E test to verify Playwright setup
 */
test.describe('App Setup', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Verify page loaded successfully (adjust assertion based on your app)
    await expect(page).toHaveTitle(/.*/);
  });

  test('should have correct base URL', async ({ page }) => {
    await page.goto('/');
    
    // Verify we're on the correct domain
    expect(page.url()).toContain('localhost:3000');
  });
});

test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to be interactive
    await page.waitForLoadState('networkidle');
    
    // Example: Check if main content area exists
    // Adjust selectors based on your application structure
    const mainContent = page.locator('main, #__next, body');
    await expect(mainContent).toBeVisible();
  });
});
