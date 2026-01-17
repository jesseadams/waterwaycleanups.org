import { test as base } from '@playwright/test';
import { generateTestUser, TestUser } from '../utils/data-generators';
import { deleteTestData } from '../utils/api-helpers';

/**
 * User Fixture
 * 
 * Provides a unique test user for each test with automatic cleanup.
 * Ensures test isolation by generating unique user data.
 * 
 * Usage:
 * ```typescript
 * test('should create user', async ({ testUser, request }) => {
 *   // testUser contains unique email, name, phone, etc.
 *   await createWaiver(request, testUser);
 * });
 * ```
 */

export interface UserFixture {
  /**
   * Generated test user with unique email and data
   */
  testUser: TestUser;
  
  /**
   * Cleanup function to manually delete test data if needed
   * (automatic cleanup happens after test completion)
   */
  cleanupUser: () => Promise<void>;
}

/**
 * Extended test with user fixture
 */
export const test = base.extend<UserFixture>({
  testUser: async ({ request }, use) => {
    // Generate unique test user
    const user = generateTestUser();
    
    // Provide user to test
    await use(user);
    
    // Cleanup: Delete all test data for this user
    try {
      await deleteTestData(request, user.email);
      console.log(`Cleaned up test data for user: ${user.email}`);
    } catch (error) {
      console.error(`Error cleaning up test data for ${user.email}:`, error);
      // Don't throw - cleanup is best effort
    }
  },
  
  cleanupUser: async ({ testUser, request }, use) => {
    // Provide manual cleanup function
    const cleanup = async () => {
      try {
        await deleteTestData(request, testUser.email);
        console.log(`Manually cleaned up test data for user: ${testUser.email}`);
      } catch (error) {
        console.error(`Error in manual cleanup for ${testUser.email}:`, error);
        throw error;
      }
    };
    
    await use(cleanup);
  },
});

/**
 * User fixture with multiple users
 * 
 * Provides multiple unique test users for tests that need multiple accounts.
 * 
 * Usage:
 * ```typescript
 * test('should handle multiple users', async ({ testUsers, request }) => {
 *   const [user1, user2, user3] = testUsers;
 *   // Each user has unique data
 * });
 * ```
 */
export interface MultiUserFixture {
  /**
   * Array of generated test users (default: 3 users)
   */
  testUsers: TestUser[];
  
  /**
   * Cleanup function for all test users
   */
  cleanupUsers: () => Promise<void>;
}

export const testWithMultipleUsers = base.extend<MultiUserFixture>({
  testUsers: async ({ request }, use, testInfo) => {
    // Generate 3 unique test users by default
    const users = [
      generateTestUser(),
      generateTestUser(),
      generateTestUser(),
    ];
    
    // Provide users to test
    await use(users);
    
    // Cleanup: Delete all test data for all users
    for (const user of users) {
      try {
        await deleteTestData(request, user.email);
        console.log(`Cleaned up test data for user: ${user.email}`);
      } catch (error) {
        console.error(`Error cleaning up test data for ${user.email}:`, error);
        // Continue with other users
      }
    }
  },
  
  cleanupUsers: async ({ testUsers, request }, use) => {
    // Provide manual cleanup function for all users
    const cleanup = async () => {
      for (const user of testUsers) {
        try {
          await deleteTestData(request, user.email);
          console.log(`Manually cleaned up test data for user: ${user.email}`);
        } catch (error) {
          console.error(`Error in manual cleanup for ${user.email}:`, error);
          // Continue with other users
        }
      }
    };
    
    await use(cleanup);
  },
});

export { expect } from '@playwright/test';
