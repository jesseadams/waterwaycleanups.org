# Page Object Models

This directory contains Page Object Models (POMs) for the Waterway Cleanups volunteer UX testing.

## Overview

Page Object Models encapsulate page-specific selectors and interactions, providing a clean API for tests. This approach:

- Reduces code duplication
- Makes tests more maintainable
- Provides better error messages
- Separates test logic from page structure

## Available Page Objects

### LoginPage

Handles email-based passwordless authentication flow.

**Key Methods:**
- `goto()` - Navigate to login page
- `enterEmail(email)` - Enter email address
- `clickSendCode()` - Request validation code
- `enterValidationCode(code)` - Enter 6-digit code
- `clickVerifyCode()` - Submit code for verification
- `login(email, code)` - Complete full login flow
- `logout()` - Clear session and logout
- `expectLoginSuccess()` - Verify successful authentication

**Example:**
```typescript
const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.login('test@example.com', '123456');
await loginPage.expectLoginSuccess();
```

### DashboardPage

Handles the volunteer dashboard with waiver status, RSVPs, and minors.

**Key Methods:**
- `goto()` - Navigate to dashboard
- `getWaiverStatus()` - Get waiver information
- `getRsvpList()` - Get list of RSVPs
- `getMinorsList()` - Get list of minors
- `clickSubmitWaiver()` - Navigate to waiver page
- `clickManageMinors()` - Navigate to minors page
- `clickCancelRsvp(eventId)` - Cancel an RSVP
- `expectWaiverValid()` - Verify valid waiver
- `expectRsvpCount(count)` - Verify RSVP count

**Example:**
```typescript
const dashboardPage = new DashboardPage(page);
await dashboardPage.goto();
const waiverStatus = await dashboardPage.getWaiverStatus();
expect(waiverStatus.hasWaiver).toBe(true);
```

### WaiverPage

Handles volunteer waiver form submission and validation.

**Key Methods:**
- `goto()` - Navigate to waiver page
- `checkEmail(email)` - Check for existing waiver
- `fillWaiverForm(data)` - Fill waiver form fields
- `submitWaiver()` - Submit the waiver
- `submitCompleteWaiver(email, data)` - Complete full flow
- `expectFormVisible()` - Verify form is visible
- `expectValidationError(field)` - Verify field validation error
- `expectSubmissionSuccess()` - Verify successful submission

**Example:**
```typescript
const waiverPage = new WaiverPage(page);
await waiverPage.goto();
await waiverPage.submitCompleteWaiver('test@example.com', {
  fullLegalName: 'John Doe',
  phoneNumber: '555-1234',
  dateOfBirth: '1990-01-01',
  waiverAcknowledgement: true,
  adultSignature: 'John Doe',
  adultTodaysDate: '2026-01-15'
});
await waiverPage.expectSubmissionSuccess();
```

### EventPage

Handles event RSVP submission and management.

**Key Methods:**
- `gotoEvent(eventId)` - Navigate to event page
- `clickRsvpButton()` - Open RSVP form
- `fillRsvpForm(firstName, lastName)` - Fill RSVP form
- `submitRsvp()` - Submit RSVP
- `completeRsvp(firstName, lastName)` - Complete full RSVP flow
- `cancelRsvp()` - Cancel existing RSVP
- `getAttendanceCount()` - Get current attendance
- `getAttendanceCap()` - Get capacity limit
- `expectRsvpSuccess()` - Verify successful RSVP
- `expectCapacityError()` - Verify capacity error
- `expectDuplicateError()` - Verify duplicate RSVP error

**Example:**
```typescript
const eventPage = new EventPage(page);
await eventPage.gotoEvent('cleanup-event-2026');
await eventPage.completeRsvp('John', 'Doe');
await eventPage.expectRsvpSuccess();
```

### MinorsPage

Handles minor management (add, view, delete).

**Key Methods:**
- `goto()` - Navigate to minors page
- `addMinor(data)` - Add a new minor
- `deleteMinor(minorId)` - Delete a minor by ID
- `deleteMinorByName(firstName, lastName)` - Delete by name
- `getMinorsList()` - Get list of all minors
- `getMinorsCount()` - Get count of minors
- `expectMinorInList(minorId)` - Verify minor exists
- `expectMinorNotInList(minorId)` - Verify minor removed
- `expectValidationError(field)` - Verify field validation error

**Example:**
```typescript
const minorsPage = new MinorsPage(page);
await minorsPage.goto();
await minorsPage.addMinor({
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '2010-05-15'
});
await minorsPage.expectSuccessMessage();
```

## Usage in Tests

Import page objects from the index:

```typescript
import { LoginPage, DashboardPage, WaiverPage, EventPage, MinorsPage } from '../pages';

test('user can complete waiver', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const waiverPage = new WaiverPage(page);
  
  await loginPage.goto();
  await loginPage.login('test@example.com', '123456');
  
  await waiverPage.goto();
  await waiverPage.fillWaiverForm(waiverData);
  await waiverPage.submitWaiver();
  await waiverPage.expectSubmissionSuccess();
});
```

## Best Practices

1. **Use page objects for all page interactions** - Don't use raw selectors in tests
2. **Keep page objects focused** - Each page object should represent one page or component
3. **Use descriptive method names** - Methods should clearly indicate what they do
4. **Return meaningful data** - Getter methods should return structured data
5. **Handle waits internally** - Page objects should handle all waiting logic
6. **Provide assertion methods** - Include `expect*` methods for common assertions
7. **Use TypeScript types** - Define interfaces for data structures

## Maintenance

When the UI changes:

1. Update the relevant page object's locators
2. Update method implementations if behavior changes
3. Add new methods for new functionality
4. Keep tests unchanged (they use the page object API)

This separation ensures that UI changes only require updates to page objects, not to every test.
