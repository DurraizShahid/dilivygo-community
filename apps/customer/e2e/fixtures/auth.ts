import { test as base, Page, BrowserContext, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Authentication state storage path
 */
const AUTH_STATE_PATH = path.join(__dirname, '../../.playwright-auth-state.json');

/**
 * User credentials for testing (OTP-based auth)
 */
export interface TestUser {
  phone: string;
  name?: string;
}

/**
 * Default test user credentials
 * Uses UK test phone number format
 */
export const DEFAULT_TEST_USER: TestUser = {
  phone: '+447700900000',
  name: 'Test User',
};

/**
 * Extended test fixtures with authentication support
 */
export interface AuthFixtures {
  /** Authenticated page instance */
  authenticatedPage: Page;
  /** Authenticated browser context */
  authenticatedContext: BrowserContext;
  /** Login helper function */
  login: (user?: TestUser) => Promise<void>;
  /** Logout helper function */
  logout: () => Promise<void>;
}

/**
 * Login helper that performs OTP-based authentication via UI
 */
async function performLogin(page: Page, user: TestUser): Promise<void> {
  // Navigate to login page
  await page.goto('/login');
  
  // Wait for phone input to be visible
  const phoneInput = page.locator('#customer-phone');
  await phoneInput.waitFor({ state: 'visible', timeout: 10_000 });

  // Enter phone number
  await phoneInput.fill(user.phone);

  // Click continue to send OTP
  const continueButton = page.getByRole('button', { name: /continue/i });
  await continueButton.click();

  // Wait for OTP input to appear
  const otpInput = page.locator('#customer-otp');
  await otpInput.waitFor({ state: 'visible', timeout: 15_000 });

  // Look for Dev OTP displayed on the page (shown in dev mode)
  const debugOtpDisplay = page.locator('text=Dev OTP').locator('..');
  let otpCode: string | null = null;
  
  try {
    await debugOtpDisplay.waitFor({ state: 'visible', timeout: 5_000 });
    const text = await debugOtpDisplay.textContent();
    const match = text?.match(/\d{6}/);
    otpCode = match?.[0] ?? null;
  } catch {
    // Dev OTP not available, use a fallback test code
    otpCode = '123456';
  }

  if (!otpCode) {
    throw new Error('Could not obtain OTP code for login');
  }

  // Enter the OTP
  await otpInput.fill(otpCode);

  // Click verify button
  const verifyButton = page.getByRole('button', { name: /verify/i });
  await verifyButton.click();

  // Wait for successful login - redirect away from login page
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  });
}

/**
 * Logout helper that clears authentication state
 */
async function performLogout(page: Page): Promise<void> {
  // Navigate to logout or clear session
  // Adjust based on your app's logout mechanism
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Clear cookies
  const context = page.context();
  await context.clearCookies();
  
  // Navigate to home page
  await page.goto('/');
}

/**
 * Save authentication state to file
 */
async function saveAuthState(context: BrowserContext): Promise<void> {
  const storageState = await context.storageState();
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(storageState, null, 2));
}

/**
 * Load authentication state from file if exists
 */
function loadAuthState(): string | undefined {
  if (fs.existsSync(AUTH_STATE_PATH)) {
    return AUTH_STATE_PATH;
  }
  return undefined;
}

/**
 * Clear stored authentication state
 */
export function clearAuthState(): void {
  if (fs.existsSync(AUTH_STATE_PATH)) {
    fs.unlinkSync(AUTH_STATE_PATH);
  }
}

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  // Authenticated browser context
  authenticatedContext: async ({ browser }, use) => {
    const storedAuth = loadAuthState();
    const context = await browser.newContext(
      storedAuth ? { storageState: storedAuth } : undefined
    );
    
    await use(context);
    await context.close();
  },

  // Authenticated page
  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },

  // Login helper
  login: async ({ page, context }, use) => {
    const loginFn = async (user: TestUser = DEFAULT_TEST_USER) => {
      await performLogin(page, user);
      await saveAuthState(context);
    };
    await use(loginFn);
  },

  // Logout helper
  logout: async ({ page }, use) => {
    const logoutFn = async () => {
      await performLogout(page);
      clearAuthState();
    };
    await use(logoutFn);
  },
});

/**
 * Re-export expect from playwright test
 */
export { expect } from '@playwright/test';

/**
 * Setup authenticated state before tests
 * Use this in a global setup file
 */
export async function globalAuthSetup(
  browser: Browser | undefined,
  user: TestUser = DEFAULT_TEST_USER
): Promise<void> {
  if (!browser) return;
  const context = await browser.newContext();
  
  const page = await context.newPage();
  
  try {
    await performLogin(page, user);
    await saveAuthState(context);
  } finally {
    await context.close();
  }
}
