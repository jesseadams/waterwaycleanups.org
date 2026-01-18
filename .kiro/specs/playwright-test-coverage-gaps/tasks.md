# Tasks Document

## Overview

This document breaks down the implementation of comprehensive Playwright test coverage into incremental, manageable tasks. Each task focuses on extending existing test infrastructure rather than creating new patterns.

**Implementation Philosophy:**
- Extend existing Page Objects by adding methods
- Add functions to existing utility files
- Follow existing test structure and naming conventions
- Reuse existing helper functions and cleanup patterns
- Continue property numbering from existing tests (Properties 20-79)

## Task Breakdown

### Phase 1: Foundation & Utilities

- [x] 1. Extend Data Generators
  - File: `tests/utils/data-generators.ts`
  - Action: Add new generator functions to existing file
  - Add `generateExpiredWaiver(user: TestUser): WaiverFormData` - generates waiver with past expiration
  - Add `generateWaiverExpiringIn(days: number, user: TestUser): WaiverFormData` - generates waiver expiring in N days
  - Add `generatePastEvent(daysAgo: number): EventData` - generates event in the past
  - Add `generateEventWithinCancellationWindow(): EventData` - generates event within 24 hours
  - Add `generateEventOutsideCancellationWindow(): EventData` - generates event >24 hours away
  - Reuse Pattern: Follow existing generator structure in the file (randomInt, randomElement, etc.)
  - _Requirements: Foundation for 2, 3_

- [x] 2. Extend API Helpers
  - File: `tests/utils/api-helpers.ts`
  - Action: Add new API helper functions to existing file
  - Add `setWaiverExpiration(email: string, expirationDate: string): Promise<void>` - updates waiver expiration in DynamoDB
  - Add `createMultiPersonRsvp(guardianEmail: string, eventId: string, attendees: string[]): Promise<void>` - creates RSVP for multiple people
  - Add `simulateNetworkFailure(page: Page): Promise<void>` - simulates network disconnection
  - Add `restoreNetwork(page: Page): Promise<void>` - restores network connection
  - Add `getEventCapacity(eventId: string): Promise<number>` - retrieves current event capacity
  - Reuse Pattern: Follow existing API helper structure with request context and error handling
  - _Requirements: Foundation for 3, 6, 9_

- [x] 3. Add Performance Utilities
  - File: `tests/utils/wait-helpers.ts`
  - Action: Add performance measurement functions to existing file
  - Add `measureLoadTime(page: Page): Promise<number>` - measures page load time
  - Add `expectLoadTimeUnder(page: Page, maxMs: number): Promise<void>` - asserts load time
  - Add `waitForNetworkIdle(page: Page, timeout?: number): Promise<void>` - waits for network idle
  - Reuse Pattern: Follow existing wait helper patterns with timeout configurations
  - _Requirements: Foundation for 13_


### Phase 2: Page Object Extensions

- [x] 4. Extend EventPage for Multi-Person RSVP
  - File: `tests/pages/EventPage.ts`
  - Action: Add methods to existing EventPage class
  - Add `hasMultiPersonSelector(): Promise<boolean>` - checks if multi-person UI is displayed
  - Add `selectAttendees(attendees: string[]): Promise<void>` - selects specific attendees from list
  - Add `getSelectedAttendees(): Promise<string[]>` - returns currently selected attendees
  - Add `cancelIndividualAttendee(name: string): Promise<void>` - cancels one person from group
  - Add `getMultiPersonRsvpAttendees(): Promise<string[]>` - gets all attendees for current RSVP
  - Add `expectMultiPersonSelectorVisible(): Promise<void>` - asserts selector is shown
  - Add `expectAttendeeSelected(name: string): Promise<void>` - asserts attendee is selected
  - Reuse Pattern: Follow existing EventPage method structure with locators and assertions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 5. Extend EventPage for Time-Based Restrictions
  - File: `tests/pages/EventPage.ts`
  - Action: Add methods to existing EventPage class
  - Add `isPastEvent(): Promise<boolean>` - checks if event date has passed
  - Add `getCancellationDeadline(): Promise<Date>` - gets 24-hour cancellation deadline
  - Add `isWithinCancellationWindow(): Promise<boolean>` - checks if within 24 hours
  - Add `expectCancellationRestricted(): Promise<void>` - asserts cancellation is blocked
  - Add `expectPastEventError(): Promise<void>` - asserts past event RSVP error
  - Add `expectCancellationWindowMessage(): Promise<void>` - asserts time restriction message
  - Reuse Pattern: Follow existing EventPage assertion methods like `expectCapacityError()`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Extend DashboardPage for Waiver & Empty States
  - File: `tests/pages/DashboardPage.ts`
  - Action: Add methods to existing DashboardPage class
  - Add `getWaiverExpirationWarning(): Promise<string | null>` - gets expiration warning text
  - Add `expectRenewalPrompt(): Promise<void>` - asserts renewal prompt is shown
  - Add `expectExpirationWarning(days: number): Promise<void>` - asserts warning for N days
  - Add `getWaiverDaysRemaining(): Promise<number>` - gets days until expiration
  - Add `expectEmptyRsvpState(): Promise<void>` - asserts empty RSVP state with CTA
  - Add `expectEmptyMinorsState(): Promise<void>` - asserts empty minors state with CTA
  - Add `expectNoWaiverState(): Promise<void>` - asserts no waiver state with CTA
  - Add `getRsvpPagination(): Promise<any>` - gets pagination controls
  - Add `filterRsvpsByStatus(status: string): Promise<void>` - filters RSVPs
  - Add `expectActiveFilter(status: string): Promise<void>` - asserts filter is active
  - Reuse Pattern: Follow existing DashboardPage getter and assertion methods
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7. Extend MinorsPage for Edge Cases
  - File: `tests/pages/MinorsPage.ts`
  - Action: Add methods to existing MinorsPage class
  - Add `expectAgeTransitionNotification(): Promise<void>` - asserts 18+ notification
  - Add `expectFutureDateError(): Promise<void>` - asserts future DOB error
  - Add `expectAdultDateError(): Promise<void>` - asserts adult DOB error
  - Add `expectDeletionWarning(): Promise<void>` - asserts deletion warning for active RSVPs
  - Add `confirmDeletion(): Promise<void>` - confirms deletion in dialog
  - Add `addMinorWithSpecialCharacters(name: string, dob: string): Promise<void>` - adds minor with special chars
  - Reuse Pattern: Follow existing MinorsPage validation methods
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


### Phase 3: Multi-Person RSVP Tests

- [x] 8. Property 20-21 - Multi-Person Selector & Creation
  - File: `tests/e2e/rsvp/multi-person-rsvp.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 20: Multi-person selector display test
  - Property 21: Multi-person RSVP creation test
  - Reuse Pattern: Use `authenticateFreshUserWithWaiver()` helper from rsvp-submission.spec.ts
  - Use existing EventPage and DashboardPage
  - Follow existing property-based test structure
  - Use try-finally cleanup with `deleteTestData()`
  - _Requirements: 1.1, 1.2_

- [x] 9. Property 22-24 - Multi-Person Validation & Cancellation
  - File: `tests/e2e/rsvp/multi-person-rsvp.spec.ts`
  - Action: Add tests to file created in Task 8
  - Property 22: Multi-person RSVP validation test
  - Property 23: Individual attendee cancellation test
  - Property 24: Multi-person dashboard display test
  - Reuse Pattern: Use same helper functions as Task 8
  - Use `generateTestMinor()` for creating minors
  - Follow existing cleanup patterns
  - _Requirements: 1.3, 1.4, 1.5_

- [x] 10. Property 25-28 - Time-Based RSVP Restrictions
  - File: `tests/e2e/rsvp/time-restrictions.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 25: Past event RSVP rejection test
  - Property 26: Cancellation window enforcement test
  - Property 27: Cancellation outside window test
  - Property 28: Past event status marking test
  - Reuse Pattern: Use `authenticateFreshUserWithWaiver()` helper
  - Use `generatePastEvent()` and `generateEventWithinCancellationWindow()` from Task 1
  - Follow existing test structure
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 11. Property 29-32 - Waiver Lifecycle
  - File: `tests/e2e/waiver/waiver-lifecycle.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 29: Expired waiver dashboard prompt test
  - Property 30: Waiver renewal expiration update test
  - Property 31: Waiver expiration warning test
  - Property 32: Waiver status display test
  - Reuse Pattern: Use `authenticateUserWithWaiver()` helper from minor-management.spec.ts
  - Use `setWaiverExpiration()` from Task 2
  - Use existing WaiverPage and DashboardPage
  - Follow existing cleanup patterns
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 12. Property 33-37 - Session Management Edge Cases
  - File: `tests/e2e/auth/session-management.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 33: Session preservation during expiration test
  - Property 34: Multi-tab session consistency test
  - Property 35: Multi-tab logout propagation test
  - Property 36: Session restoration after restart test
  - Property 37: Browser navigation session maintenance test
  - Reuse Pattern: Use existing LoginPage methods
  - Follow authentication.spec.ts patterns
  - Use existing session token helpers
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_


### Phase 4: Form Validation & Network Tests

- [ ] 13. Property 38-42 - Form Validation & UX
  - File: `tests/e2e/dashboard/form-validation.spec.ts` (NEW)
  - Action: Create new test file in new directory
  - Property 38: Field-level validation display test
  - Property 39: Error field focus test
  - Property 40: Paste data validation test
  - Property 41: Keyboard form navigation test
  - Property 42: Screen reader validation announcements test
  - Reuse Pattern: Use `authenticateFreshUserWithWaiver()` helper
  - Use existing Page Objects
  - Follow existing validation testing patterns
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 14. Property 43-46 - Network Failure Recovery
  - File: `tests/e2e/dashboard/network-recovery.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 43: Network timeout retry test
  - Property 44: Offline indicator display test
  - Property 45: Automatic retry on reconnection test
  - Property 46: Server error messaging test
  - Reuse Pattern: Use `simulateNetworkFailure()` and `restoreNetwork()` from Task 2
  - Use existing Page Objects
  - Follow existing error handling patterns
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 15. Property 47-51 - Dashboard Empty States
  - File: `tests/e2e/dashboard/empty-states.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 47: Empty RSVP state display test
  - Property 48: Empty minors state display test
  - Property 49: No waiver state display test
  - Property 50: RSVP list pagination test
  - Property 51: RSVP status filtering test
  - Reuse Pattern: Use `authenticateFreshUserWithWaiver()` helper
  - Use DashboardPage methods from Task 6
  - Follow existing dashboard testing patterns
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_


### Phase 5: Minor Management & Capacity Tests

- [ ] 16. Property 52-56 - Minor Management Edge Cases
  - File: `tests/e2e/minors/minor-edge-cases.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 52: Minor age transition notification test
  - Property 53: Future date of birth rejection test
  - Property 54: Adult date of birth rejection test
  - Property 55: Minor deletion with RSVPs warning test
  - Property 56: Special character name handling test
  - Reuse Pattern: Use `authenticateUserWithWaiver()` helper
  - Use `generateInvalidMinor()` from data-generators.ts
  - Use MinorsPage methods from Task 7
  - Follow minor-management.spec.ts patterns
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. Property 57-61 - Event Capacity Race Conditions
  - File: `tests/e2e/rsvp/capacity-race-conditions.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 57: Concurrent RSVP capacity handling test
  - Property 58: Mid-submission capacity check test
  - Property 59: Real-time capacity display test
  - Property 60: Capacity increase reflection test
  - Property 61: Cancellation spot release test
  - Reuse Pattern: Use `generateFullCapacityEvent()` from data-generators.ts
  - Use existing EventPage methods
  - Use Promise.all() for concurrent testing
  - Follow existing cleanup patterns
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 18. Property 62-64 - Complete User Journey Integration
  - File: `tests/e2e/integration/user-journey.spec.ts` (NEW)
  - Action: Create new test file in new directory
  - Property 62: First-time login waiver redirect test
  - Property 63: Expired waiver event prompt test
  - Property 64: Minor deletion RSVP cancellation test
  - Reuse Pattern: Use existing LoginPage, WaiverPage, EventPage, DashboardPage
  - Combine patterns from multiple existing tests
  - Follow existing end-to-end flow patterns
  - _Requirements: 10.1, 10.2, 10.3_


### Phase 6: Mobile, Accessibility & Performance

- [ ] 19. Configure Mobile Testing
  - File: `playwright.config.ts`
  - Action: Add mobile device projects to existing config
  - Add mobile-chrome project with Pixel 5 device
  - Add mobile-safari project with iPhone 13 device
  - Add tablet project with iPad Pro device
  - Reuse Pattern: Follow existing project configuration structure
  - _Requirements: Foundation for 11_

- [ ] 20. Property 65-69 - Mobile & Responsive Testing
  - File: `tests/e2e/dashboard/mobile-responsive.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 65: Mobile layout optimization test
  - Property 66: Mobile input type optimization test
  - Property 67: Touch gesture responsiveness test
  - Property 68: Tablet layout optimization test
  - Property 69: Device rotation adaptation test
  - Reuse Pattern: Use mobile device configurations from Task 19
  - Use existing Page Objects
  - Follow existing responsive testing patterns
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 21. Install Accessibility Dependencies
  - Action: Install axe-core packages
  - Run: `npm install --save-dev axe-core @axe-core/playwright`
  - Create accessibility helper in `tests/utils/accessibility-helpers.ts`
  - Add `injectAxe(page: Page): Promise<void>`
  - Add `checkA11y(page: Page, options?: any): Promise<void>`
  - Add `expectA11yCompliance(page: Page): Promise<void>`
  - Reuse Pattern: Follow existing utility file structure
  - _Requirements: Foundation for 12_

- [ ] 22. Property 70-74 - Accessibility Compliance
  - File: `tests/e2e/dashboard/accessibility.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 70: Keyboard focus indicators test
  - Property 71: Screen reader content announcement test
  - Property 72: Screen reader error announcement test
  - Property 73: Color contrast compliance test
  - Property 74: Form submission focus management test
  - Reuse Pattern: Use accessibility helpers from Task 21
  - Use existing Page Objects
  - Follow existing accessibility testing patterns
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 23. Property 75-79 - Performance Under Load
  - File: `tests/e2e/dashboard/performance.spec.ts` (NEW)
  - Action: Create new test file in existing directory
  - Property 75: Large RSVP list performance test
  - Property 76: Large minors list performance test
  - Property 77: Slow network loading indicator test
  - Property 78: Concurrent access performance test
  - Property 79: Large dataset pagination test
  - Reuse Pattern: Use performance utilities from Task 3
  - Use existing Page Objects
  - Follow existing performance testing patterns
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

---

## Implementation Order

### Sprint 1: Foundation (Week 1)
- Task 1: Extend Data Generators
- Task 2: Extend API Helpers
- Task 3: Add Performance Utilities
- Task 4: Extend EventPage for Multi-Person RSVP

### Sprint 2: Core Features (Week 2)
- Task 5: Extend EventPage for Time-Based Restrictions
- Task 6: Extend DashboardPage for Waiver & Empty States
- Task 7: Extend MinorsPage for Edge Cases
- Task 8: Property 20-21 - Multi-Person Selector & Creation

### Sprint 3: Multi-Person & Time Tests (Week 3)
- Task 9: Property 22-24 - Multi-Person Validation & Cancellation
- Task 10: Property 25-28 - Time-Based RSVP Restrictions
- Task 11: Property 29-32 - Waiver Lifecycle
- Task 12: Property 33-37 - Session Management Edge Cases

### Sprint 4: Validation & Network (Week 4)
- Task 13: Property 38-42 - Form Validation & UX
- Task 14: Property 43-46 - Network Failure Recovery
- Task 15: Property 47-51 - Dashboard Empty States
- Task 16: Property 52-56 - Minor Management Edge Cases

### Sprint 5: Capacity & Integration (Week 5)
- Task 17: Property 57-61 - Event Capacity Race Conditions
- Task 18: Property 62-64 - Complete User Journey Integration
- Task 19: Configure Mobile Testing
- Task 21: Install Accessibility Dependencies

### Sprint 6: Mobile, A11y & Performance (Week 6)
- Task 20: Property 65-69 - Mobile & Responsive Testing
- Task 22: Property 70-74 - Accessibility Compliance
- Task 23: Property 75-79 - Performance Under Load

## Success Criteria

Each task is complete when:
1. All tests pass on all configured browsers
2. Code follows existing patterns and conventions
3. Property-based test structure is maintained
4. Cleanup patterns are implemented
5. Tests are documented with property descriptions
6. No new Page Objects or utilities created unnecessarily

## Estimated Total Effort

- Phase 1 (Foundation): 7 hours
- Phase 2 (Page Objects): 14 hours
- Phase 3 (Multi-Person & Core): 24 hours
- Phase 4 (Validation & Network): 15 hours
- Phase 5 (Minors & Capacity): 16 hours
- Phase 6 (Mobile, A11y, Performance): 20 hours

**Total: ~96 hours (12 days at 8 hours/day or 6 weeks at 16 hours/week)**

## Notes

- All tasks extend existing files where possible
- New test files follow existing directory structure
- Property numbering continues from 20-79
- All tests use existing helper functions
- Cleanup patterns are consistent across all tests
- Mobile and accessibility testing require new dependencies
- Performance testing uses existing infrastructure with new utilities
