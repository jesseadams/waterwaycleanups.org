/**
 * Test Fixtures Index
 * 
 * Exports all test fixtures for easy importing in test files.
 * 
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures';
 * 
 * test('my test', async ({ authenticatedPage, testUser, testEvent }) => {
 *   // Use fixtures
 * });
 * ```
 */

// Authentication fixtures
export { 
  test as authTest,
  type AuthFixture 
} from './auth.fixture';

// User fixtures
export { 
  test as userTest,
  testWithMultipleUsers,
  type UserFixture,
  type MultiUserFixture
} from './user.fixture';

// Event fixtures
export { 
  test as eventTest,
  testWithPastEvent,
  testWithFullCapacityEvent,
  testWithMultipleEvents,
  testWithMixedEvents,
  type EventFixture,
  type PastEventFixture,
  type FullCapacityEventFixture,
  type MultiEventFixture,
  type MixedEventsFixture
} from './event.fixture';

// Re-export base test and expect from Playwright
export { test, expect } from '@playwright/test';
