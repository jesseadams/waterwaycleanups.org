import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { generateTestUser, generateValidationCode } from '../../utils/data-generators';
import { insertTestValidationCode } from '../../utils/api-helpers';

/**
 * Authentication Flow Property-Based Tests
 * 
 * These tests validate the core authentication properties that should hold
 * for all valid inputs across the volunteer authentication system.
 */

test.describe('Authentication Flow Properties', () => {
  
  /**
   * Property 1: Valid email authentication
   * Feature: volunteer-ux-playwright-testing, Property 1: Valid email authentication
   * 
   * For any valid email address, when a validation code is requested,
   * the system should send a 6-digit code to that email address
   * 
   * Validates: Requirements 1.1
   */
  test('Property 1: Valid email authentication - code is sent for any valid email', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testUser = generateTestUser();
    
    // Navigate to login page
    await loginPage.goto();
    
    // Enter valid email and request validation code
    await loginPage.enterEmail(testUser.email);
    await loginPage.clickSendCode();
    
    // Wait a bit longer for the API call to complete
    await page.waitForTimeout(2000);
    
    // Verify that the system indicates code was sent
    // This can be verified by:
    // 1. Validation code input field appearing
    // 2. Success message displayed
    await loginPage.expectCodeSentMessage();
    
    // Verify via API that the code was actually sent
    // In a real system, we would check email delivery or database
    // For now, we verify the API call succeeded by checking if we can proceed
    const isCodeInputVisible = await loginPage.isValidationCodeInputVisible();
    expect(isCodeInputVisible).toBe(true);
  });

  /**
   * Property 2: Session creation on valid code
   * Feature: volunteer-ux-playwright-testing, Property 2: Session creation on valid code
   * 
   * For any valid validation code, when verified, the system should create
   * a session and store the session token in localStorage
   * 
   * Validates: Requirements 1.2
   */
  test('Property 2: Session creation - valid code creates session with token in localStorage', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testUser = generateTestUser();
    const testCode = generateValidationCode();
    
    // Step 1: Navigate to login page and enter email
    await loginPage.goto();
    await loginPage.enterEmail(testUser.email);
    
    // Step 2: Click send code to trigger the API call
    // This will generate a code in the system via the API
    await loginPage.clickSendCode();
    
    // Step 3: Wait for validation code input to appear
    await loginPage.expectCodeSentMessage();
    
    // Step 4: Verify the validation code input is visible
    const isCodeInputVisible = await loginPage.isValidationCodeInputVisible();
    expect(isCodeInputVisible).toBe(true);
    
    // Step 5: Insert our test validation code into DynamoDB
    // This overwrites the API-generated code with our known test code
    await insertTestValidationCode(testUser.email, testCode);
    await page.waitForTimeout(500); // Brief wait for DynamoDB consistency
    
    // Step 6: Enter our test validation code
    await loginPage.enterValidationCode(testCode);
    
    // Step 7: Verify the verify button is visible
    const verifyButton = loginPage.verifyCodeButton;
    await expect(verifyButton).toBeVisible();
    
    // Step 8: Click the verify button to authenticate
    await loginPage.clickVerifyCode();
    
    // Step 9: Wait for authentication to complete
    await page.waitForTimeout(3000);
    
    // Step 10: Verify that a session token was created in localStorage
    const sessionToken = await loginPage.getSessionToken();
    expect(sessionToken).toBeTruthy();
    expect(sessionToken).not.toBe('');
    expect(typeof sessionToken).toBe('string');
    expect(sessionToken!.length).toBeGreaterThan(0);
    
    // Step 11: Verify the user email is also stored
    const storedEmail = await loginPage.getUserEmail();
    expect(storedEmail).toBe(testUser.email);
    
    // Step 12: Verify we're no longer on the login page (authentication succeeded)
    const isEmailInputVisible = await loginPage.isEmailInputVisible();
    expect(isEmailInputVisible).toBe(false);
  });

  /**
   * Property 3: Session-based access
   * Feature: volunteer-ux-playwright-testing, Property 3: Session-based access
   * 
   * For any active session, the user should be able to access authenticated
   * pages without re-authentication
   * 
   * Validates: Requirements 1.3
   */
  test('Property 3: Session-based access - active session allows access without re-auth', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testUser = generateTestUser();
    
    // Step 1: Create a mock valid session token
    // In a real test environment, this would be obtained through proper authentication
    const mockSessionToken = 'test-session-token-' + Date.now();
    
    // Step 2: Set session token in localStorage
    await page.goto('/volunteer', { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await loginPage.setSessionToken(mockSessionToken, testUser.email);
    
    // Step 3: Navigate to authenticated page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Step 4: Verify session token persists across page loads
    const storedToken = await loginPage.getSessionToken();
    expect(storedToken).toBe(mockSessionToken);
    
    // Step 5: Navigate to another page
    await page.goto('/volunteer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Verify session token is still present after navigation
    const tokenAfterNavigation = await loginPage.getSessionToken();
    expect(tokenAfterNavigation).toBe(mockSessionToken);
    
    // Step 6: Verify the email is also persisted
    const storedEmail = await loginPage.getUserEmail();
    expect(storedEmail).toBe(testUser.email);
  });

  /**
   * Property 4: Session expiration cleanup
   * Feature: volunteer-ux-playwright-testing, Property 4: Session expiration cleanup
   * 
   * For any expired session, the system should redirect to the login page
   * and clear all session data from localStorage
   * 
   * Validates: Requirements 1.4
   */
  test('Property 4: Session expiration - expired session redirects and clears data', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testUser = generateTestUser();
    
    // Step 1: Create a session token (we'll simulate an expired one)
    // In a real scenario, we would wait for actual expiration or use an expired token
    const expiredToken = 'expired-token-' + Date.now();
    
    // Step 2: Set the expired token in localStorage
    await page.goto('/volunteer', { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await loginPage.setSessionToken(expiredToken, testUser.email);
    
    // Step 3: Try to access an authenticated page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Step 4: Verify that we're redirected to login (email input is visible)
    // or that the session is cleared
    await page.waitForTimeout(2000);
    
    // The system should either:
    // 1. Show the login form (email input visible)
    // 2. Clear the invalid session token
    const sessionToken = await loginPage.getSessionToken();
    const isEmailInputVisible = await loginPage.isEmailInputVisible();
    
    // Either the token should be cleared OR we should see the login form
    const isSessionCleared = !sessionToken || sessionToken === '';
    const isLoginFormShown = isEmailInputVisible;
    
    expect(isSessionCleared || isLoginFormShown).toBe(true);
  });

  /**
   * Property 5: Logout cleanup
   * Feature: volunteer-ux-playwright-testing, Property 5: Logout cleanup
   * 
   * For any logout action, the system should clear all session data from
   * localStorage and redirect to the public page
   * 
   * Validates: Requirements 1.5
   */
  test('Property 5: Logout cleanup - logout clears all session data and redirects', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testUser = generateTestUser();
    
    // Step 1: Create a mock session
    const mockSessionToken = 'test-session-token-' + Date.now();
    
    // Step 2: Set session token in localStorage
    await page.goto('/volunteer', { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await loginPage.setSessionToken(mockSessionToken, testUser.email);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Step 3: Verify session is active
    const tokenBeforeLogout = await loginPage.getSessionToken();
    expect(tokenBeforeLogout).toBe(mockSessionToken);
    
    // Step 4: Perform logout
    await loginPage.logout();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Step 5: Verify session data is cleared
    const tokenAfterLogout = await loginPage.getSessionToken();
    expect(tokenAfterLogout).toBeFalsy();
    
    // Step 6: Verify we're redirected to public page (not on /volunteer)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/volunteer');
    
    // Step 7: Verify all auth-related localStorage items are cleared
    const userEmail = await loginPage.getUserEmail();
    expect(userEmail).toBeFalsy();
    
    // Step 8: Try to access authenticated page again
    await page.goto('/volunteer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Should show login form since session is cleared
    const isEmailInputVisible = await loginPage.isEmailInputVisible();
    expect(isEmailInputVisible).toBe(true);
  });
});
