import { test as base, Page } from '@playwright/test';
import { generateTestUser, generateValidationCode } from '../utils/data-generators';
import { sendValidationCode, verifyCode, deleteTestData } from '../utils/api-helpers';

/**
 * Authentication Fixture
 * 
 * Provides an authenticated page context with session token and user email.
 * Automatically handles authentication setup and cleanup.
 * 
 * Usage:
 * ```typescript
 * test('should access dashboard', async ({ authenticatedPage, userEmail }) => {
 *   await authenticatedPage.goto('/volunteer');
 *   // User is already authenticated
 * });
 * ```
 */

export interface AuthFixture {
  /**
   * Page object with authenticated session
   */
  authenticatedPage: Page;
  
  /**
   * Session token stored in localStorage
   */
  sessionToken: string;
  
  /**
   * Email of the authenticated user
   */
  userEmail: string;
}

/**
 * Extended test with authentication fixture
 */
export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page, request }, use) => {
    // Generate unique test user
    const testUser = generateTestUser();
    const userEmail = testUser.email;
    
    let sessionToken = '';
    
    try {
      // Step 1: Send validation code
      await sendValidationCode(request, userEmail);
      
      // Step 2: For testing, we use a known validation code
      // In a real scenario, this would be retrieved from email or test database
      // For now, we'll use a mock code that the test environment accepts
      const validationCode = process.env.TEST_VALIDATION_CODE || '123456';
      
      // Step 3: Verify code and get session token
      sessionToken = await verifyCode(request, userEmail, validationCode);
      
      // Step 4: Set session token in localStorage
      await page.goto('/volunteer');
      await page.evaluate((token) => {
        localStorage.setItem('sessionToken', token);
      }, sessionToken);
      
      // Step 5: Reload page to apply authentication
      await page.reload();
      
      // Wait for authentication to be processed
      await page.waitForLoadState('networkidle');
      
      // Provide authenticated page to test
      await use(page);
      
    } finally {
      // Cleanup: Clear session data
      try {
        await page.evaluate(() => {
          localStorage.removeItem('sessionToken');
          sessionStorage.clear();
        });
      } catch (error) {
        console.error('Error clearing session data:', error);
      }
      
      // Cleanup: Delete test data
      try {
        await deleteTestData(request, userEmail);
      } catch (error) {
        console.error('Error deleting test data:', error);
      }
    }
  },
  
  sessionToken: async ({ authenticatedPage }, use) => {
    // Extract session token from localStorage
    const token = await authenticatedPage.evaluate(() => {
      return localStorage.getItem('sessionToken') || '';
    });
    
    await use(token);
  },
  
  userEmail: async ({ authenticatedPage }, use) => {
    // Extract user email from page context or localStorage
    // This assumes the email is stored or can be derived from the session
    const email = await authenticatedPage.evaluate(() => {
      // Try to get email from localStorage or session storage
      return localStorage.getItem('userEmail') || 
             sessionStorage.getItem('userEmail') || 
             '';
    });
    
    await use(email);
  },
});

export { expect } from '@playwright/test';
