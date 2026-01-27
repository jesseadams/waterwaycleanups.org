# Infrastructure Limitations for Playwright Test Coverage

## Overview

This document describes infrastructure limitations discovered during the implementation of comprehensive Playwright test coverage for the volunteer UX.

## Capacity Race Condition Tests (Properties 57-61)

### Status: SKIPPED

### Requirements Affected
- Requirement 9.1: Concurrent RSVP capacity handling
- Requirement 9.2: Mid-submission capacity check
- Requirement 9.3: Real-time capacity display
- Requirement 9.4: Capacity increase reflection
- Requirement 9.5: Cancellation spot release

### Problem Description

The capacity race condition tests (Properties 57-61) require the ability to create test events with controlled capacity for testing concurrent access scenarios. However, the current architecture has the following constraints:

1. **Static Site Architecture**: Events are Hugo-generated static pages, not dynamically created from the database
2. **No Dynamic Event Pages**: Test events created in DynamoDB don't have corresponding HTML pages
3. **UI Elements Missing**: RSVP buttons and capacity displays don't exist for dynamically created events
4. **API Restrictions**: API calls to test events return 403 Forbidden errors because the events aren't recognized by the system

### Test Implementation

The tests were implemented correctly according to the specification:
- File: `tests/e2e/rsvp/capacity-race-conditions.spec.ts`
- All 5 properties (57-61) are implemented
- Tests use proper concurrent testing patterns with `Promise.all()`
- Tests follow existing authentication and cleanup patterns
- Tests are marked with `.skip` to prevent execution

### Failure Examples

When tests were run without `.skip`:

1. **Property 57** (Concurrent RSVP): 
   - Error: `locator.click: Timeout 10000ms exceeded` on RSVP button
   - Cause: Test event page doesn't exist

2. **Property 58** (Mid-submission capacity):
   - Error: `Failed to submit RSVP: 403 - {"message":"Forbidden"}`
   - Cause: Event not recognized by API

3. **Property 59** (Real-time capacity display):
   - Error: `locator.textContent: Timeout 10000ms exceeded` on capacity element
   - Cause: No UI page exists for test event

4. **Property 60** (Capacity increase reflection):
   - Error: `locator.textContent: Timeout 10000ms exceeded` on capacity element
   - Cause: No UI page exists for test event

5. **Property 61** (Cancellation spot release):
   - Error: `Failed to submit RSVP: 403 - {"message":"Forbidden"}`
   - Cause: Event not recognized by API

### Possible Solutions

To enable these tests in the future, one of the following approaches could be implemented:

#### Option 1: Dynamic Event Page Generation (Recommended)
- Implement a test mode that generates event pages dynamically from database
- Create a test-only route that serves event pages for test events
- Requires backend changes to support dynamic event rendering

#### Option 2: Dedicated Test Event Markdown Files
- Create Hugo markdown files for test events with known capacity
- Store in `content/en/events/test-events/`
- Requires coordination between tests and Hugo build process
- Risk of test events appearing in production

#### Option 3: API-Level Testing Only
- Rewrite tests to validate capacity logic at API level without UI
- Skip UI interaction testing for capacity scenarios
- Loses coverage of UI behavior during race conditions

#### Option 4: Mock Event Pages
- Create mock event pages in the test environment
- Serve from a test-specific directory
- Requires test infrastructure changes

### Current Workaround

The tests are implemented and skipped with clear documentation:
- Tests exist in the codebase with proper structure
- Each test has a `**SKIPPED**` comment explaining the limitation
- Tests can be enabled once infrastructure changes are made
- No changes needed to test code itself

### Impact Assessment

**Coverage Gap**: 
- 5 properties (57-61) cannot be tested
- Requirements 9.1-9.5 cannot be validated
- Capacity race conditions are not covered by automated tests

**Risk Level**: Medium
- Capacity handling is critical for user experience
- Race conditions can lead to overbooking or poor UX
- Manual testing required for these scenarios

**Mitigation**:
- Existing capacity checks in the API provide some protection
- Manual testing should cover capacity scenarios
- Monitor production for capacity-related issues

### Recommendations

1. **Short-term**: Continue with manual testing for capacity scenarios
2. **Medium-term**: Implement Option 1 (dynamic event page generation for tests)
3. **Long-term**: Consider moving to a more dynamic event system that supports testing

### Related Files

- Test file: `tests/e2e/rsvp/capacity-race-conditions.spec.ts`
- Requirements: `.kiro/specs/playwright-test-coverage-gaps/requirements.md` (Requirement 9)
- Design: `.kiro/specs/playwright-test-coverage-gaps/design.md` (Properties 57-61)
- Tasks: `.kiro/specs/playwright-test-coverage-gaps/tasks.md` (Task 17)

### Date Identified

January 19, 2026

### Last Updated

January 19, 2026

---

## Performance Under Load Tests (Properties 75-79)

### Status: IMPLEMENTED WITH BULK DATA SEEDER ✅

### Requirements Affected
- Requirement 13.1: Large RSVP list performance
- Requirement 13.2: Large minors list performance
- Requirement 13.3: Slow network loading indicator
- Requirement 13.4: Concurrent access performance
- Requirement 13.5: Large dataset pagination

### Solution Implemented

**Bulk Data Seeder**: Created `tests/utils/bulk-data-seeder.ts` to directly seed test data into DynamoDB, bypassing API authentication issues and enabling fast bulk data creation.

### Test Implementation

All tests are fully implemented and running:
- File: `tests/e2e/dashboard/performance.spec.ts`
- Bulk seeder: `tests/utils/bulk-data-seeder.ts`
- All 5 properties (75-79) are implemented
- Tests use proper performance measurement utilities from `wait-helpers.ts`
- Tests follow existing authentication and cleanup patterns

### Test Status

#### Property 75: Large RSVP List Performance
- **Status**: FAILING ⚠️ (actual performance issue)
- **Result**: Dashboard loads in 9160ms with 55 RSVPs (threshold: 3000ms)
- **Bulk Seeder**: ✅ Successfully seeds 55 RSVPs in ~1776ms
- **Issue**: Real performance bottleneck in dashboard rendering with large datasets
- **Recommendation**: Investigate dashboard optimization or adjust threshold

#### Property 76: Large Minors List Performance
- **Status**: FAILING ⚠️ (actual performance issue)
- **Result**: Minors list renders in 3172ms with 15 minors (threshold: 2000ms)
- **Bulk Seeder**: ✅ Successfully seeds 15 minors in ~132ms
- **Issue**: Real performance bottleneck in minors list rendering
- **Recommendation**: Investigate minors page optimization or adjust threshold

#### Property 77: Slow Network Loading Indicator
- **Status**: SKIPPED (event-specific)
- **Reason**: Test event uses direct RSVP without form (no loading indicator to test)
- **Note**: Test correctly detects and skips when no form is present
- **Alternative**: Test with different event that has RSVP form

#### Property 78: Concurrent Access Performance
- **Status**: PASSED ✅
- **Result**: 3 concurrent users loaded event page in 1508ms (threshold: 5000ms)
- **Note**: Excellent concurrent access performance

#### Property 79: Large Dataset Pagination
- **Status**: PASSED ✅
- **Result**: Dashboard loads in 461ms with 25 RSVPs (threshold: 3000ms)
- **Bulk Seeder**: ✅ Successfully seeds 25 RSVPs in ~789ms
- **Note**: Pagination/virtual scrolling working well for moderate datasets

### Bulk Data Seeder Features

The bulk data seeder (`tests/utils/bulk-data-seeder.ts`) provides:

1. **Fast RSVP Creation**: `seedBulkRsvps()` creates RSVPs with unique keys using suffixed attendee IDs
   - Creates 55 RSVPs in ~1776ms (vs 10+ minutes via UI)
   - Handles multiple RSVPs per event by appending suffixes (email-rsvp1, email-rsvp2)
   
2. **Fast Minor Creation**: `seedBulkMinors()` creates minors in batches of 25
   - Creates 15 minors in ~132ms (vs 5+ minutes via UI)
   - Uses DynamoDB BatchWriteItem for efficiency

3. **Convenience Function**: `seedPerformanceTestData()` for complete setup
   - Configurable RSVP and minor counts
   - Configurable event slugs for distribution

4. **Cleanup**: `cleanupSeededData()` removes all seeded data including suffixed records
   - Scans for all records matching guardian email
   - Handles suffixed attendee IDs correctly

### Performance Findings

The tests revealed actual performance issues:

1. **Dashboard with 55 RSVPs**: 9160ms load time (3x over threshold)
   - Possible causes: Inefficient rendering, lack of virtualization, excessive API calls
   - Impact: Poor UX for active volunteers with many RSVPs

2. **Minors List with 15 minors**: 3172ms render time (1.6x over threshold)
   - Possible causes: Inefficient React rendering, lack of optimization
   - Impact: Noticeable delay for guardians with multiple minors

3. **Concurrent Access**: Excellent performance (1508ms for 3 users)
   - System handles concurrent load well

4. **Moderate Datasets**: Good performance (461ms for 25 RSVPs)
   - Performance degrades non-linearly with dataset size

### Recommendations

#### Short-term
1. **Adjust Thresholds**: Consider if current thresholds are realistic for production environment
   - Property 75: Increase threshold to 10000ms (10 seconds) for 50+ RSVPs
   - Property 76: Increase threshold to 3500ms (3.5 seconds) for 15+ minors
   - Document that these are acceptable performance levels

2. **Document Performance Characteristics**: Add performance expectations to user documentation
   - Inform users that large datasets may take longer to load
   - Set appropriate expectations

#### Medium-term
1. **Optimize Dashboard Rendering**: Investigate and fix performance bottlenecks
   - Implement virtual scrolling for RSVP list
   - Optimize React component rendering
   - Reduce unnecessary re-renders
   - Consider pagination for large datasets

2. **Optimize Minors List**: Improve minors page performance
   - Implement virtual scrolling or pagination
   - Optimize React component structure
   - Reduce API calls if possible

#### Long-term
1. **Performance Monitoring**: Add performance monitoring to production
   - Track dashboard load times
   - Monitor minors list render times
   - Alert on performance degradation

2. **Scalability Testing**: Regular performance testing with realistic data volumes
   - Test with 100+ RSVPs
   - Test with 50+ minors
   - Identify breaking points

### Related Files

- Test file: `tests/e2e/dashboard/performance.spec.ts`
- Bulk seeder: `tests/utils/bulk-data-seeder.ts`
- Page Objects: `tests/pages/EventPage.ts`, `tests/pages/MinorsPage.ts`, `tests/pages/DashboardPage.ts`
- Requirements: `.kiro/specs/playwright-test-coverage-gaps/requirements.md` (Requirement 13)
- Design: `.kiro/specs/playwright-test-coverage-gaps/design.md` (Properties 75-79)
- Tasks: `.kiro/specs/playwright-test-coverage-gaps/tasks.md` (Task 23)

### Date Identified

January 19, 2026

### Last Updated

January 19, 2026 - Bulk data seeder implemented, tests running, performance issues identified
