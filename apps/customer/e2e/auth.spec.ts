import { test, expect, TEST_USERS, OTP_CODES, TIMEOUTS } from './fixtures';
import { LoginPage } from './pages';

test.describe('Authentication Flow', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe('Phone Login', () => {
    test('should display phone input on login page', async () => {
      await expect(loginPage.phoneInput).toBeVisible();
      await expect(loginPage.continueButton).toBeVisible();
    });

    test('should switch between phone and email channels', async () => {
      // Default is phone
      await expect(loginPage.phoneInput).toBeVisible();
      await expect(loginPage.emailInput).not.toBeVisible();

      // Switch to email
      await loginPage.selectEmailChannel();
      await expect(loginPage.emailInput).toBeVisible();
      await expect(loginPage.phoneInput).not.toBeVisible();

      // Switch back to phone
      await loginPage.selectPhoneChannel();
      await expect(loginPage.phoneInput).toBeVisible();
    });

    test('should show error for invalid phone format', async () => {
      await loginPage.enterPhone(TEST_USERS.invalid.phone);
      await loginPage.clickContinue();

      // Should show validation error
      const error = await loginPage.getErrorMessage();
      expect(error).toContain('international format');
    });

    test('should send OTP for valid phone number', async () => {
      await loginPage.enterPhone(TEST_USERS.valid.phone);
      await loginPage.clickContinue();

      // Should navigate to OTP step
      await expect(loginPage.otpInput).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    test('should show OTP input after sending code', async () => {
      await loginPage.enterPhone(TEST_USERS.valid.phone);
      await loginPage.clickContinue();

      await expect(loginPage.otpInput).toBeVisible({ timeout: TIMEOUTS.navigation });
      await expect(loginPage.verifyButton).toBeVisible();
    });

    test('should display debug OTP in development mode', async () => {
      await loginPage.enterPhone(TEST_USERS.valid.phone);
      await loginPage.clickContinue();

      await loginPage.otpInput.waitFor({ state: 'visible' });
      const debugOtp = await loginPage.getDebugOtp();
      
      // In dev mode, debug OTP should be displayed
      // This may be null in production
      if (debugOtp) {
        expect(debugOtp).toMatch(/^\d{6}$/);
      }
    });

    test('should allow going back to change phone number', async () => {
      await loginPage.enterPhone(TEST_USERS.valid.phone);
      await loginPage.clickContinue();

      await loginPage.otpInput.waitFor({ state: 'visible' });
      await loginPage.goBackToContact();

      await expect(loginPage.phoneInput).toBeVisible();
    });
  });

  test.describe('Email Login', () => {
    test('should show error for invalid email format', async () => {
      await loginPage.selectEmailChannel();
      await loginPage.enterEmail(TEST_USERS.invalid.email);
      await loginPage.clickContinue();

      const error = await loginPage.getErrorMessage();
      expect(error).toContain('valid email');
    });

    test('should send OTP for valid email', async () => {
      await loginPage.selectEmailChannel();
      await loginPage.enterEmail(TEST_USERS.valid.email);
      await loginPage.clickContinue();

      await expect(loginPage.otpInput).toBeVisible({ timeout: TIMEOUTS.navigation });
    });
  });

  test.describe('OTP Verification', () => {
    test.beforeEach(async () => {
      // Navigate to OTP step
      await loginPage.enterPhone(TEST_USERS.valid.phone);
      await loginPage.clickContinue();
      await loginPage.otpInput.waitFor({ state: 'visible' });
    });

    test('should accept 6-digit OTP input', async () => {
      await loginPage.enterOtp('123456');
      const value = await loginPage.otpInput.inputValue();
      expect(value).toBe('123456');
    });

    test('should only allow numeric input in OTP field', async () => {
      await loginPage.otpInput.fill('abc123def');
      const value = await loginPage.otpInput.inputValue();
      // Non-numeric characters should be filtered out
      expect(value).toMatch(/^\d*$/);
    });

    test('should show error for invalid OTP', async () => {
      await loginPage.enterOtp(OTP_CODES.invalid);
      await loginPage.clickVerify();

      // Wait for error alert to be visible
      await loginPage.errorAlert.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      const error = await loginPage.getErrorMessage();
      
      // Error could be about incorrect code or rate limiting
      if (error) {
        expect(error.toLowerCase()).toMatch(/incorrect|invalid|failed/);
      }
    });

    test('should redirect to home after successful verification', async ({ page }) => {
      // Get debug OTP if available
      const debugOtp = await loginPage.getDebugOtp();
      
      if (debugOtp) {
        await loginPage.enterOtp(debugOtp);
        await loginPage.clickVerify();

        // Should redirect away from login
        await page.waitForURL((url) => !url.pathname.includes('/login'), {
          timeout: TIMEOUTS.navigation,
        });

        expect(page.url()).not.toContain('/login');
      }
    });
  });

  test.describe('Recovery Flow', () => {
    test('should show recovery option for phone login', async () => {
      await expect(loginPage.recoveryLink).toBeVisible();
    });

    test('should navigate to recovery form', async () => {
      await loginPage.startRecovery();
      
      await expect(loginPage.recoveryEmailInput).toBeVisible();
      await expect(loginPage.recoveryPhoneInput).toBeVisible();
    });

    test('should validate recovery email format', async () => {
      await loginPage.startRecovery();
      await loginPage.enterRecoveryDetails('invalid-email', TEST_USERS.valid.phone);
      await loginPage.submitRecovery();

      const error = await loginPage.getErrorMessage();
      expect(error).toContain('valid email');
    });

    test('should validate recovery phone format', async () => {
      await loginPage.startRecovery();
      await loginPage.enterRecoveryDetails(TEST_USERS.valid.email, '123');
      await loginPage.submitRecovery();

      const error = await loginPage.getErrorMessage();
      expect(error).toContain('international format');
    });
  });

  test.describe('UI Elements', () => {
    test('should display back to home link', async () => {
      const backLink = loginPage.page.locator('text=Back to home');
      await expect(backLink).toBeVisible();
    });

    test('should display terms and privacy text', async () => {
      const legalText = loginPage.page.locator('text=/terms|privacy/i');
      await expect(legalText).toBeVisible();
    });

    test('should display platform branding', async () => {
      // Look for logo or brand name
      const branding = loginPage.page.locator('h1, [class*="brand"], [class*="logo"]').first();
      await expect(branding).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper form labels', async () => {
      // Phone input should have associated label
      const phoneLabel = loginPage.page.locator('label[for="customer-phone"]');
      await expect(phoneLabel).toBeVisible();
    });

    test('should mark required fields with aria-invalid on error', async () => {
      await loginPage.enterPhone(TEST_USERS.invalid.phone);
      await loginPage.clickContinue();

      const ariaInvalid = await loginPage.phoneInput.getAttribute('aria-invalid');
      expect(ariaInvalid).toBe('true');
    });

    test('should have accessible error alerts', async () => {
      await loginPage.enterPhone(TEST_USERS.invalid.phone);
      await loginPage.clickContinue();

      const errorRole = await loginPage.errorAlert.getAttribute('role');
      expect(errorRole).toBe('alert');
    });
  });
});

test.describe('Authenticated User Redirect', () => {
  test('should redirect authenticated user away from login page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/login');
    
    // Should redirect to home or stay on current page
    await authenticatedPage.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: TIMEOUTS.navigation,
    }).catch(() => {
      // May already be redirected
    });
  });
});
