import { chromium, FullConfig } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { generateTestUser, generateValidationCode } from './utils/data-generators';
import { insertTestValidationCode } from './utils/api-helpers';

/**
 * Global setup for Playwright tests
 * Authenticates a test user and saves the storage state for reuse across all tests
 */
async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('🔐 Setting up authenticated session for tests...');
  
  // Get base URL from config
  const baseURL = config.use?.baseURL || 'http://localhost:1313';
  
  const loginPage = new LoginPage(page);
  const testUser = generateTestUser();
  const testCode = generateValidationCode();
  
  // Authenticate the user - use full URL
  await page.goto(`${baseURL}/volunteer`);
  await page.waitForLoadState('networkidle');
  
  await loginPage.enterEmail(testUser.email);
  await loginPage.clickSendCode();
  
  // Wait for the API call to complete
  await page.waitForTimeout(2000);
  
  await loginPage.expectCodeSentMessage();
  
  // Insert test validation code and authenticate
  await insertTestValidationCode(testUser.email, testCode);
  await page.waitForTimeout(500);
  await loginPage.enterValidationCode(testCode);
  await loginPage.clickVerifyCode();
  await page.waitForTimeout(2000);
  
  // Verify authentication succeeded
  const sessionToken = await page.evaluate(() => localStorage.getItem('auth_session_token'));
  if (!sessionToken) {
    throw new Error('Authentication failed - no session token found');
  }
  
  console.log(`✅ Authenticated as: ${testUser.email}`);
  
  // Save storage state to file
  await context.storageState({ path: 'tests/.auth/user.json' });
  
  await browser.close();
  
  console.log('✅ Global setup complete - storage state saved');
}

export default globalSetup;
