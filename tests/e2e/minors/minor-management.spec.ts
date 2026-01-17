import { test, expect } from '@playwright/test';
import { MinorsPage } from '../../pages/MinorsPage';
import { LoginPage } from '../../pages/LoginPage';
import { WaiverPage } from '../../pages/WaiverPage';
import { 
  generateTestUser, 
  generateValidationCode, 
  generateWaiverData,
  generateTestMinor,
  calculateAge
} from '../../utils/data-generators';
import { insertTestValidationCode } from '../../utils/api-helpers';

/**
 * Minor Management Property-Based Tests
 * 
 * These tests validate the core minor management properties that should hold
 * for all valid inputs across the volunteer minor management system.
 * 
 * Note: These tests require authentication and a valid waiver before managing minors.
 */

test.describe('Minor Management Properties', () => {
  // Disable storage state for this test suite since we need fresh users
  test.use({ storageState: { cookies: [], origins: [] } });
  
  /**
   * Helper function to authenticate a fresh user and submit waiver
   */
  async function authenticateUserWithWaiver(page: any) {
    const loginPage = new LoginPage(page);
    const waiverPage = new WaiverPage(page);
    const testUser = generateTestUser();
    const testCode = generateValidationCode();
    
    // Step 1: Authenticate
    await page.goto('/volunteer');
    await page.waitForLoadState('networkidle');
    await loginPage.enterEmail(testUser.email);
    await loginPage.clickSendCode();
    await page.waitForTimeout(2000);
    await insertTestValidationCode(testUser.email, testCode);
    await page.waitForTimeout(500);
    await loginPage.enterValidationCode(testCode);
    await loginPage.clickVerifyCode();
    await page.waitForTimeout(3000);
    
    // Verify all auth data is set
    const authData = await page.evaluate(() => ({
      sessionToken: localStorage.getItem('auth_session_token'),
      userEmail: localStorage.getItem('auth_user_email'),
      sessionExpiry: localStorage.getItem('auth_session_expiry')
    }));
    
    if (!authData.sessionToken || !authData.userEmail || !authData.sessionExpiry) {
      console.error('Auth data missing:', authData);
      throw new Error('Authentication data not properly set');
    }
    
    // Step 2: Submit waiver (required before managing minors)
    const waiverData = generateWaiverData(testUser);
    await waiverPage.goto();
    await waiverPage.fillWaiverForm(waiverData);
    await waiverPage.submitWaiver();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Verify we're on the dashboard (waiver submitted successfully)
    const currentUrl = page.url();
    if (!currentUrl.includes('/volunteer')) {
      throw new Error('Waiver submission did not redirect to dashboard');
    }
    
    // Verify auth data is still present after waiver submission
    const authDataAfterWaiver = await page.evaluate(() => ({
      sessionToken: localStorage.getItem('auth_session_token'),
      userEmail: localStorage.getItem('auth_user_email'),
      sessionExpiry: localStorage.getItem('auth_session_expiry')
    }));
    
    if (!authDataAfterWaiver.sessionToken || !authDataAfterWaiver.userEmail || !authDataAfterWaiver.sessionExpiry) {
      console.error('Auth data lost after waiver:', authDataAfterWaiver);
      throw new Error('Authentication data lost after waiver submission');
    }
    
    return testUser;
  }
  
  /**
   * Property 15: Minor creation
   * Feature: volunteer-ux-playwright-testing, Property 15: Minor creation
   * 
   * For any authenticated guardian with complete minor data, submission should
   * create a minor record linked to the guardian's email
   * 
   * Validates: Requirements 4.1
   */
  test('Property 15: Minor creation - complete minor data creates linked record', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    await authenticateUserWithWaiver(page);
    
    // Generate test minor data
    const minorData = generateTestMinor();
    
    // Navigate to dashboard (where minors management is)
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Add minor
    await minorsPage.addMinor(minorData);
    
    // Wait for the list to update
    await page.waitForTimeout(1500);
    
    // Verify minor was added
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount + 1);
    
    // Verify minor appears in list with correct data
    await minorsPage.expectMinorByNameInList(minorData.firstName, minorData.lastName);
    
    // Verify the minor data is correct
    const minor = await minorsPage.findMinorByName(minorData.firstName, minorData.lastName);
    expect(minor).not.toBeNull();
    expect(minor?.firstName).toBe(minorData.firstName);
    expect(minor?.lastName).toBe(minorData.lastName);
    expect(minor?.dateOfBirth).toBe(minorData.dateOfBirth);
  });

  /**
   * Property 16: Minor age calculation
   * Feature: volunteer-ux-playwright-testing, Property 16: Minor age calculation
   * 
   * For any minor in the system, the displayed age should be correctly
   * calculated from the date of birth
   * 
   * Validates: Requirements 4.2
   */
  test('Property 16: Minor age calculation - age is correctly calculated from DOB', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    await authenticateUserWithWaiver(page);
    
    // Generate test minor data
    const minorData = generateTestMinor();
    const expectedAge = calculateAge(minorData.dateOfBirth);
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Add minor
    await minorsPage.addMinor(minorData);
    
    // Wait for the list to update
    await page.waitForTimeout(1500);
    
    // Get the minor from the list
    const minor = await minorsPage.findMinorByName(minorData.firstName, minorData.lastName);
    
    // Verify age is calculated correctly
    expect(minor).not.toBeNull();
    expect(minor?.age).toBe(expectedAge);
    
    // Also verify using the helper method
    if (minor) {
      expect(minorsPage.isAgeCorrect(minor)).toBe(true);
    }
  });

  /**
   * Property 17: Minor update persistence
   * Feature: volunteer-ux-playwright-testing, Property 17: Minor update persistence
   * 
   * For any valid minor update, the changes should persist and be reflected
   * in the minors list
   * 
   * Validates: Requirements 4.3
   * 
   * Note: This test is currently limited because the UI doesn't have an update
   * feature implemented yet. This test documents the expected behavior.
   */
  test.skip('Property 17: Minor update - changes persist in minors list', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    await authenticateUserWithWaiver(page);
    
    // Generate test minor data
    const minorData = generateTestMinor();
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Add minor
    await minorsPage.addMinor(minorData);
    await page.waitForTimeout(1500);
    
    // Get the minor from the list
    const minor = await minorsPage.findMinorByName(minorData.firstName, minorData.lastName);
    expect(minor).not.toBeNull();
    
    // Update minor data (when UI is implemented)
    // const updatedData = { firstName: 'Updated' };
    // await minorsPage.updateMinor(minor!.minorId, updatedData);
    
    // Verify changes persisted
    // const updatedMinor = await minorsPage.findMinorByName('Updated', minorData.lastName);
    // expect(updatedMinor).not.toBeNull();
    // expect(updatedMinor?.firstName).toBe('Updated');
  });

  /**
   * Property 18: Minor deletion
   * Feature: volunteer-ux-playwright-testing, Property 18: Minor deletion
   * 
   * For any minor deletion request, the system should remove the minor record
   * and update the minors list
   * 
   * Validates: Requirements 4.4
   */
  test('Property 18: Minor deletion - minor is removed from list', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    await authenticateUserWithWaiver(page);
    
    // Generate test minor data
    const minorData = generateTestMinor();
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Add minor
    await minorsPage.addMinor(minorData);
    await page.waitForTimeout(1500);
    
    // Verify minor was added
    const hasMinor = await minorsPage.hasMinorByName(minorData.firstName, minorData.lastName);
    expect(hasMinor).toBe(true);
    
    // Get count before deletion
    const countBeforeDeletion = await minorsPage.getMinorsCount();
    
    // Delete the minor
    await minorsPage.deleteMinorByName(minorData.firstName, minorData.lastName);
    await page.waitForTimeout(1500);
    
    // Verify minor was removed
    const hasMinorAfterDeletion = await minorsPage.hasMinorByName(minorData.firstName, minorData.lastName);
    expect(hasMinorAfterDeletion).toBe(false);
    
    // Verify count decreased
    const countAfterDeletion = await minorsPage.getMinorsCount();
    expect(countAfterDeletion).toBe(countBeforeDeletion - 1);
  });

  /**
   * Property 19: Minor date validation
   * Feature: volunteer-ux-playwright-testing, Property 19: Minor date validation
   * 
   * For any invalid date of birth, minor submission should be prevented with
   * validation errors displayed
   * 
   * Validates: Requirements 4.5
   */
  test('Property 19: Minor date validation - invalid DOB prevents submission', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    await authenticateUserWithWaiver(page);
    
    // Generate minor with future date of birth (invalid)
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateString = futureDate.toISOString().split('T')[0];
    
    const invalidMinorData = generateTestMinor({
      dateOfBirth: futureDateString
    });
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Try to add minor with invalid date
    await minorsPage.addMinor(invalidMinorData);
    
    // Wait for potential error message
    await page.waitForTimeout(2000);
    
    // Verify minor was NOT added (count should remain the same)
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount);
    
    // Verify error message is displayed or form validation prevented submission
    const errorVisible = await minorsPage.errorMessage.isVisible({ timeout: 2000 })
      .catch(() => false);
    
    const validationErrorVisible = await minorsPage.validationError.isVisible({ timeout: 2000 })
      .catch(() => false);
    
    // Either an error message should be visible OR the minor should not have been added
    const hasMinor = await minorsPage.hasMinorByName(invalidMinorData.firstName, invalidMinorData.lastName);
    
    // At least one of these should be true: error shown OR minor not added
    expect(errorVisible || validationErrorVisible || !hasMinor).toBe(true);
  });
});
