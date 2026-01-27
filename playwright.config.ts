import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * Environment-specific configuration
 */
const getBaseURL = () => {
  const env = process.env.TEST_ENV || 'local';
  
  switch (env) {
    case 'local':
      return process.env.BASE_URL || 'http://localhost:1313';
    case 'staging':
      return process.env.STAGING_URL || 'https://staging.waterwaycleanups.org';
    case 'production':
      return process.env.PRODUCTION_URL || 'https://waterwaycleanups.org';
    case 'ci':
      return process.env.CI_URL || 'http://localhost:1313';
    default:
      return 'http://localhost:1313';
  }
};

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Global setup file for authentication */
  globalSetup: './tests/global-setup.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 1,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 4 : 10,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/test-results.json' }],
    ['junit', { outputFile: 'test-results/test-results.xml' }],
    ['list'], // Console output
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: getBaseURL(),

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Capture screenshot only on failure */
    screenshot: 'only-on-failure',
    
    /* Record video only on failure */
    video: 'retain-on-failure',
    
    /* Maximum time each action such as `click()` can take */
    actionTimeout: 10000,
    
    /* Maximum time for navigation - increased for CI environments */
    navigationTimeout: process.env.CI ? 60000 : 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    // Unauthenticated projects for authentication tests
    {
      name: 'chromium-unauth',
      testMatch: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // No storageState - start unauthenticated
      },
    },
    {
      name: 'firefox-unauth',
      testMatch: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        // No storageState - start unauthenticated
      },
    },
    {
      name: 'chrome-unauth',
      testMatch: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'], 
        channel: 'chrome',
        viewport: { width: 1280, height: 720 },
        // No storageState - start unauthenticated
      },
    },
    {
      name: 'webkit-unauth',
      testMatch: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        // No storageState - start unauthenticated
      },
      // Skip webkit locally due to library dependency issues
      // Run in GitHub Actions (GITHUB_ACTIONS env var) but skip locally
      grep: process.env.GITHUB_ACTIONS ? undefined : /$^/,
    },
    
    // Authenticated projects for all other tests
    {
      name: 'chromium',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        storageState: 'tests/.auth/user.json',
      },
    },

    {
      name: 'firefox',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        storageState: 'tests/.auth/user.json',
      },
    },

    /* Test against branded browsers. */
    {
      name: 'chrome',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'], 
        channel: 'chrome',
        viewport: { width: 1280, height: 720 },
        storageState: 'tests/.auth/user.json',
      },
    },
    
    {
      name: 'webkit',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        storageState: 'tests/.auth/user.json',
      },
      // Skip webkit locally due to library dependency issues
      // Run in GitHub Actions (GITHUB_ACTIONS env var) but skip locally
      grep: process.env.GITHUB_ACTIONS ? undefined : /$^/,
    },

    /* Mobile device projects */
    {
      name: 'mobile-chrome',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/.auth/user.json',
      },
    },

    {
      name: 'mobile-safari',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        storageState: 'tests/.auth/user.json',
      },
      // Skip webkit locally due to library dependency issues
      // Run in GitHub Actions (GITHUB_ACTIONS env var) but skip locally
      grep: process.env.GITHUB_ACTIONS ? undefined : /$^/,
    },

    /* Tablet device project */
    {
      name: 'tablet',
      testIgnore: /.*auth\/authentication\.spec\.ts/,
      use: {
        ...devices['iPad Pro'],
        storageState: 'tests/.auth/user.json',
      },
      // Skip webkit locally due to library dependency issues
      // Run in GitHub Actions (GITHUB_ACTIONS env var) but skip locally
      grep: process.env.GITHUB_ACTIONS ? undefined : /$^/,
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:1313',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
  
  /* Global timeout for each test */
  timeout: 60000,
  
  /* Global timeout for the entire test run */
  globalTimeout: process.env.CI ? 30 * 60 * 1000 : undefined, // 30 minutes on CI
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Output folder for test artifacts */
  outputDir: 'test-results/artifacts',
});
