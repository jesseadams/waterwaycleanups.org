# Design Document

## Overview

This design document outlines the approach for implementing comprehensive Playwright test coverage for the Waterway Cleanups volunteer UX. The implementation will **heavily leverage existing test patterns, Page Objects, utilities, and infrastructure** to ensure consistency and maintainability.

**Key Design Principle:** Reuse existing patterns wherever possible. Do not create new Page Objects, helper functions, or test structures if equivalent ones already exist.

## Architecture

### Existing Test Infrastructure (REUSE THESE)

The current test suite provides a solid foundation that MUST be reused:

1. **Page Object Models** (tests/pages/):
   - `LoginPage.ts` - Authentication flows
   - `EventPage.ts` - Event RSVP interactions
   - `DashboardPage.ts` - Dashboard data retrieval
   - `WaiverPage.ts` - Waiver submission
   - `MinorsPage.ts` - Minor management

2. **Utility Functions** (tests/utils/):
   - `data-generators.ts` - Test data generation
   - `api-helpers.ts` - API interactions
   - `wait-helpers.ts` - Timing and waiting utilities

3. **Test Patterns**:
   - Property-based test structure with numbered properties
   - Feature tagging: `Feature: volunteer-ux-playwright-testing, Property X`
   - Requirement validation: `Validates: Requirements X.Y`
   - Fresh user creation per test with cleanup
   - Helper functions for authentication with waiver

### Test Organization

Tests will be organized into existing directories:
- `tests/e2e/rsvp/` - Multi-person RSVP and time-based restrictions
- `tests/e2e/waiver/` - Waiver lifecycle tests
- `tests/e2e/auth/` - Session management edge cases
- `tests/e2e/minors/` - Minor edge cases
- `tests/e2e/dashboard/` - NEW directory for dashboard-specific tests
- `tests/e2e/integration/` - NEW directory for complete user journeys

## Components and Interfaces

### Existing Page Objects to Extend (NOT Replace)

#### EventPage Extensions
Add methods to existing `EventPage.ts`:
- `hasMultiPersonSelector()` - Check if multi-person UI is displayed
- `selectAttendees(attendees: string[])` - Select specific attendees
- `getSelectedAttendees()` - Get currently selected attendees
- `cancelIndividualAttendee(name: string)` - Cancel one person from group RSVP
- `isPastEvent()` - Check if event date has passed
- `getCancellationDeadline()` - Get 24-hour cancellation deadline
- `expectCancellationRestricted()` - Assert cancellation is blocked

#### DashboardPage Extensions
Add methods to existing `DashboardPage.ts`:
- `getWaiverExpirationWarning()` - Get expiration warning message
- `expectEmptyRsvpState()` - Assert empty RSVP state with CTA
- `expectEmptyMinorsState()` - Assert empty minors state with CTA
- `expectNoWaiverState()` - Assert no waiver state with CTA
- `getRsvpPagination()` - Get pagination controls
- `filterRsvpsByStatus(status: string)` - Filter RSVPs

#### WaiverPage Extensions
Add methods to existing `WaiverPage.ts`:
- `expectRenewalPrompt()` - Assert renewal prompt is shown
- `expectExpirationWarning(days: number)` - Assert expiration warning

### New Utility Functions (Add to Existing Files)

#### data-generators.ts Extensions
```typescript
// Add to existing file
export function generateExpiredWaiver(user: TestUser): WaiverFormData
export function generateWaiverExpiringIn(days: number, user: TestUser): WaiverFormData
export function generatePastEvent(daysAgo: number): EventData
export function generateEventWithinCancellationWindow(): EventData
```

#### api-helpers.ts Extensions
```typescript
// Add to existing file
export async function setWaiverExpiration(email: string, expirationDate: string): Promise<void>
export async function createMultiPersonRsvp(guardianEmail: string, eventId: string, attendees: string[]): Promise<void>
export async function simulateNetworkFailure(page: Page): Promise<void>
export async function restoreNetwork(page: Page): Promise<void>
```

## Data Models

### Reuse Existing Interfaces

All existing interfaces in Page Objects should be reused:
- `WaiverStatus` (DashboardPage.ts)
- `RsvpItem` (DashboardPage.ts)
- `MinorItem` (DashboardPage.ts)
- `TestUser` (data-generators.ts)
- `WaiverFormData` (data-generators.ts)
- `EventData` (data-generators.ts)
- `MinorData` (data-generators.ts)

### New Interfaces (Only if Necessary)

```typescript
// Add to DashboardPage.ts if needed
export interface MultiPersonRsvp extends RsvpItem {
  attendees: string[];
  canCancelIndividual: boolean;
}

// Add to EventPage.ts if needed
export interface CancellationWindow {
  deadline: Date;
  isWithinWindow: boolean;
  hoursRemaining: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 20: Multi-person selector display
*For any* guardian with registered minors, when clicking the RSVP button, the system should display a selector containing the guardian and all their minors
**Validates: Requirements 1.1**

### Property 21: Multi-person RSVP creation
*For any* selected set of attendees (guardian and/or minors), RSVP submission should create individual records for each selected person
**Validates: Requirements 1.2**

### Property 22: Multi-person RSVP validation
*For any* multi-person RSVP submission with no attendees selected, the system should prevent submission and display a validation error
**Validates: Requirements 1.3**

### Property 23: Individual attendee cancellation
*For any* multi-person RSVP, the system should allow cancellation of individual attendees while maintaining other attendees' RSVPs
**Validates: Requirements 1.4**

### Property 24: Multi-person dashboard display
*For any* multi-person RSVP, the dashboard should display all attendees associated with that RSVP
**Validates: Requirements 1.5**

### Property 25: Past event RSVP rejection
*For any* event with a past date, RSVP attempts should be rejected with an appropriate error message
**Validates: Requirements 2.1**

### Property 26: Cancellation window enforcement
*For any* RSVP within 24 hours of event start, cancellation attempts should be blocked with a time restriction message
**Validates: Requirements 2.2**

### Property 27: Cancellation outside window
*For any* RSVP more than 24 hours before event start, cancellation should be allowed
**Validates: Requirements 2.3**

### Property 28: Past event status marking
*For any* event after its start time, the system should mark associated RSVPs as past and prevent modifications
**Validates: Requirements 2.4**

### Property 29: Expired waiver dashboard prompt
*For any* volunteer with an expired waiver, the dashboard should display a prominent renewal prompt
**Validates: Requirements 3.1**

### Property 30: Waiver renewal expiration update
*For any* waiver renewal submission, the expiration date should be set to exactly one year from submission date
**Validates: Requirements 3.2**

### Property 31: Waiver expiration warning
*For any* waiver expiring within 30 days, the dashboard should display an expiration warning
**Validates: Requirements 3.3**

### Property 32: Waiver status display
*For any* volunteer with a waiver, the dashboard should display the expiration date and days remaining
**Validates: Requirements 3.4**

### Property 33: Session preservation during expiration
*For any* form submission when session expires, the system should preserve form data and prompt for re-authentication
**Validates: Requirements 4.1**

### Property 34: Multi-tab session consistency
*For any* session opened in multiple tabs, authentication state should remain consistent across all tabs
**Validates: Requirements 4.2**

### Property 35: Multi-tab logout propagation
*For any* logout action in one tab, the session should be cleared in all open tabs
**Validates: Requirements 4.3**

### Property 36: Session restoration after restart
*For any* non-expired session, browser restart should restore the session
**Validates: Requirements 4.4**

### Property 37: Browser navigation session maintenance
*For any* browser back/forward navigation, authentication state should be maintained correctly
**Validates: Requirements 4.5**

### Property 38: Field-level validation display
*For any* invalid form field input, validation messages should appear immediately
**Validates: Requirements 5.1**

### Property 39: Error field focus
*For any* form submission with validation errors, focus should move to the first error field
**Validates: Requirements 5.2**

### Property 40: Paste data validation
*For any* data pasted into form fields, the system should validate and format appropriately
**Validates: Requirements 5.3**

### Property 41: Keyboard form navigation
*For any* form navigated via keyboard, tab order should be logical and Enter should submit
**Validates: Requirements 5.4**

### Property 42: Screen reader validation announcements
*For any* validation error, screen readers should announce the error message
**Validates: Requirements 5.5**

### Property 43: Network timeout retry
*For any* form submission that times out, the system should offer retry and preserve form data
**Validates: Requirements 6.1**

### Property 44: Offline indicator display
*For any* network disconnection, the system should display an offline indicator
**Validates: Requirements 6.2**

### Property 45: Automatic retry on reconnection
*For any* network reconnection, pending operations should automatically retry
**Validates: Requirements 6.3**

### Property 46: Server error messaging
*For any* 500 error response, the system should display a user-friendly error with support information
**Validates: Requirements 6.4**

### Property 47: Empty RSVP state display
*For any* volunteer with no RSVPs, the dashboard should show an empty state with event browsing CTA
**Validates: Requirements 7.1**

### Property 48: Empty minors state display
*For any* volunteer with no minors, the dashboard should show an empty state with add minor CTA
**Validates: Requirements 7.2**

### Property 49: No waiver state display
*For any* volunteer without a waiver, the dashboard should show a prominent waiver completion CTA
**Validates: Requirements 7.3**

### Property 50: RSVP list pagination
*For any* volunteer with more than 10 RSVPs, the dashboard should paginate the RSVP list
**Validates: Requirements 7.4**

### Property 51: RSVP status filtering
*For any* RSVP status filter applied, only matching RSVPs should be displayed with active filter indication
**Validates: Requirements 7.5**

### Property 52: Minor age transition notification
*For any* minor reaching age 18, the system should display a notification about creating their own account
**Validates: Requirements 8.1**

### Property 53: Future date of birth rejection
*For any* minor with a future date of birth, submission should be rejected with validation error
**Validates: Requirements 8.2**

### Property 54: Adult date of birth rejection
*For any* minor with an adult date of birth (18+), submission should be rejected with validation error
**Validates: Requirements 8.3**

### Property 55: Minor deletion with RSVPs warning
*For any* minor with active RSVPs, deletion should display a warning and require confirmation
**Validates: Requirements 8.4**

### Property 56: Special character name handling
*For any* minor name with special characters, the system should accept and properly store the name
**Validates: Requirements 8.5**

### Property 57: Concurrent RSVP capacity handling
*For any* simultaneous RSVP attempts to an at-capacity event, excess requests should be rejected in order
**Validates: Requirements 9.1**

### Property 58: Mid-submission capacity check
*For any* RSVP submission when capacity is reached during processing, the system should reject with capacity error
**Validates: Requirements 9.2**

### Property 59: Real-time capacity display
*For any* event page view, available spots should be displayed in real-time
**Validates: Requirements 9.3**

### Property 60: Capacity increase reflection
*For any* event capacity increase, the new capacity should immediately reflect on the event page
**Validates: Requirements 9.4**

### Property 61: Cancellation spot release
*For any* RSVP cancellation, the spot should immediately become available for other volunteers
**Validates: Requirements 9.5**

### Property 62: First-time login waiver redirect
*For any* new volunteer logging in for the first time, the system should redirect to waiver submission
**Validates: Requirements 10.1**

### Property 63: Expired waiver event prompt
*For any* volunteer with expired waiver and active RSVP, the system should display renewal prompt before event
**Validates: Requirements 10.2**

### Property 64: Minor deletion RSVP cancellation
*For any* minor deletion with future RSVPs, those RSVPs should be cancelled with guardian notification
**Validates: Requirements 10.3**

### Property 65: Mobile layout optimization
*For any* mobile device access, the dashboard should display a mobile-optimized layout
**Validates: Requirements 11.1**

### Property 66: Mobile input type optimization
*For any* form field on mobile, appropriate input types and keyboards should be used
**Validates: Requirements 11.2**

### Property 67: Touch gesture responsiveness
*For any* touch gesture (tap, swipe, pinch), the system should respond appropriately
**Validates: Requirements 11.3**

### Property 68: Tablet layout optimization
*For any* tablet device access, the dashboard should use a tablet-optimized layout
**Validates: Requirements 11.4**

### Property 69: Device rotation adaptation
*For any* device rotation, the layout should adapt to the new orientation
**Validates: Requirements 11.5**

### Property 70: Keyboard focus indicators
*For any* keyboard navigation, visible focus indicators should be present on interactive elements
**Validates: Requirements 12.1**

### Property 71: Screen reader content announcement
*For any* page content, screen readers should announce all content, labels, and state changes
**Validates: Requirements 12.2**

### Property 72: Screen reader error announcement
*For any* form error, screen readers should announce the error message
**Validates: Requirements 12.3**

### Property 73: Color contrast compliance
*For any* page view, color contrast should meet WCAG 2.1 Level AA requirements
**Validates: Requirements 12.4**

### Property 74: Form submission focus management
*For any* form submission, focus should move to success message or first error
**Validates: Requirements 12.5**

### Property 75: Large RSVP list performance
*For any* volunteer with more than 50 RSVPs, dashboard should load within 3 seconds
**Validates: Requirements 13.1**

### Property 76: Large minors list performance
*For any* volunteer with more than 10 minors, the list should render within 2 seconds
**Validates: Requirements 13.2**

### Property 77: Slow network loading indicator
*For any* form submission on slow network, loading indicator should display and prevent duplicates
**Validates: Requirements 13.3**

### Property 78: Concurrent access performance
*For any* simultaneous event page access by multiple volunteers, performance and accuracy should be maintained
**Validates: Requirements 13.4**

### Property 79: Large dataset pagination
*For any* large dashboard dataset, pagination or virtual scrolling should maintain performance
**Validates: Requirements 13.5**

## Error Handling

### Reuse Existing Error Handling Patterns

The existing tests demonstrate error handling patterns that MUST be followed:

1. **Expectation Methods**: Use existing `expect*Error()` methods from Page Objects
2. **Try-Catch with Cleanup**: Always use try-finally blocks with cleanup
3. **Error Message Validation**: Check for specific error text in messages
4. **Graceful Degradation**: Tests should handle missing elements gracefully

Example from existing tests:
```typescript
try {
  // Test logic
  await eventPage.completeRsvp(firstName, lastName);
  await eventPage.expectCapacityError();
} finally {
  // Cleanup
  await deleteTestData(request, userEmail, sessionToken);
}
```

## Testing Strategy

### Property-Based Testing Framework

**CRITICAL: Use existing property-based testing library and patterns**

The existing tests use Playwright's built-in test framework with property-based naming conventions. Continue this pattern:

```typescript
/**
 * Property X: [Property Name]
 * Feature: volunteer-ux-playwright-testing, Property X: [Property Name]
 * 
 * For any [universal quantification], [expected behavior]
 * 
 * Validates: Requirements X.Y
 */
test('Property X: [Name] - [description]', async ({ page, request }) => {
  // Test implementation
});
```

### Test Configuration

**Reuse existing Playwright configuration** from `playwright.config.ts`:
- Browser projects (chromium, firefox, chrome, webkit)
- Viewport settings (1280x720)
- Timeout configurations
- Storage state handling for auth tests

### Mobile Testing Configuration

**Add to existing playwright.config.ts** (do not create new config):
```typescript
// Add mobile device projects
{
  name: 'mobile-chrome',
  use: {
    ...devices['Pixel 5'],
    storageState: 'tests/.auth/user.json',
  },
},
{
  name: 'mobile-safari',
  use: {
    ...devices['iPhone 13'],
    storageState: 'tests/.auth/user.json',
  },
},
{
  name: 'tablet',
  use: {
    ...devices['iPad Pro'],
    storageState: 'tests/.auth/user.json',
  },
}
```

### Accessibility Testing

**Add axe-core to existing test infrastructure**:
```typescript
// Add to existing utils/
import { injectAxe, checkA11y } from 'axe-playwright';

// Use in tests
await injectAxe(page);
await checkA11y(page, null, {
  detailedReport: true,
  detailedReportOptions: { html: true }
});
```

### Performance Testing

**Add performance utilities to existing wait-helpers.ts**:
```typescript
// Add to tests/utils/wait-helpers.ts
export async function measureLoadTime(page: Page): Promise<number>
export async function expectLoadTimeUnder(page: Page, maxMs: number): Promise<void>
```

## Implementation Notes

### Key Principles

1. **REUSE FIRST**: Always check if functionality exists before creating new code
2. **EXTEND, DON'T REPLACE**: Add methods to existing Page Objects
3. **FOLLOW PATTERNS**: Match existing test structure, naming, and organization
4. **LEVERAGE UTILITIES**: Use existing data generators and API helpers
5. **MAINTAIN CONSISTENCY**: Keep the same property numbering and documentation format

### Existing Helper Patterns to Reuse

From `rsvp-submission.spec.ts`:
```typescript
async function authenticateFreshUserWithWaiver(page: any, request: any) {
  // Creates user, submits waiver, authenticates
  // REUSE THIS PATTERN for new tests
}
```

From `minor-management.spec.ts`:
```typescript
async function authenticateUserWithWaiver(page: any) {
  // Authenticates and submits waiver
  // REUSE THIS PATTERN for new tests
}
```

### Test Data Management

**ALWAYS use existing data generators**:
- `generateTestUser()` - Never create users manually
- `generateWaiverData()` - Never create waiver data manually
- `generateTestMinor()` - Never create minor data manually
- `generateValidationCode()` - Never create codes manually

### Cleanup Patterns

**ALWAYS use existing cleanup pattern**:
```typescript
try {
  // Test logic
} finally {
  await deleteTestData(request, userEmail, sessionToken);
}
```

## Dependencies

### Existing Dependencies (Already Installed)
- @playwright/test
- playwright browsers (chromium, firefox, webkit)

### New Dependencies (To Add)
- axe-core - Accessibility testing
- @axe-core/playwright - Playwright integration for axe
- playwright-devices - Additional mobile device configurations (if not already included)

## Deployment Considerations

Tests will run in existing CI/CD pipeline with current configuration:
- Headless mode in CI
- 2 retries on failure
- Sequential execution (workers: 1)
- Automatic screenshot/video on failure

No changes to deployment process required.
