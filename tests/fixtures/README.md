# Test Fixtures

This directory contains reusable test fixtures for Playwright tests. Fixtures provide setup and teardown logic, ensuring test isolation and automatic cleanup.

## Available Fixtures

### Authentication Fixture (`auth.fixture.ts`)

Provides an authenticated page context with session token and user email.

**Usage:**
```typescript
import { test, expect } from '../fixtures/auth.fixture';

test('should access dashboard', async ({ authenticatedPage, userEmail, sessionToken }) => {
  await authenticatedPage.goto('/volunteer');
  // User is already authenticated
  expect(sessionToken).toBeTruthy();
});
```

**Provides:**
- `authenticatedPage`: Page object with authenticated session
- `sessionToken`: Session token stored in localStorage
- `userEmail`: Email of the authenticated user

**Automatic Cleanup:**
- Clears session data from localStorage
- Deletes test user data

### User Fixture (`user.fixture.ts`)

Provides unique test users with automatic cleanup.

**Usage:**
```typescript
import { test, expect } from '../fixtures/user.fixture';

test('should create waiver', async ({ testUser, request }) => {
  // testUser contains unique email, name, phone, etc.
  await createWaiver(request, testUser);
});
```

**Provides:**
- `testUser`: Generated test user with unique email and data
- `cleanupUser`: Manual cleanup function (automatic cleanup also happens)

**Multiple Users:**
```typescript
import { testWithMultipleUsers, expect } from '../fixtures/user.fixture';

testWithMultipleUsers('should handle multiple users', async ({ testUsers }) => {
  const [user1, user2, user3] = testUsers;
  // Each user has unique data
});
```

**Automatic Cleanup:**
- Deletes all test data for the user (waivers, RSVPs, minors)

### Event Fixture (`event.fixture.ts`)

Provides test events with different configurations.

**Basic Event:**
```typescript
import { test, expect } from '../fixtures/event.fixture';

test('should RSVP to event', async ({ testEvent, request }) => {
  // testEvent contains eventId, title, date, capacity, etc.
  await submitRsvp(request, testEvent.eventId);
});
```

**Past Event:**
```typescript
import { testWithPastEvent, expect } from '../fixtures/event.fixture';

testWithPastEvent('should show past event', async ({ pastEvent }) => {
  // pastEvent has a date in the past
});
```

**Full Capacity Event:**
```typescript
import { testWithFullCapacityEvent, expect } from '../fixtures/event.fixture';

testWithFullCapacityEvent('should reject RSVP', async ({ fullCapacityEvent }) => {
  // fullCapacityEvent has capacity set to 1 for easy testing
});
```

**Multiple Events:**
```typescript
import { testWithMultipleEvents, expect } from '../fixtures/event.fixture';

testWithMultipleEvents('should list events', async ({ testEvents }) => {
  const [event1, event2, event3] = testEvents;
  // Each event has unique data
});
```

**Mixed Events:**
```typescript
import { testWithMixedEvents, expect } from '../fixtures/event.fixture';

testWithMixedEvents('should handle different event types', async ({ 
  futureEvent, 
  pastEvent, 
  fullCapacityEvent 
}) => {
  // Test with different event types
});
```

**Provides:**
- `testEvent`: Generated test event with future date
- `pastEvent`: Event with past date
- `fullCapacityEvent`: Event with small capacity
- `testEvents`: Array of multiple events
- `cleanupEvent`/`cleanupEvents`: Manual cleanup functions

**Automatic Cleanup:**
- Logs cleanup (actual deletion requires admin API)

## Combining Fixtures

You can combine fixtures by merging them:

```typescript
import { test as base } from '@playwright/test';
import { test as authTest } from '../fixtures/auth.fixture';
import { test as eventTest } from '../fixtures/event.fixture';

// Merge fixtures
const test = base.extend({
  ...authTest,
  ...eventTest,
});

test('should RSVP as authenticated user', async ({ 
  authenticatedPage, 
  testEvent 
}) => {
  // Use both fixtures
});
```

## Best Practices

1. **Use fixtures for setup/teardown**: Let fixtures handle authentication, data creation, and cleanup
2. **Test isolation**: Each test gets unique data to prevent conflicts
3. **Automatic cleanup**: Fixtures clean up after themselves
4. **Manual cleanup**: Use `cleanupUser`, `cleanupEvent` if you need to clean up mid-test
5. **Combine fixtures**: Mix and match fixtures as needed for your tests

## Notes

- Event creation/deletion requires admin API access (currently logged only)
- User cleanup deletes waivers, RSVPs, and minors
- All fixtures generate unique data to ensure test isolation
- Cleanup is best-effort and won't fail tests if it encounters errors
