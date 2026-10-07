import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for the Dilivygo customer web application.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Directory containing test files
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Global timeout for each test
  timeout: 30_000,

  // Timeout for expect() assertions
  expect: {
    timeout: 5_000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for the customer application
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'retain-on-failure',

    // Browser context options
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    // Home shop list requires lat/lon for server-side geofence filtering
    permissions: ["geolocation"],
    geolocation: { latitude: 51.5074, longitude: -0.1278 },
  },

  // Configure projects for major browsers and mobile viewports
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'mobile-safari-landscape',
      use: { ...devices['iPhone 12 landscape'] },
    },

    // Tablet viewport
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],

  // Output directory for test artifacts
  outputDir: 'test-results/',

  // Run local dev server before starting the tests
  // Set SKIP_WEB_SERVER=1 if you have a server already running
  webServer: process.env.SKIP_WEB_SERVER ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
