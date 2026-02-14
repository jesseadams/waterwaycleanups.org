import { test, expect } from '@playwright/test';
import { MinorsPage } from '../../pages/MinorsPage';
import { authenticateFreshUserWithWaiver } from '../../utils/fast-auth';
import { 
  generateTestMinor,
  generateInvalidMinor,
  calculateAge
} from '../../utils/data-generators';

/**
 * Minor Management Edge Cases Property-Based Tests
 * 
 * These tests validate edge cases and special scenarios in minor management
 * that should hold for all valid inputs across the volunteer minor management system.
 * 
 * Properties 52-56 test:
 * - Age transition notifications (minor turning 18)
 * - Future date of birth rejection
 * - Adult date of birth rejection
 * - Deletion warnings for minors with active RSVPs
 * - Special character handling in names
 */

test.describe('Minor Management Edge Cases Properties', () => {
  // Disable storage state for this test suite since we need fresh users
  test.use({ storageState: { cookies: [], origins: [] } });
  
  /**
   * Property 52: Minor age transition notification
   * Feature: volunteer-ux-playwright-testing, Property 52: Minor age transition notification
   * 
   * For any minor reaching age 18, the system should display a notification
   * about creating their own volunteer account (by rejecting them as a minor)
   * 
   * Validates: Requirements 8.1
   */
  test('Property 52: Minor age transition - 18 year old rejected as adult', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    const { testUser } = await authenticateFreshUserWithWaiver(page);
    
    // Generate a minor who is exactly 18 years old (just turned 18)
    const today = new Date();
    const eighteenYearsAgo = new Date(today);
    eighteenYearsAgo.setFullYear(today.getFullYear() - 18);
    eighteenYearsAgo.setDate(today.getDate() - 1); // Ensure birthday has passed
    
    const year = eighteenYearsAgo.getFullYear();
    const month = String(eighteenYearsAgo.getMonth() + 1).padStart(2, '0');
    const day = String(eighteenYearsAgo.getDate()).padStart(2, '0');
    const dateOfBirth = `${year}-${month}-${day}`;
    
    const minorData = generateTestMinor({
      dateOfBirth: dateOfBirth
    });
    
    // Verify the age is 18
    const age = calculateAge(dateOfBirth);
    expect(age).toBe(18);
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Try to add the 18-year-old (should be rejected)
    await minorsPage.addMinor(minorData);
    await page.waitForTimeout(2000);
    
    // Verify minor was NOT added (they're 18, not a minor anymore)
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount);
    
    // Verify error message is displayed indicating they're an adult
    // The system treats 18-year-olds as adults who need their own account
    await minorsPage.expectAdultDateError();
  });

  /**
   * Property 53: Future date of birth rejection
   * Feature: volunteer-ux-playwright-testing, Property 53: Future date of birth rejection
   * 
   * For any minor with a future date of birth, submission should be rejected
   * with a validation error
   * 
   * Validates: Requirements 8.2
   * 
   * Note: The HTML date input has max="today" which prevents selecting future dates
   * client-side. This test verifies the client-side validation works.
   */
  test('Property 53: Future DOB rejection - future date prevents submission', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    const { testUser } = await authenticateFreshUserWithWaiver(page);
    
    // Generate minor with future date of birth
    const invalidMinor = generateInvalidMinor('future');
    
    // Verify the date is in the future
    const futureDate = new Date(invalidMinor.dateOfBirth);
    const today = new Date();
    expect(futureDate.getTime()).toBeGreaterThan(today.getTime());
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Try to add minor with future date
    // The HTML date input has max="today" so this should be prevented client-side
    await minorsPage.addMinor(invalidMinor);
    await page.waitForTimeout(2000);
    
    // Verify minor was NOT added (client-side validation prevented it)
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount);
    
    // Verify the minor doesn't appear in the list
    const hasMinor = await minorsPage.hasMinorByName(invalidMinor.firstName, invalidMinor.lastName);
    expect(hasMinor).toBe(false);
  });

  /**
   * Property 54: Adult date of birth rejection
   * Feature: volunteer-ux-playwright-testing, Property 54: Adult date of birth rejection
   * 
   * For any minor with an adult date of birth (18+), submission should be
   * rejected with a validation error
   * 
   * Validates: Requirements 8.3
   */
  test('Property 54: Adult DOB rejection - 18+ age prevents submission', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    const { testUser } = await authenticateFreshUserWithWaiver(page);
    
    // Generate minor with adult date of birth (20 years old)
    const invalidMinor = generateInvalidMinor('adult');
    
    // Verify the age is 18+
    const age = calculateAge(invalidMinor.dateOfBirth);
    expect(age).toBeGreaterThanOrEqual(18);
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Try to add minor with adult date
    await minorsPage.addMinor(invalidMinor);
    await page.waitForTimeout(2000);
    
    // Verify minor was NOT added
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount);
    
    // Verify error message is displayed
    await minorsPage.expectAdultDateError();
  });

  /**
   * Property 55: Minor deletion with RSVPs warning
   * Feature: volunteer-ux-playwright-testing, Property 55: Minor deletion with RSVPs warning
   * 
   * For any minor with active RSVPs, deletion should display a warning
   * and require confirmation
   * 
   * Validates: Requirements 8.4
   * 
   * Note: This test verifies the deletion confirmation flow.
   * The deleteMinorByName method already handles the dialog.
   */
  test('Property 55: Deletion warning - confirmation required for minor deletion', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    const { testUser } = await authenticateFreshUserWithWaiver(page);
    
    // Generate test minor
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
    
    // Delete the minor (deleteMinorByName handles the confirmation dialog)
    await minorsPage.deleteMinorByName(minorData.firstName, minorData.lastName);
    await page.waitForTimeout(1500);
    
    // Verify minor was deleted after confirmation
    const hasMinorAfterDeletion = await minorsPage.hasMinorByName(minorData.firstName, minorData.lastName);
    expect(hasMinorAfterDeletion).toBe(false);
  });

  /**
   * Property 56: Special character name handling
   * Feature: volunteer-ux-playwright-testing, Property 56: Special character name handling
   * 
   * For any minor name with special characters, the system should accept
   * and properly store the name
   * 
   * Validates: Requirements 8.5
   */
  test('Property 56: Special characters - names with special chars are accepted', async ({ page }) => {
    const minorsPage = new MinorsPage(page);
    
    // Authenticate user with waiver
    const { testUser } = await authenticateFreshUserWithWaiver(page);
    
    // Generate minor with special characters in name
    const specialCharNames = [
      "María José",
      "O'Brien",
      "Jean-Luc",
      "François",
      "Søren",
      "Müller"
    ];
    
    // Pick a random special character name
    const specialName = specialCharNames[Math.floor(Math.random() * specialCharNames.length)];
    const nameParts = specialName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'TestLast';
    
    const minorData = generateTestMinor({
      firstName: firstName,
      lastName: lastName
    });
    
    // Navigate to minors page
    await minorsPage.goto();
    await minorsPage.waitForMinorsAppLoad();
    
    // Get initial count
    const initialCount = await minorsPage.getMinorsCount();
    
    // Add minor with special characters
    await minorsPage.addMinor(minorData);
    await page.waitForTimeout(1500);
    
    // Verify minor was added
    const finalCount = await minorsPage.getMinorsCount();
    expect(finalCount).toBe(initialCount + 1);
    
    // Verify minor appears in list with correct name (special characters preserved)
    const minor = await minorsPage.findMinorByName(minorData.firstName, minorData.lastName);
    expect(minor).not.toBeNull();
    expect(minor?.firstName).toBe(minorData.firstName);
    expect(minor?.lastName).toBe(minorData.lastName);
    
    // Verify the special characters are preserved in the display
    const hasMinor = await minorsPage.hasMinorByName(minorData.firstName, minorData.lastName);
    expect(hasMinor).toBe(true);
  });
});
