import { test, expect } from '@playwright/test';
import { WaiverPage } from '../../pages/WaiverPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { LoginPage } from '../../pages/LoginPage';
import { 
  generateTestUser, 
  generateValidationCode, 
  generateWaiverData,
  generateExpiredWaiver,
  generateWaiverExpiringIn,
  getTodayDate,
  getDateOneYearFromNow
} from '../../utils/data-generators';
import { 
  insertTestValidationCode,
  setWaiverExpiration,
  deleteTestData
} from '../../utils/api-helpers';

/**
 * Waiver Lifecycle Property-Based Tests
 * 
 * These tests validate the waiver lifecycle properties including expiration,
 * renewal, and status display that should hold for all valid inputs across
 * the volunteer waiver system.
 * 
 * Note: These tests require authentication before managing waivers.
 */

test.describe('Waiver Lifecycle Properties', () => {
  // Disable storage state for this test suite since we need fresh users
  test.use({ storageState: { cookies: [], origins: [] } });
  
  /**
   * Helper function to authenticate a fresh user and submit waiver
   * Reused from minor-management.spec.ts pattern
   */
  async function authenticateUserWithWaiver(page: any) {
    const loginPage = new LoginPage(page);
    const waiverPage = new WaiverPage(page);
    const testUser = generateTestUser();
    const testCode = generateValidationCode();
    
    // Step 1: Authenticate
    await page.goto('/volunteer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
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
    
    // Step 2: Submit waiver (required before managing waivers)
    const waiverData = generateWaiverData(testUser);
    await waiverPage.goto();
    await waiverPage.fillWaiverForm(waiverData);
    await waiverPage.submitWaiver();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
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
   * Property 29: Expired waiver dashboard prompt
   * Feature: volunteer-ux-playwright-testing, Property 29: Expired waiver dashboard prompt
   * 
   * For any volunteer with an expired waiver, the dashboard should display a
   * prominent renewal prompt
   * 
   * Validates: Requirements 3.1
   */
  test('Property 29: Expired waiver dashboard prompt - expired waiver shows renewal prompt', async ({ page, request }) => {
    const dashboardPage = new DashboardPage(page);
    let testUser: any;
    let sessionToken: string;
    
    try {
      // Authenticate user with waiver
      testUser = await authenticateUserWithWaiver(page);
      
      // Get session token for cleanup
      sessionToken = await page.evaluate(() => localStorage.getItem('auth_session_token') || '');
      
      // Set waiver expiration to past date (2 years ago)
      const expiredDate = new Date();
      expiredDate.setFullYear(expiredDate.getFullYear() - 2);
      const expiredDateStr = expiredDate.toISOString().split('T')[0];
      
      await setWaiverExpiration(testUser.email, expiredDateStr);
      
      // Reload dashboard to see expired waiver state
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await page.waitForTimeout(2000);
      
      // Verify renewal prompt is displayed
      await dashboardPage.expectRenewalPrompt();
      
      // Verify waiver is marked as expired
      await dashboardPage.expectWaiverExpired();
      
      console.log('✅ Property 29: Expired waiver shows renewal prompt');
    } finally {
      // Cleanup
      if (testUser && sessionToken) {
        await deleteTestData(request, testUser.email, sessionToken);
      }
    }
  });

  /**
   * Property 30: Waiver renewal expiration update
   * Feature: volunteer-ux-playwright-testing, Property 30: Waiver renewal expiration update
   * 
   * For any waiver renewal submission, the expiration date should be set to
   * exactly one year from submission date
   * 
   * Validates: Requirements 3.2
   */
  test('Property 30: Waiver renewal expiration update - renewal sets expiration to one year', async ({ page, request }) => {
    const waiverPage = new WaiverPage(page);
    const dashboardPage = new DashboardPage(page);
    let testUser: any;
    let sessionToken: string;
    
    try {
      // Authenticate user with expired waiver
      testUser = await authenticateUserWithWaiver(page);
      
      // Get session token for cleanup
      sessionToken = await page.evaluate(() => localStorage.getItem('auth_session_token') || '');
      
      // Set waiver expiration to past date
      const expiredDate = new Date();
      expiredDate.setFullYear(expiredDate.getFullYear() - 1);
      const expiredDateStr = expiredDate.toISOString().split('T')[0];
      
      await setWaiverExpiration(testUser.email, expiredDateStr);
      
      // Submit renewal waiver
      const renewalWaiverData = generateWaiverData(testUser);
      await waiverPage.goto();
      
      // Wait for the page to check waiver status and show the form
      await page.waitForTimeout(3000);
      
      await waiverPage.fillWaiverForm(renewalWaiverData);
      await waiverPage.submitWaiver();
      await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
      await page.waitForTimeout(3000);
      
      // Navigate to dashboard
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await page.waitForTimeout(2000);
      
      // Get waiver status
      const waiverStatus = await dashboardPage.getWaiverStatus();
      
      // Verify waiver is now valid
      expect(waiverStatus.hasWaiver).toBe(true);
      
      // Verify expiration date is approximately one year from now
      // (allowing for some time difference during test execution)
      if (waiverStatus.expirationDate) {
        const expirationDate = new Date(waiverStatus.expirationDate);
        const expectedExpiration = new Date();
        expectedExpiration.setFullYear(expectedExpiration.getFullYear() + 1);
        
        // Allow 2 days difference for test execution time
        const diffDays = Math.abs(
          (expirationDate.getTime() - expectedExpiration.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        expect(diffDays).toBeLessThan(2);
      }
      
      // Verify waiver is not expired
      const isExpired = await dashboardPage.isWaiverExpired();
      expect(isExpired).toBe(false);
      
      console.log('✅ Property 30: Waiver renewal sets expiration to one year from submission');
    } finally {
      // Cleanup
      if (testUser && sessionToken) {
        await deleteTestData(request, testUser.email, sessionToken);
      }
    }
  });

  /**
   * Property 31: Waiver expiration warning
   * Feature: volunteer-ux-playwright-testing, Property 31: Waiver expiration warning
   * 
   * For any waiver expiring within 30 days, the dashboard should display an
   * expiration warning
   * 
   * Validates: Requirements 3.3
   */
  test('Property 31: Waiver expiration warning - warning shown for waiver expiring within 30 days', async ({ page, request }) => {
    const dashboardPage = new DashboardPage(page);
    let testUser: any;
    let sessionToken: string;
    
    try {
      // Authenticate user with waiver
      testUser = await authenticateUserWithWaiver(page);
      
      // Get session token for cleanup
      sessionToken = await page.evaluate(() => localStorage.getItem('auth_session_token') || '');
      
      // Set waiver expiration to 15 days from now (within 30-day warning window)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 15);
      const expirationDateStr = expirationDate.toISOString().split('T')[0];
      
      await setWaiverExpiration(testUser.email, expirationDateStr);
      
      // Reload dashboard to see expiration warning
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await page.waitForTimeout(2000);
      
      // Verify expiration warning is displayed
      const warningText = await dashboardPage.getWaiverExpirationWarning();
      expect(warningText).toBeTruthy();
      expect(warningText?.toLowerCase()).toMatch(/expir|renew|day/);
      
      // Verify days remaining is approximately 15
      const daysRemaining = await dashboardPage.getWaiverDaysRemaining();
      expect(daysRemaining).toBeGreaterThan(10);
      expect(daysRemaining).toBeLessThan(20);
      
      console.log('✅ Property 31: Expiration warning shown for waiver expiring within 30 days');
    } finally {
      // Cleanup
      if (testUser && sessionToken) {
        await deleteTestData(request, testUser.email, sessionToken);
      }
    }
  });

  /**
   * Property 32: Waiver status display
   * Feature: volunteer-ux-playwright-testing, Property 32: Waiver status display
   * 
   * For any volunteer with a waiver, the dashboard should display the
   * expiration date and days remaining
   * 
   * Validates: Requirements 3.4
   */
  test('Property 32: Waiver status display - dashboard shows expiration date and days remaining', async ({ page, request }) => {
    const dashboardPage = new DashboardPage(page);
    let testUser: any;
    let sessionToken: string;
    
    try {
      // Authenticate user with waiver
      testUser = await authenticateUserWithWaiver(page);
      
      // Get session token for cleanup
      sessionToken = await page.evaluate(() => localStorage.getItem('auth_session_token') || '');
      
      // Set waiver expiration to 180 days from now (6 months)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 180);
      const expirationDateStr = expirationDate.toISOString().split('T')[0];
      
      await setWaiverExpiration(testUser.email, expirationDateStr);
      
      // Reload dashboard to see waiver status
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await page.waitForTimeout(2000);
      
      // Get waiver status
      const waiverStatus = await dashboardPage.getWaiverStatus();
      
      // Verify waiver has expiration date
      expect(waiverStatus.hasWaiver).toBe(true);
      expect(waiverStatus.expirationDate).toBeTruthy();
      
      // Verify expiration date matches what we set (approximately)
      if (waiverStatus.expirationDate) {
        const displayedExpiration = new Date(waiverStatus.expirationDate);
        const expectedExpiration = new Date(expirationDateStr);
        
        // Dates should match (allowing for timezone differences and rounding)
        const diffDays = Math.abs(
          (displayedExpiration.getTime() - expectedExpiration.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        expect(diffDays).toBeLessThan(2); // Allow up to 2 days difference for timezone/rounding
      }
      
      // Verify days remaining is approximately 180
      const daysRemaining = await dashboardPage.getWaiverDaysRemaining();
      expect(daysRemaining).toBeGreaterThan(170);
      expect(daysRemaining).toBeLessThan(190);
      
      // Verify waiver is not expired
      const isExpired = await dashboardPage.isWaiverExpired();
      expect(isExpired).toBe(false);
      
      console.log('✅ Property 32: Dashboard displays waiver expiration date and days remaining');
    } finally {
      // Cleanup
      if (testUser && sessionToken) {
        await deleteTestData(request, testUser.email, sessionToken);
      }
    }
  });
});
