import { Page, Locator, expect } from '@playwright/test';
import { waitForElementStable, TIMEOUTS } from '../utils/wait-helpers';

/**
 * Page Object Model for the Login/Authentication page
 * Handles email-based passwordless authentication flow
 */
export class LoginPage {
  readonly page: Page;
  
  // Locators
  readonly emailInput: Locator;
  readonly sendCodeButton: Locator;
  readonly validationCodeInput: Locator;
  readonly verifyCodeButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly loginContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Initialize locators based on the volunteer dashboard structure
    this.emailInput = page.locator('input[type="email"]').first();
    this.sendCodeButton = page.locator('button:has-text("Send Code"), button:has-text("Send Validation Code")');
    // More specific locator for validation code input - it appears after sending code
    this.validationCodeInput = page.getByRole('textbox', { name: /validation code/i });
    this.verifyCodeButton = page.locator('button:has-text("Verify"), button:has-text("Verify Code")');
    this.errorMessage = page.locator('.error, .alert-error, [class*="error"]');
    this.successMessage = page.locator('.success, .alert-success, [class*="success"]');
    this.loginContainer = page.locator('#volunteer-dashboard-root, .login-container, .auth-container');
  }

  /**
   * Navigation Methods
   */

  /**
   * Navigate to the volunteer login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/volunteer');
    await this.page.waitForLoadState('load');
    await this.page.waitForTimeout(500); // Brief wait for any dynamic content
  }

  /**
   * Action Methods
   */

  /**
   * Enter email address in the email input field
   * @param email - Email address to enter
   */
  async enterEmail(email: string): Promise<void> {
    await waitForElementStable(this.page, 'input[type="email"]', { timeout: TIMEOUTS.DEFAULT });
    await this.emailInput.clear();
    await this.emailInput.fill(email);
  }

  /**
   * Click the send code button
   */
  async clickSendCode(): Promise<void> {
    await this.sendCodeButton.click();
    // Wait for the API call to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Enter validation code in the code input field
   * @param code - 6-digit validation code
   */
  async enterValidationCode(code: string): Promise<void> {
    // Wait for the validation code input to be visible and stable
    await this.validationCodeInput.waitFor({ state: 'visible', timeout: TIMEOUTS.DEFAULT });
    await this.validationCodeInput.clear();
    await this.validationCodeInput.fill(code);
  }

  /**
   * Click the verify code button
   */
  async clickVerifyCode(): Promise<void> {
    await this.verifyCodeButton.click();
    // Wait for authentication to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Complete the full login flow with email and validation code
   * @param email - Email address
   * @param code - 6-digit validation code
   */
  async login(email: string, code: string): Promise<void> {
    await this.enterEmail(email);
    await this.clickSendCode();
    await this.enterValidationCode(code);
    await this.clickVerifyCode();
  }

  /**
   * Logout by clearing session storage and navigating away
   */
  async logout(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.removeItem('auth_session_token');
      localStorage.removeItem('auth_user_email');
      localStorage.removeItem('auth_session_expiry');
      sessionStorage.clear();
    });
    await this.page.goto('/');
  }

  /**
   * Assertion Methods
   */

  /**
   * Verify that the email input field is visible
   */
  async expectEmailInputVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a code sent message is displayed
   */
  async expectCodeSentMessage(): Promise<void> {
    // Look for success message or validation code input appearing
    // Use DEFAULT timeout since API calls can take a few seconds
    const codeInputVisible = await this.validationCodeInput.isVisible({ timeout: TIMEOUTS.DEFAULT })
      .catch(() => false);
    
    const successMessageVisible = await this.successMessage.isVisible({ timeout: TIMEOUTS.DEFAULT })
      .catch(() => false);
    
    if (!codeInputVisible && !successMessageVisible) {
      throw new Error('Expected code sent confirmation but neither validation code input nor success message appeared');
    }
  }

  /**
   * Verify that login was successful
   * Checks for session token in localStorage and dashboard visibility
   */
  async expectLoginSuccess(): Promise<void> {
    // Wait for session token to be set
    await this.page.waitForFunction(
      () => localStorage.getItem('auth_session_token') !== null,
      { timeout: TIMEOUTS.LONG }
    );
    
    // Verify session token exists
    const sessionToken = await this.page.evaluate(() => localStorage.getItem('auth_session_token'));
    expect(sessionToken).toBeTruthy();
    
    // Verify we're on the dashboard or authenticated page
    await expect(this.loginContainer).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a specific error message is displayed
   * @param message - Expected error message text (partial match)
   */
  async expectErrorMessage(message: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    const errorText = await this.errorMessage.textContent();
    expect(errorText?.toLowerCase()).toContain(message.toLowerCase());
  }

  /**
   * Verify that no error message is displayed
   */
  async expectNoErrorMessage(): Promise<void> {
    const errorVisible = await this.errorMessage.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    expect(errorVisible).toBe(false);
  }

  /**
   * Verify that the user is authenticated
   * Checks localStorage for session token
   */
  async expectAuthenticated(): Promise<void> {
    const sessionToken = await this.page.evaluate(() => localStorage.getItem('auth_session_token'));
    expect(sessionToken).toBeTruthy();
  }

  /**
   * Verify that the user is not authenticated
   * Checks that localStorage has no session token
   */
  async expectNotAuthenticated(): Promise<void> {
    const sessionToken = await this.page.evaluate(() => localStorage.getItem('auth_session_token'));
    expect(sessionToken).toBeFalsy();
  }

  /**
   * Helper Methods
   */

  /**
   * Get the current session token from localStorage
   * @returns Session token or null if not authenticated
   */
  async getSessionToken(): Promise<string | null> {
    return await this.page.evaluate(() => localStorage.getItem('auth_session_token'));
  }

  /**
   * Get the current user email from localStorage
   * @returns User email or null if not authenticated
   */
  async getUserEmail(): Promise<string | null> {
    return await this.page.evaluate(() => localStorage.getItem('auth_user_email'));
  }

  /**
   * Set session token directly in localStorage (for test setup)
   * @param token - Session token to set
   * @param email - User email to set
   */
  async setSessionToken(token: string, email: string): Promise<void> {
    await this.page.evaluate(
      ({ token, email }) => {
        localStorage.setItem('auth_session_token', token);
        localStorage.setItem('auth_user_email', email);
      },
      { token, email }
    );
  }

  /**
   * Clear all authentication data from storage
   */
  async clearAuthData(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.removeItem('auth_session_token');
      localStorage.removeItem('auth_user_email');
      localStorage.removeItem('auth_session_expiry');
      sessionStorage.clear();
    });
  }

  /**
   * Check if the validation code input is visible
   * @returns True if validation code input is visible
   */
  async isValidationCodeInputVisible(): Promise<boolean> {
    return await this.validationCodeInput.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
  }

  /**
   * Check if the email input is visible
   * @returns True if email input is visible
   */
  async isEmailInputVisible(): Promise<boolean> {
    return await this.emailInput.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
  }
}
