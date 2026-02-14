/**
 * Fast authentication utility for tests
 * Uses direct DynamoDB writes instead of browser UI to speed up test setup
 */

import { setupFastAuth } from './dynamodb-cleanup';
import { generateTestUser, generateValidationCode } from './data-generators';
import { LoginPage } from '../pages/LoginPage';

/**
 * Authenticate a fresh user with waiver (FAST PATH)
 * 
 * This replaces the slow browser-based waiver creation with direct DynamoDB writes.
 * Reduces beforeEach time from ~19 seconds to <2 seconds.
 * 
 * @param page - Playwright page object
 * @returns Object with testUser and sessionToken
 */
export async function authenticateFreshUserWithWaiver(page: any) {
  const testUser = generateTestUser();
  const testCode = generateValidationCode();
  
  // FAST PATH: Create waiver and validation code directly in DynamoDB
  await setupFastAuth(testUser, testCode);
  
  console.log('✅ Waiver and validation code created in DynamoDB for', testUser.email);
  
  // Authenticate using LoginPage (only UI interaction needed)
  const loginPage = new LoginPage(page);
  
  await page.goto('/volunteer');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  
  // Enter email and request code
  await loginPage.enterEmail(testUser.email);
  await loginPage.clickSendCode();
  
  // Wait for code sent confirmation instead of arbitrary timeout
  await page.waitForFunction(() => {
    const button = document.querySelector('button');
    const buttonText = button?.textContent || '';
    return buttonText.includes('Resend') || button?.disabled;
  }, { timeout: 5000 }).catch(() => {});
  
  // Enter and verify code through UI
  await loginPage.enterValidationCode(testCode);
  await loginPage.clickVerifyCode();
  
  // Wait for session token to be set instead of arbitrary timeout
  await page.waitForFunction(() => localStorage.getItem('sessionToken') !== null, { timeout: 10000 });
  
  // Get session token from localStorage
  const sessionToken = await loginPage.getSessionToken();
  
  if (!sessionToken) {
    throw new Error('No session token after authentication');
  }
  
  console.log('✅ User authenticated:', testUser.email);
  
  return { testUser, sessionToken };
}
