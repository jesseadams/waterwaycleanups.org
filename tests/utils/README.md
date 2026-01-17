# Test Utilities

This directory contains reusable test utilities for the Playwright test suite.

## Files

### api-helpers.ts
Direct API interaction utilities for test setup, verification, and cleanup.

**Key Functions:**
- `sendValidationCode()` - Send authentication code to email
- `verifyCode()` - Verify code and get session token
- `validateSession()` - Validate existing session
- `createTestWaiver()` - Create waiver via API
- `getWaiverStatus()` - Check waiver status
- `submitEventRsvp()` - Submit RSVP via API
- `getRsvpCount()` - Get event RSVP count
- `getUserDashboard()` - Get user dashboard data
- `addMinor()` - Add minor to guardian account
- `listMinors()` - List guardian's minors
- `deleteMinor()` - Delete a minor
- `deleteTestData()` - Cleanup test data

### wait-helpers.ts
Utilities for reliable async operations, network interception, and retry logic.

**Key Functions:**
- `waitForApiResponse()` - Wait for specific API call
- `waitForMultipleApiResponses()` - Wait for multiple APIs
- `waitForNetworkIdle()` - Wait for network to be idle
- `waitForElementStable()` - Wait for element to be visible and stable
- `retryWithBackoff()` - Retry with exponential backoff
- `retryUntil()` - Retry until condition met
- `mockApiResponse()` - Mock API responses
- `simulateNetworkDelay()` - Add network delay
- `simulateNetworkTimeout()` - Simulate timeout
- `simulateNetworkError()` - Simulate network errors
- `waitForPageLoad()` - Wait for page load
- `waitForCondition()` - Wait for custom condition

**Timeout Constants:**
- `TIMEOUTS.SHORT` - 5 seconds
- `TIMEOUTS.DEFAULT` - 10 seconds
- `TIMEOUTS.LONG` - 30 seconds
- `TIMEOUTS.EXTRA_LONG` - 60 seconds

### data-generators.ts
Generate unique test data for users, waivers, events, and minors.

**Key Functions:**
- `generateTestUser()` - Generate unique test user
- `generateTestUsers()` - Generate multiple users
- `generateWaiverData()` - Generate waiver from user
- `generateIncompleteWaiverData()` - Generate invalid waiver
- `generateTestEvent()` - Generate future event
- `generatePastEvent()` - Generate past event
- `generateFullCapacityEvent()` - Generate event at capacity
- `generateTestMinor()` - Generate minor data
- `generateInvalidMinor()` - Generate invalid minor
- `generateRsvpData()` - Generate RSVP data
- `generateValidationCode()` - Generate 6-digit code
- `generateSessionToken()` - Generate session token
- `getDateFromNow()` - Get date N days from now
- `getTodayDate()` - Get today's date
- `calculateAge()` - Calculate age from DOB

## Usage Examples

### API Helpers
```typescript
import { sendValidationCode, verifyCode, createTestWaiver } from './utils';

// Authenticate user
await sendValidationCode(request, email);
const sessionToken = await verifyCode(request, email, '123456');

// Create waiver
await createTestWaiver(request, waiverData);
```

### Wait Helpers
```typescript
import { waitForApiResponse, retryWithBackoff, TIMEOUTS } from './utils';

// Wait for API response
const response = await waitForApiResponse(page, '/submit-event-rsvp', {
  timeout: TIMEOUTS.LONG
});

// Retry with backoff
await retryWithBackoff(async () => {
  return await someOperation();
}, { maxRetries: 3 });
```

### Data Generators
```typescript
import { generateTestUser, generateWaiverData, generateTestEvent } from './utils';

// Generate test data
const user = generateTestUser();
const waiver = generateWaiverData(user);
const event = generateTestEvent({ capacity: 20 });
```

## Design Principles

1. **Isolation** - Each test uses unique data to prevent conflicts
2. **Reliability** - Retry logic and proper waits prevent flaky tests
3. **Maintainability** - Centralized utilities reduce code duplication
4. **Flexibility** - Override defaults for specific test needs
5. **Type Safety** - Full TypeScript support with interfaces

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 5.1** - Reusable authentication helpers
- **Requirement 5.2** - Test data generators and fixtures
- **Requirement 5.3** - Page object models (to be implemented in next task)
- **Requirement 5.4** - Cleanup utilities
- **Requirement 5.5** - Network interception and waiting utilities
- **Requirement 7.1-7.5** - Async operation handling with timeouts and retries
