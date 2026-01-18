import { Page, Response, expect } from '@playwright/test';

/**
 * Wait and Network Helper utilities for reliable test execution
 * Provides utilities for waiting on API responses, network interception,
 * retry logic, and timeout configuration
 */

/**
 * Timeout Configuration
 */
export const TIMEOUTS = {
  // Short timeout for fast operations
  SHORT: 5000,
  
  // Default timeout for most operations
  DEFAULT: 10000,
  
  // Long timeout for slow operations (API calls, page loads)
  LONG: 30000,
  
  // Extra long timeout for very slow operations
  EXTRA_LONG: 60000,
  
  // Retry delays
  RETRY_DELAY_MIN: 1000,
  RETRY_DELAY_MAX: 10000,
};

/**
 * Wait for a specific API endpoint to be called and return response
 * @param page - Playwright page
 * @param urlPattern - URL pattern to match (string or regex)
 * @param options - Wait options
 * @returns Promise that resolves with the response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options: {
    timeout?: number;
    method?: string;
  } = {}
): Promise<Response> {
  const timeout = options.timeout || TIMEOUTS.LONG;
  const method = options.method?.toUpperCase();

  return await page.waitForResponse(
    (response) => {
      const url = response.url();
      const matchesUrl = typeof urlPattern === 'string' 
        ? url.includes(urlPattern)
        : urlPattern.test(url);
      
      const matchesMethod = method ? response.request().method() === method : true;
      
      return matchesUrl && matchesMethod;
    },
    { timeout }
  );
}

/**
 * Wait for multiple API responses
 * @param page - Playwright page
 * @param urlPatterns - Array of URL patterns to match
 * @param options - Wait options
 * @returns Promise that resolves with all responses
 */
export async function waitForMultipleApiResponses(
  page: Page,
  urlPatterns: (string | RegExp)[],
  options: {
    timeout?: number;
  } = {}
): Promise<Response[]> {
  const timeout = options.timeout || TIMEOUTS.LONG;
  
  const responsePromises = urlPatterns.map(pattern =>
    waitForApiResponse(page, pattern, { timeout })
  );
  
  return await Promise.all(responsePromises);
}

/**
 * Wait for network to be idle (no pending requests)
 * @param page - Playwright page
 * @param timeout - Optional timeout in milliseconds (defaults to TIMEOUTS.LONG)
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout?: number
): Promise<void> {
  const timeoutMs = timeout || TIMEOUTS.LONG;
  const idleTime = 500;
  
  await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  
  // Additional wait to ensure stability
  await page.waitForTimeout(idleTime);
}

/**
 * Wait for an element to be visible and stable
 * @param page - Playwright page
 * @param selector - Element selector
 * @param options - Wait options
 */
export async function waitForElementStable(
  page: Page,
  selector: string,
  options: {
    timeout?: number;
    state?: 'visible' | 'hidden' | 'attached';
  } = {}
): Promise<void> {
  const timeout = options.timeout || TIMEOUTS.DEFAULT;
  const state = options.state || 'visible';
  
  const element = page.locator(selector);
  await element.waitFor({ state, timeout });
  
  // Wait for element to be stable (not animating)
  await expect(element).toBeVisible({ timeout: TIMEOUTS.SHORT });
}

/**
 * Retry an operation with exponential backoff
 * @param operation - Async operation to retry
 * @param options - Retry options
 * @returns Result of the operation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || TIMEOUTS.RETRY_DELAY_MIN;
  const maxDelay = options.maxDelay || TIMEOUTS.RETRY_DELAY_MAX;
  const backoffMultiplier = options.backoffMultiplier || 2;
  
  let lastError: Error;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw new Error(
          `Operation failed after ${maxRetries + 1} attempts: ${lastError.message}`
        );
      }
      
      if (options.onRetry) {
        options.onRetry(lastError, attempt + 1);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next retry (exponential backoff)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }
  
  throw lastError!;
}

/**
 * Retry an operation until a condition is met
 * @param operation - Async operation to retry
 * @param condition - Condition to check
 * @param options - Retry options
 * @returns Result of the operation
 */
export async function retryUntil<T>(
  operation: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxRetries?: number;
    delay?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 10;
  const delay = options.delay || 1000;
  const timeout = options.timeout || TIMEOUTS.LONG;
  
  const startTime = Date.now();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Operation timed out after ${timeout}ms`);
    }
    
    const result = await operation();
    
    if (condition(result)) {
      return result;
    }
    
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Condition not met after ${maxRetries} attempts`);
}

/**
 * Network Interception Helpers
 */

/**
 * Intercept and modify API requests
 * @param page - Playwright page
 * @param urlPattern - URL pattern to intercept
 * @param modifier - Function to modify the request
 */
export async function interceptRequest(
  page: Page,
  urlPattern: string | RegExp,
  modifier: (route: any, request: any) => Promise<void>
): Promise<void> {
  await page.route(urlPattern, async (route, request) => {
    await modifier(route, request);
  });
}

/**
 * Mock an API response
 * @param page - Playwright page
 * @param urlPattern - URL pattern to mock
 * @param response - Mock response data
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: {
    status?: number;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: response.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body || {}),
      headers: response.headers,
    });
  });
}

/**
 * Simulate network delay
 * @param page - Playwright page
 * @param urlPattern - URL pattern to delay
 * @param delayMs - Delay in milliseconds
 */
export async function simulateNetworkDelay(
  page: Page,
  urlPattern: string | RegExp,
  delayMs: number
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

/**
 * Simulate network timeout
 * @param page - Playwright page
 * @param urlPattern - URL pattern to timeout
 */
export async function simulateNetworkTimeout(
  page: Page,
  urlPattern: string | RegExp
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.abort('timedout');
  });
}

/**
 * Simulate network error
 * @param page - Playwright page
 * @param urlPattern - URL pattern to error
 * @param errorCode - Error code (e.g., 'failed', 'aborted', 'timedout')
 */
export async function simulateNetworkError(
  page: Page,
  urlPattern: string | RegExp,
  errorCode: 'failed' | 'aborted' | 'timedout' | 'accessdenied' | 'connectionclosed' | 'connectionreset' | 'connectionrefused' = 'failed'
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.abort(errorCode);
  });
}

/**
 * Wait for page to be fully loaded
 * @param page - Playwright page
 * @param options - Wait options
 */
export async function waitForPageLoad(
  page: Page,
  options: {
    timeout?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  } = {}
): Promise<void> {
  const timeout = options.timeout || TIMEOUTS.LONG;
  const waitUntil = options.waitUntil || 'networkidle';
  
  await page.waitForLoadState(waitUntil, { timeout });
}

/**
 * Wait for a specific condition with timeout
 * @param condition - Condition function to check
 * @param options - Wait options
 */
export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<void> {
  const timeout = options.timeout || TIMEOUTS.DEFAULT;
  const interval = options.interval || 100;
  const errorMessage = options.errorMessage || 'Condition not met within timeout';
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(errorMessage);
}

/**
 * Safe wait - waits for a condition but doesn't throw on timeout
 * @param condition - Condition function to check
 * @param options - Wait options
 * @returns true if condition met, false if timeout
 */
export async function safeWaitForCondition(
  condition: () => Promise<boolean> | boolean,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<boolean> {
  try {
    await waitForCondition(condition, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Performance Measurement Utilities
 */

/**
 * Measure page load time using Navigation Timing API
 * @param page - Playwright page
 * @returns Load time in milliseconds
 */
export async function measureLoadTime(page: Page): Promise<number> {
  const loadTime = await page.evaluate(() => {
    // Use modern Performance API instead of deprecated timing API
    const perfEntries = performance.getEntriesByType('navigation');
    if (perfEntries.length > 0) {
      const navEntry = perfEntries[0] as PerformanceNavigationTiming;
      return navEntry.loadEventEnd - navEntry.fetchStart;
    }
    
    // Fallback to deprecated API if modern API not available
    const perfData = window.performance.timing;
    return perfData.loadEventEnd - perfData.navigationStart;
  });
  
  return loadTime;
}

/**
 * Assert that page load time is under a maximum threshold
 * @param page - Playwright page
 * @param maxMs - Maximum load time in milliseconds
 */
export async function expectLoadTimeUnder(page: Page, maxMs: number): Promise<void> {
  const loadTime = await measureLoadTime(page);
  
  expect(loadTime).toBeLessThanOrEqual(maxMs);
}
