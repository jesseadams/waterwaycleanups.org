import { test, expect } from '@playwright/test';

/**
 * Smoke test to verify Playwright setup is working correctly
 */
test.describe('Smoke Tests', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify page title or heading exists
    await expect(page).toHaveTitle(/Waterway/i);
  });

  test('should navigate to volunteer page', async ({ page }) => {
    await page.goto('/volunteer');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the volunteer page
    await expect(page).toHaveURL(/volunteer/);
  });
});
