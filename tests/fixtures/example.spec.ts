/**
 * Example Test File
 * 
 * Demonstrates how to use the test fixtures.
 * This file is for reference only and can be deleted.
 */

import { test as authTest, expect } from './auth.fixture';
import { test as userTest } from './user.fixture';
import { test as eventTest } from './event.fixture';
import { testWithMultipleUsers } from './user.fixture';
import { testWithMixedEvents } from './event.fixture';

// Example 1: Using authentication fixture
authTest('example: authenticated page', async ({ authenticatedPage, userEmail, sessionToken }) => {
  console.log('User email:', userEmail);
  console.log('Session token:', sessionToken);
  
  // Page is already authenticated
  await authenticatedPage.goto('/volunteer');
  
  // Verify session token is in localStorage
  const storedToken = await authenticatedPage.evaluate(() => {
    return localStorage.getItem('sessionToken');
  });
  
  expect(storedToken).toBe(sessionToken);
});

// Example 2: Using user fixture
userTest('example: test user', async ({ testUser, cleanupUser }) => {
  console.log('Test user:', testUser);
  
  // testUser has unique email, name, phone, etc.
  expect(testUser.email).toContain('@waterwaycleanups-test.org');
  expect(testUser.firstName).toBeTruthy();
  expect(testUser.lastName).toBeTruthy();
  
  // Manual cleanup if needed (automatic cleanup also happens)
  // await cleanupUser();
});

// Example 3: Using event fixture
eventTest('example: test event', async ({ testEvent, cleanupEvent }) => {
  console.log('Test event:', testEvent);
  
  // testEvent has eventId, title, date, capacity, etc.
  expect(testEvent.eventId).toBeTruthy();
  expect(testEvent.capacity).toBeGreaterThan(0);
  
  // Manual cleanup if needed (automatic cleanup also happens)
  // await cleanupEvent();
});

// Example 4: Using multiple users
testWithMultipleUsers('example: multiple users', async ({ testUsers, cleanupUsers }) => {
  const [user1, user2, user3] = testUsers;
  
  console.log('User 1:', user1.email);
  console.log('User 2:', user2.email);
  console.log('User 3:', user3.email);
  
  // Each user has unique data
  expect(user1.email).not.toBe(user2.email);
  expect(user2.email).not.toBe(user3.email);
});

// Example 5: Using mixed events
testWithMixedEvents('example: mixed events', async ({ 
  futureEvent, 
  pastEvent, 
  fullCapacityEvent 
}) => {
  console.log('Future event:', futureEvent.eventId);
  console.log('Past event:', pastEvent.eventId);
  console.log('Full capacity event:', fullCapacityEvent.eventId);
  
  // Future event has a date in the future
  const futureDate = new Date(futureEvent.date);
  const now = new Date();
  expect(futureDate.getTime()).toBeGreaterThan(now.getTime());
  
  // Past event has a date in the past
  const pastDate = new Date(pastEvent.date);
  expect(pastDate.getTime()).toBeLessThan(now.getTime());
  
  // Full capacity event has small capacity
  expect(fullCapacityEvent.capacity).toBeLessThanOrEqual(5);
});

// Example 6: Combining fixtures manually
import { test as base } from '@playwright/test';

const combinedTest = base.extend({
  // You can merge fixtures from different sources
  // This is useful when you need multiple fixtures in one test
});

// Note: To actually combine fixtures, you would need to merge their implementations
// For now, use separate test functions or import fixtures as needed
