# Design Document

## Overview

This design document outlines the architecture and implementation approach for comprehensive end-to-end testing of the volunteer user experience using Playwright. The testing framework will cover authentication, waiver submission, event RSVP management, and minor management flows. The design emphasizes maintainability, reliability, and integration with CI/CD pipelines.

## Architecture

### Test Framework Structure

```
tests/
├── e2e/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   ├── session-management.spec.ts
│   │   └── logout.spec.ts
│   ├── waiver/
│   │   ├── waiver-submission.spec.ts
│   │   └── waiver-validation.spec.ts
│   ├── rsvp/
│   │   ├── rsvp-submission.spec.ts
│   │   ├── rsvp-cancellation.spec.ts
│   │   └── rsvp-capacity.spec.ts
│   └── minors/
│       ├── minor-management.spec.ts
│       └── minor-validation.spec.ts
├── fixtures/
│   ├── auth.fixture.ts
│   ├── user.fixture.ts
│   ├── event.fixture.ts
│   └── cleanup.fixture.ts
├── pages/
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── WaiverPage.ts
│   ├── EventPage.ts
│   └── MinorsPage.ts
├── utils/
│   ├── api-helpers.ts
│   ├── data-generators.ts
│   └── wait-helpers.ts
└── playwright.config.ts
```

### Technology Stack

- **Playwright**: v1.40+ for browser automation
- **TypeScript**: For type safety and better IDE support
- **Test Runner**: Playwright Test (built-in)
- **Assertion Library**: Playwright's expect (built-in)
- **CI Integration**: GitHub Actions / GitLab CI compatible

## Components and Interfaces

### Page Object Models

Page objects encapsulate page-specific selectors and interactions, providing a clean API for tests.

#### LoginPage

```typescript
class LoginPage {
  constructor(page: Page);
  
  // Navigation
  goto(): Promise<void>;
  
  // Actions
  enterEmail(email: string): Promise<void>;
  clickSendCode(): Promise<void>;
  enterValidationCode(code: string): Promise<void>;
  clickVerifyCode(): Promise<void>;
  
  // Assertions
  expectEmailInputVisible(): Promise<void>;
  expectCodeSentMessage(): Promise<void>;
  expectLoginSuccess(): Promise<void>;
  expectErrorMessage(message: string): Promise<void>;
}
```

#### DashboardPage

```typescript
class DashboardPage {
  constructor(page: Page);
  
  // Navigation
  goto(): Promise<void>;
  
  // Getters
  getWaiverStatus(): Promise<WaiverStatus>;
  getRsvpList(): Promise<RsvpItem[]>;
  getMinorsList(): Promise<MinorItem[]>;
  
  // Actions
  clickSubmitWaiver(): Promise<void>;
  clickManageMinors(): Promise<void>;
  clickCancelRsvp(eventId: string): Promise<void>;
  
  // Assertions
  expectWaiverValid(): Promise<void>;
  expectWaiverExpired(): Promise<void>;
  expectRsvpCount(count: number): Promise<void>;
}
```

#### WaiverPage

```typescript
class WaiverPage {
  constructor(page: Page);
  
  // Navigation
  goto(): Promise<void>;
  
  // Actions
  fillWaiverForm(data: WaiverFormData): Promise<void>;
  submitWaiver(): Promise<void>;
  
  // Assertions
  expectFormVisible(): Promise<void>;
  expectValidationError(field: string): Promise<void>;
  expectSubmissionSuccess(): Promise<void>;
}
```

#### EventPage

```typescript
class EventPage {
  constructor(page: Page);
  
  // Navigation
  gotoEvent(eventId: string): Promise<void>;
  
  // Actions
  fillRsvpForm(firstName: string, lastName: string): Promise<void>;
  submitRsvp(): Promise<void>;
  
  // Getters
  getAttendanceCount(): Promise<number>;
  getAttendanceCap(): Promise<number>;
  
  // Assertions
  expectRsvpFormVisible(): Promise<void>;
  expectRsvpSuccess(): Promise<void>;
  expectCapacityError(): Promise<void>;
  expectDuplicateError(): Promise<void>;
}
```

#### MinorsPage

```typescript
class MinorsPage {
  constructor(page: Page);
  
  // Navigation
  goto(): Promise<void>;
  
  // Actions
  addMinor(data: MinorFormData): Promise<void>;
  updateMinor(minorId: string, data: Partial<MinorFormData>): Promise<void>;
  deleteMinor(minorId: string): Promise<void>;
  
  // Getters
  getMinorsList(): Promise<MinorItem[]>;
  
  // Assertions
  expectMinorInList(minorId: string): Promise<void>;
  expectMinorNotInList(minorId: string): Promise<void>;
  expectValidationError(field: string): Promise<void>;
}
```

### Test Fixtures

Fixtures provide reusable setup and teardown logic for tests.

#### Authentication Fixture

```typescript
interface AuthFixture {
  authenticatedPage: Page;
  sessionToken: string;
  userEmail: string;
}

const authFixture = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    // Authenticate user and set up session
    await authenticateUser(page);
    await use(page);
    // Cleanup session
    await clearSession(page);
  }
});
```

#### User Fixture

```typescript
interface UserFixture {
  testUser: TestUser;
  cleanup: () => Promise<void>;
}

const userFixture = base.extend<UserFixture>({
  testUser: async ({}, use) => {
    const user = await createTestUser();
    await use(user);
    await deleteTestUser(user.email);
  }
});
```

### API Helpers

Utilities for direct API interaction when needed for test setup or verification.

```typescript
class ApiHelpers {
  // Authentication
  static async sendValidationCode(email: string): Promise<string>;
  static async verifyCode(email: string, code: string): Promise<string>;
  
  // Data setup
  static async createTestEvent(data: EventData): Promise<string>;
  static async createTestWaiver(email: string, data: WaiverData): Promise<void>;
  
  // Data verification
  static async getRsvpCount(eventId: string): Promise<number>;
  static async getWaiverStatus(email: string): Promise<WaiverStatus>;
  
  // Cleanup
  static async deleteTestData(email: string): Promise<void>;
}
```

## Data Models

### Test Data Structures

```typescript
interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
}

interface WaiverFormData {
  fullLegalName: string;
  phoneNumber: string;
  dateOfBirth: string;
  waiverAcknowledgement: boolean;
  adultSignature?: string;
  adultTodaysDate?: string;
}

interface RsvpFormData {
  firstName: string;
  lastName: string;
  eventId: string;
}

interface MinorFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
}

interface WaiverStatus {
  hasWaiver: boolean;
  expirationDate: string | null;
  submissionDate: string | null;
}

interface RsvpItem {
  eventId: string;
  eventTitle: string;
  eventDisplayDate: string;
  status: string;
}

interface MinorItem {
  minorId: string;
  firstName: string;
  lastName: string;
  age: number;
  dateOfBirth: string;
}
```

## Error Handling

### Test Error Strategies

1. **Retry Logic**: Implement automatic retries for flaky network operations
2. **Timeout Configuration**: Use appropriate timeouts for different operation types
3. **Error Screenshots**: Capture screenshots on test failures
4. **Video Recording**: Record videos for failed test runs
5. **Detailed Logging**: Log all API requests and responses during test execution

### Error Scenarios to Test

- Invalid email formats
- Expired validation codes
- Network timeouts
- API error responses (400, 401, 500)
- Missing required form fields
- Duplicate RSVP attempts
- Capacity exceeded scenarios
- Session expiration during operations

## Testing Strategy

### Test Organization

Tests are organized by feature area with clear naming conventions:

- `auth/*.spec.ts` - Authentication flow tests
- `waiver/*.spec.ts` - Waiver submission tests
- `rsvp/*.spec.ts` - Event RSVP tests
- `minors/*.spec.ts` - Minor management tests

### Test Execution Modes

1. **Local Development**: Run with headed browser for debugging
2. **CI Pipeline**: Run in headless mode with parallel execution
3. **Smoke Tests**: Quick subset of critical path tests
4. **Full Suite**: Comprehensive test coverage

### Test Data Management

- **Isolation**: Each test uses unique test data to prevent conflicts
- **Cleanup**: Automatic cleanup of test data after execution
- **Fixtures**: Reusable test data generators
- **Seeding**: Optional database seeding for consistent test environments

### Playwright Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:1313',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

Now I need to complete the prework analysis before writing the Correctness Properties section.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Authentication Properties

Property 1: Valid email authentication
*For any* valid email address, when a validation code is requested, the system should send a 6-digit code to that email address
**Validates: Requirements 1.1**

Property 2: Session creation on valid code
*For any* valid validation code, when verified, the system should create a session and store the session token in localStorage
**Validates: Requirements 1.2**

Property 3: Session-based access
*For any* active session, the user should be able to access authenticated pages without re-authentication
**Validates: Requirements 1.3**

Property 4: Session expiration cleanup
*For any* expired session, the system should redirect to the login page and clear all session data from localStorage
**Validates: Requirements 1.4**

Property 5: Logout cleanup
*For any* logout action, the system should clear all session data from localStorage and redirect to the public page
**Validates: Requirements 1.5**

### Waiver Properties

Property 6: Adult waiver storage
*For any* authenticated adult user with complete waiver data, submission should store the waiver record with adult-specific fields
**Validates: Requirements 2.1**

Property 7: Waiver validation enforcement
*For any* waiver submission with missing required fields, the system should prevent submission and display validation errors
**Validates: Requirements 2.2**

Property 8: Waiver expiration calculation
*For any* waiver submission, the expiration date should be exactly one year from the submission date
**Validates: Requirements 2.3**

Property 9: Dashboard waiver display
*For any* user with a valid waiver, the dashboard should display the waiver status with the correct expiration date
**Validates: Requirements 2.4**

### RSVP Properties

Property 10: RSVP creation
*For any* authenticated user with a valid waiver and available event, RSVP submission should create an RSVP record and display confirmation
**Validates: Requirements 3.1**

Property 11: Capacity enforcement
*For any* event at capacity, RSVP attempts should be rejected with an appropriate error message
**Validates: Requirements 3.2**

Property 12: Duplicate RSVP prevention
*For any* user who has already RSVP'd to an event, subsequent RSVP attempts should be rejected with an appropriate message
**Validates: Requirements 3.3**

Property 13: RSVP cancellation
*For any* RSVP cancelled more than 24 hours before the event, the system should mark it as cancelled and update the dashboard
**Validates: Requirements 3.4**

Property 14: Dashboard RSVP sorting
*For any* user with multiple RSVPs, the dashboard should display them sorted with upcoming events first, then past events
**Validates: Requirements 3.5**

### Minor Management Properties

Property 15: Minor creation
*For any* authenticated guardian with complete minor data, submission should create a minor record linked to the guardian's email
**Validates: Requirements 4.1**

Property 16: Minor age calculation
*For any* minor in the system, the displayed age should be correctly calculated from the date of birth
**Validates: Requirements 4.2**

Property 17: Minor update persistence
*For any* valid minor update, the changes should persist and be reflected in the minors list
**Validates: Requirements 4.3**

Property 18: Minor deletion
*For any* minor deletion request, the system should remove the minor record and update the minors list
**Validates: Requirements 4.4**

Property 19: Minor date validation
*For any* invalid date of birth, minor submission should be prevented with validation errors displayed
**Validates: Requirements 4.5**

### Property Reflection

After reviewing all properties, the following observations were made:

- Properties 1-5 (Authentication) are independent and each provides unique validation
- Properties 6-9 (Waiver) are independent and cover different aspects of waiver management
- Properties 10-14 (RSVP) are independent, though Property 10 could be considered to subsume basic RSVP creation, Properties 11-12 test specific error conditions
- Properties 15-19 (Minors) are independent and cover the full CRUD lifecycle
- No redundancy was identified - each property tests a distinct aspect of system behavior

Note: Requirements 5-8 and 10 are about test infrastructure and reporting, not functional system behavior, so they do not have corresponding correctness properties. Requirement 9 covers edge cases that will be handled by the test generators and error handling in the test suite itself.

