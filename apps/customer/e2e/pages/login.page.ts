import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Login Page Object Model
 * Handles phone/email OTP-based authentication flow
 */
export class LoginPage extends BasePage {
  protected readonly path = '/login';

  // Channel selection
  readonly phoneTab: Locator;
  readonly emailTab: Locator;

  // Phone login
  readonly phoneInput: Locator;

  // Email login
  readonly emailInput: Locator;

  // OTP step
  readonly otpInput: Locator;
  readonly verifyButton: Locator;
  readonly changeContactButton: Locator;

  // Common elements
  readonly continueButton: Locator;
  readonly errorAlert: Locator;
  readonly loadingSpinner: Locator;
  readonly debugOtpDisplay: Locator;

  // Recovery flow
  readonly recoveryLink: Locator;
  readonly recoveryEmailInput: Locator;
  readonly recoveryPhoneInput: Locator;
  readonly sendRecoveryButton: Locator;

  constructor(page: Page) {
    super(page);

    // Channel tabs
    this.phoneTab = page.getByRole('button', { name: 'Phone' });
    this.emailTab = page.getByRole('button', { name: 'Email' });

    // Inputs
    this.phoneInput = page.locator('#customer-phone');
    this.emailInput = page.locator('#customer-email');
    this.otpInput = page.locator('#customer-otp');

    // Buttons
    this.continueButton = page.getByRole('button', { name: /continue/i });
    this.verifyButton = page.getByRole('button', { name: /verify/i });
    this.changeContactButton = page.getByRole('button', { name: /change/i });

    // Status elements
    this.errorAlert = page.locator('[role="alert"]');
    this.loadingSpinner = page.locator('.animate-spin');
    this.debugOtpDisplay = page.locator('text=Dev OTP').locator('..');

    // Recovery
    this.recoveryLink = page.getByText("Can't access this phone number?");
    this.recoveryEmailInput = page.locator('#recovery-email');
    this.recoveryPhoneInput = page.locator('#recovery-phone');
    this.sendRecoveryButton = page.getByRole('button', { name: /send recovery/i });
  }

  /**
   * Wait for login page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.phoneInput.or(this.emailInput).waitFor({ state: 'visible', timeout: 10_000 });
  }

  /**
   * Select phone channel for login
   */
  async selectPhoneChannel(): Promise<void> {
    await this.phoneTab.click();
    await this.phoneInput.waitFor({ state: 'visible' });
  }

  /**
   * Select email channel for login
   */
  async selectEmailChannel(): Promise<void> {
    await this.emailTab.click();
    await this.emailInput.waitFor({ state: 'visible' });
  }

  /**
   * Enter phone number in E.164 format
   */
  async enterPhone(phone: string): Promise<void> {
    await this.phoneInput.fill(phone);
  }

  /**
   * Enter email address
   */
  async enterEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  /**
   * Click continue to send OTP
   */
  async clickContinue(): Promise<void> {
    await this.continueButton.click();
  }

  /**
   * Enter OTP code
   */
  async enterOtp(code: string): Promise<void> {
    await this.otpInput.fill(code);
  }

  /**
   * Click verify to complete login
   */
  async clickVerify(): Promise<void> {
    await this.verifyButton.click();
  }

  /**
   * Get the debug OTP displayed in dev mode
   */
  async getDebugOtp(): Promise<string | null> {
    try {
      await this.debugOtpDisplay.waitFor({ state: 'visible', timeout: 5_000 });
      const text = await this.debugOtpDisplay.textContent();
      const match = text?.match(/\d{6}/);
      return match?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get error message from alert
   */
  async getErrorMessage(): Promise<string | null> {
    try {
      await this.errorAlert.waitFor({ state: 'visible', timeout: 5_000 });
      return await this.errorAlert.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Check if error alert is visible
   */
  async isErrorVisible(): Promise<boolean> {
    return await this.errorAlert.isVisible();
  }

  /**
   * Check if on OTP step
   */
  async isOnOtpStep(): Promise<boolean> {
    return await this.otpInput.isVisible();
  }

  /**
   * Complete full phone login flow
   */
  async loginWithPhone(phone: string, otp?: string): Promise<void> {
    await this.selectPhoneChannel();
    await this.enterPhone(phone);
    await this.clickContinue();

    // Wait for OTP step
    await this.otpInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Use provided OTP or get from debug display
    const code = otp ?? (await this.getDebugOtp());
    if (!code) throw new Error('No OTP code available');

    await this.enterOtp(code);
    await this.clickVerify();

    // Wait for redirect away from login
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15_000,
    });
  }

  /**
   * Complete full email login flow
   */
  async loginWithEmail(email: string, otp?: string): Promise<void> {
    await this.selectEmailChannel();
    await this.enterEmail(email);
    await this.clickContinue();

    // Wait for OTP step
    await this.otpInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Use provided OTP or get from debug display
    const code = otp ?? (await this.getDebugOtp());
    if (!code) throw new Error('No OTP code available');

    await this.enterOtp(code);
    await this.clickVerify();

    // Wait for redirect away from login
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15_000,
    });
  }

  /**
   * Start account recovery flow
   */
  async startRecovery(): Promise<void> {
    await this.recoveryLink.click();
    await this.recoveryEmailInput.waitFor({ state: 'visible' });
  }

  /**
   * Enter recovery details
   */
  async enterRecoveryDetails(email: string, newPhone: string): Promise<void> {
    await this.recoveryEmailInput.fill(email);
    await this.recoveryPhoneInput.fill(newPhone);
  }

  /**
   * Submit recovery request
   */
  async submitRecovery(): Promise<void> {
    await this.sendRecoveryButton.click();
  }

  /**
   * Navigate back to contact step
   */
  async goBackToContact(): Promise<void> {
    await this.changeContactButton.click();
  }
}
