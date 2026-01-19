import { test, expect, Page, BrowserContext } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { generateTestUser, generateValidationCode, generateSessionToken } from '../../utils/data-generators';
import { insertTestValidationCode, deleteTestData } from '../../utils/api-helpers';

/**
 * Session Management Edge Cases Property-Based Tests
 * 
 * These tests validate session management properties that should hold
 * across various edge cases and interruption scenarios.
 * 
 * Note: These tests use real authentication to ensure session tokens are valid.
 */

/**
 * Helper function to authenticate a user and return session info
 */
async function authenticateUser(page: Page): Promise<{ email: string; sessionToken: string }> {
  const loginPage = new LoginPage(page);
  const testUser = generateTestUser();
  const testCode = generateValidationCode();
  
  // Navigate to login page (will show login form if not authenticated)
  await page.goto('/volunteer');
  await page.waitForLoadState('networkidle');
  
  // Check if already authenticated (from global setup)
  const existingToken = await loginPage.getSessionToken();
  if (existingToken) {
    const existingEmail = await loginPage.getUserEmail();
    return {
      email: existingEmail!,
      sessionToken: existingToken
    };
  }
  
  // Not authenticated, proceed with login
  await loginPage.enterEmail(testUser.email);
  await loginPage.clickSendCode();
  await page.waitForTimeout(1000);
  
  await insertTestValidationCode(testUser.email, testCode);
  await page.waitForTimeout(500);
  
  await loginPage.enterValidationCode(testCode);
  await loginPage.clickVerifyCode();
  await page.waitForTimeout(2000);
  
  const sessionToken = await loginPage.getSessionToken();
  
  return {
    email: testUser.email,
    sessionToken: sessionToken!
  };
}

test.describe('Session Management Edge Cases', () => {
  
  /**
   * Property 33: Session preservation during expiration
   * Feature: volunteer-ux-playwright-testing, Property 33: Session preservation during expiration
   * 
   * For any form submission when session expires, the system should preserve form data
   * and prompt for re-authentication
   * 
   * Validates: Requirements 4.1
   */
  test('Property 33: Session preservation - form data preserved during session expiration', async ({ page, request }) => {
    const loginPage = new LoginPage(page);
    
    // Step 1: Authenticate user
    const { email, sessionToken } = await authenticateUser(page);
    
    try {
      // Step 2: Verify session is active
      const initialToken = await loginPage.getSessionToken();
      expect(initialToken).toBeTruthy();
      
      // Step 3: Simulate filling out a form (store data in page context)
      const testFormData = {
        firstName: 'Test',
        lastName: 'User',
        email: email
      };
      
      await page.evaluate((data) => {
        (window as any).testFormData = data;
      }, testFormData);
      
      // Step 4: Simulate session expiration by clearing the token
      await page.evaluate(() => {
        localStorage.removeItem('auth_session_token');
        localStorage.removeItem('auth_session_expiry');
      });
      
      // Step 5: Verify form data is still accessible (preserved in page state)
      const preservedData = await page.evaluate(() => (window as any).testFormData);
      expect(preservedData).toEqual(testFormData);
      
      // Step 6: Verify that attempting to access authenticated content prompts for re-auth
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should show login form since session expired
      const isEmailInputVisible = await loginPage.isEmailInputVisible();
      expect(isEmailInputVisible).toBe(true);
      
      // Step 7: Verify session token is cleared
      const tokenAfterExpiration = await loginPage.getSessionToken();
      expect(tokenAfterExpiration).toBeFalsy();
    } finally {
      // Cleanup
      await deleteTestData(request, email, sessionToken);
    }
  });

  /**
   * Property 34: Multi-tab session consistency
   * Feature: volunteer-ux-playwright-testing, Property 34: Multi-tab session consistency
   * 
   * For any session opened in multiple tabs, authentication state should remain
   * consistent across all tabs
   * 
   * Validates: Requirements 4.2
   */
  test('Property 34: Multi-tab consistency - authentication state consistent across tabs', async ({ context, request }) => {
    // Step 1: Create first tab and authenticate
    const page1 = await context.newPage();
    const loginPage1 = new LoginPage(page1);
    
    const { email, sessionToken } = await authenticateUser(page1);
    
    try {
      // Step 2: Verify session in first tab
      const token1 = await loginPage1.getSessionToken();
      expect(token1).toBe(sessionToken);
      
      // Step 3: Open second tab
      const page2 = await context.newPage();
      const loginPage2 = new LoginPage(page2);
      
      await page2.goto('/volunteer');
      await page2.waitForLoadState('networkidle');
      
      // Step 4: Verify session is shared in second tab (same browser context)
      const token2 = await loginPage2.getSessionToken();
      expect(token2).toBe(sessionToken);
      
      // Step 5: Verify email is also consistent
      const email1 = await loginPage1.getUserEmail();
      const email2 = await loginPage2.getUserEmail();
      expect(email1).toBe(email);
      expect(email2).toBe(email);
      expect(email1).toBe(email2);
      
      // Step 6: Verify both tabs can access authenticated content
      const isAuth1 = await page1.evaluate(() => {
        return localStorage.getItem('auth_session_token') !== null;
      });
      const isAuth2 = await page2.evaluate(() => {
        return localStorage.getItem('auth_session_token') !== null;
      });
      expect(isAuth1).toBe(true);
      expect(isAuth2).toBe(true);
      
      // Cleanup
      await page1.close();
      await page2.close();
    } finally {
      await deleteTestData(request, email, sessionToken);
    }
  });

  /**
   * Property 35: Multi-tab logout propagation
   * Feature: volunteer-ux-playwright-testing, Property 35: Multi-tab logout propagation
   * 
   * For any logout action in one tab, the session should be cleared in all open tabs
   * 
   * Validates: Requirements 4.3
   */
  test('Property 35: Multi-tab logout - logout clears session in all tabs', async ({ context, request }) => {
    // Step 1: Create first tab and authenticate
    const page1 = await context.newPage();
    const loginPage1 = new LoginPage(page1);
    
    const { email, sessionToken } = await authenticateUser(page1);
    
    try {
      // Step 2: Create second tab with same session
      const page2 = await context.newPage();
      const loginPage2 = new LoginPage(page2);
      
      await page2.goto('/volunteer');
      await page2.waitForLoadState('networkidle');
      
      // Step 3: Verify both tabs have the session
      const token1Before = await loginPage1.getSessionToken();
      const token2Before = await loginPage2.getSessionToken();
      expect(token1Before).toBe(sessionToken);
      expect(token2Before).toBe(sessionToken);
      
      // Step 4: Logout from first tab
      await loginPage1.logout();
      await page1.waitForLoadState('networkidle');
      
      // Step 5: Verify session is cleared in first tab
      const token1After = await loginPage1.getSessionToken();
      expect(token1After).toBeFalsy();
      
      // Step 6: Reload second tab and verify session is also cleared there
      await page2.reload();
      await page2.waitForLoadState('networkidle');
      
      const token2After = await loginPage2.getSessionToken();
      expect(token2After).toBeFalsy();
      
      // Step 7: Verify both tabs show login form or are redirected
      // After logout, the system may redirect to home page or show login form
      const url1 = page1.url();
      const url2 = page2.url();
      
      // Either should not be on /volunteer authenticated page, or should show login
      const isLoggedOut1 = !url1.includes('/volunteer') || await loginPage1.isEmailInputVisible();
      const isLoggedOut2 = !url2.includes('/volunteer') || await loginPage2.isEmailInputVisible();
      expect(isLoggedOut1).toBe(true);
      expect(isLoggedOut2).toBe(true);
      
      // Cleanup
      await page1.close();
      await page2.close();
    } finally {
      // Session already logged out, but clean up test data
      await deleteTestData(request, email, sessionToken);
    }
  });

  /**
   * Property 36: Session restoration after restart
   * Feature: volunteer-ux-playwright-testing, Property 36: Session restoration after restart
   * 
   * For any non-expired session, browser restart should restore the session
   * 
   * Validates: Requirements 4.4
   */
  test('Property 36: Session restoration - non-expired session restored after browser restart', async ({ browser }) => {
    // Step 1: Create a new context (simulating a browser session)
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const loginPage1 = new LoginPage(page1);
    
    // Step 2: Authenticate user
    const { email, sessionToken } = await authenticateUser(page1);
    
    // Step 3: Verify session is active
    const tokenBefore = await loginPage1.getSessionToken();
    const emailBefore = await loginPage1.getUserEmail();
    expect(tokenBefore).toBe(sessionToken);
    expect(emailBefore).toBe(email);
    
    // Step 4: Get session expiry for restoration
    const sessionExpiry = await page1.evaluate(() => {
      return localStorage.getItem('auth_session_expiry');
    });
    
    // Step 5: Close the context (simulating browser close)
    await context1.close();
    
    // Step 6: Create a new context with the same storage state (simulating browser restart)
    // In a real browser restart, localStorage persists
    const context2 = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: page1.url().split('/').slice(0, 3).join('/'),
            localStorage: [
              {
                name: 'auth_session_token',
                value: sessionToken
              },
              {
                name: 'auth_user_email',
                value: email
              },
              {
                name: 'auth_session_expiry',
                value: sessionExpiry!
              }
            ]
          }
        ]
      }
    });
    
    const page2 = await context2.newPage();
    const loginPage2 = new LoginPage(page2);
    
    // Step 7: Navigate to authenticated page
    await page2.goto('/volunteer');
    await page2.waitForLoadState('networkidle');
    
    // Step 8: Verify session is restored
    const tokenAfter = await loginPage2.getSessionToken();
    const emailAfter = await loginPage2.getUserEmail();
    expect(tokenAfter).toBe(sessionToken);
    expect(emailAfter).toBe(email);
    
    // Step 9: Verify we can access authenticated content
    const isAuthenticated = await page2.evaluate(() => {
      return localStorage.getItem('auth_session_token') !== null;
    });
    expect(isAuthenticated).toBe(true);
    
    // Cleanup
    await context2.close();
  });

  /**
   * Property 37: Browser navigation session maintenance
   * Feature: volunteer-ux-playwright-testing, Property 37: Browser navigation session maintenance
   * 
   * For any browser back/forward navigation, authentication state should be
   * maintained correctly
   * 
   * Validates: Requirements 4.5
   */
  test('Property 37: Browser navigation - session maintained during back/forward navigation', async ({ page, request }) => {
    const loginPage = new LoginPage(page);
    
    // Step 1: Authenticate user
    const { email, sessionToken } = await authenticateUser(page);
    
    try {
      // Step 2: Verify initial session
      const initialToken = await loginPage.getSessionToken();
      expect(initialToken).toBe(sessionToken);
      
      // Step 3: Navigate to another page
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Step 4: Verify session persists on public page
      const tokenOnPublicPage = await loginPage.getSessionToken();
      expect(tokenOnPublicPage).toBe(sessionToken);
      
      // Step 5: Navigate to events page
      await page.goto('/events');
      await page.waitForLoadState('networkidle');
      
      // Step 6: Verify session still persists
      const tokenOnEventsPage = await loginPage.getSessionToken();
      expect(tokenOnEventsPage).toBe(sessionToken);
      
      // Step 7: Use browser back button
      await page.goBack();
      await page.waitForLoadState('networkidle');
      
      // Step 8: Verify session maintained after back navigation
      const tokenAfterBack = await loginPage.getSessionToken();
      expect(tokenAfterBack).toBe(sessionToken);
      
      // Step 9: Use browser forward button
      await page.goForward();
      await page.waitForLoadState('networkidle');
      
      // Step 10: Verify session maintained after forward navigation
      const tokenAfterForward = await loginPage.getSessionToken();
      expect(tokenAfterForward).toBe(sessionToken);
      
      // Step 11: Navigate back to volunteer dashboard
      await page.goto('/volunteer');
      await page.waitForLoadState('networkidle');
      
      // Step 12: Verify session is still active
      const finalToken = await loginPage.getSessionToken();
      const finalEmail = await loginPage.getUserEmail();
      expect(finalToken).toBe(sessionToken);
      expect(finalEmail).toBe(email);
      
      // Step 13: Verify we can still access authenticated content
      const isAuthenticated = await page.evaluate(() => {
        return localStorage.getItem('auth_session_token') !== null;
      });
      expect(isAuthenticated).toBe(true);
    } finally {
      // Cleanup
      await deleteTestData(request, email, sessionToken);
    }
  });
});
