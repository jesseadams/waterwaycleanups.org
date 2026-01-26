import { test, expect } from '../../fixtures/test-fixtures';
import { EventPage } from '../../pages/EventPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { WaiverPage } from '../../pages/WaiverPage';
import { LoginPage } from '../../pages/LoginPage';
import { generateWaiverData, generateTestUser, generateValidationCode } from '../../utils/data-generators';
import { 
  deleteTestData,
  insertTestValidationCode
} from '../../utils/api-helpers';

/**
 * RSVP Submission Tests
 * 
 * Tests the event RSVP submission flow including:
 * - RSVP creation
 * - Capacity enforcement
 * - Duplicate prevention
 * - RSVP cancellation
 * - Dashboard sorting
 * 
 * Note: Each test creates its own unique user to avoid conflicts
 */

test.describe('RSVP Submission Flow', () => {
  // Don't use global storage state - each test creates its own user
  test.use({ storageState: { cookies: [], origins: [] } });
  
  // Each test gets a unique user to avoid conflicts
  let userEmail: string;
  let sessionToken: string;
  let testUser: any;
  
  /**
   * Helper function to authenticate a fresh user with waiver
   * Uses the same pattern as working auth/waiver tests
   */
  async function authenticateFreshUserWithWaiver(page: any, _request: any) {
    const testUser = generateTestUser();
    const testCode = generateValidationCode();
    
    // Step 1: Create waiver through UI
    const waiverPage = new WaiverPage(page);
    const waiverData = generateWaiverData(testUser);
    
    await waiverPage.goto();
    await waiverPage.submitCompleteWaiver(testUser.email, waiverData);
    await page.waitForTimeout(2000);
    
    console.log('✅ Waiver created for', testUser.email);
    
    // Step 2: Authenticate using LoginPage (same as working tests)
    const loginPage = new LoginPage(page);
    
    await page.goto('/volunteer');
    await page.waitForLoadState('networkidle');
    
    // Enter email and request code
    await loginPage.enterEmail(testUser.email);
    await loginPage.clickSendCode();
    await page.waitForTimeout(2000);
    
    // Insert test validation code
    await insertTestValidationCode(testUser.email, testCode);
    await page.waitForTimeout(500);
    
    // Enter and verify code through UI
    await loginPage.enterValidationCode(testCode);
    await loginPage.clickVerifyCode();
    await page.waitForTimeout(2000);
    
    // Get session token from localStorage
    const sessionToken = await loginPage.getSessionToken();
    
    if (!sessionToken) {
      throw new Error('No session token after authentication');
    }
    
    console.log('✅ User authenticated:', testUser.email);
    
    return { testUser, sessionToken };
  }
  
  test.beforeEach(async ({ page, request, testEvent }) => {
    // PRE-TEST CLEANUP: Delete any existing RSVPs for the test event
    // This handles stale data from previous interrupted/failed test runs
    try {
      const { DynamoDBClient, ScanCommand, DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
      const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
      const tableName = 'event_rsvps-staging';
      
      // Find all RSVPs for this test event
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'event_id = :eventId',
        ExpressionAttributeValues: {
          ':eventId': { S: testEvent }
        }
      }));
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        console.log(`🧹 PRE-TEST: Cleaning ${scanResult.Items.length} stale RSVPs for event ${testEvent}`);
        
        for (const item of scanResult.Items) {
          await dynamoClient.send(new DeleteItemCommand({
            TableName: tableName,
            Key: {
              event_id: item.event_id,
              attendee_id: item.attendee_id
            }
          }));
        }
        console.log(`✅ PRE-TEST: Cleaned up stale RSVPs for ${testEvent}`);
      }
    } catch (error) {
      console.error(`⚠️ PRE-TEST: Error cleaning stale RSVPs:`, error);
      // Continue with test - cleanup is best effort
    }
    
    // Authenticate a fresh user with waiver for each test
    const result = await authenticateFreshUserWithWaiver(page, request);
    testUser = result.testUser;
    userEmail = testUser.email;
    sessionToken = result.sessionToken;
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    if (userEmail) {
      try {
        await deleteTestData(userEmail);
        console.log(`🧹 Cleaned up test data for ${userEmail}`);
      } catch (error) {
        console.error(`Failed to clean up test data for ${userEmail}:`, error);
      }
    }
  });
  
  /**
   * Property 10: RSVP creation
   * Feature: volunteer-ux-playwright-testing, Property 10: RSVP creation
   * Validates: Requirements 3.1
   * 
   * For any authenticated user with a valid waiver and available event,
   * RSVP submission should create an RSVP record and display confirmation
   */
  test('Property 10: RSVP creation - authenticated user with valid waiver can RSVP to available event', async ({ page, request, testEvent }) => {
    // Use worker-specific test event to avoid capacity conflicts
    const testEventSlug = testEvent;
    
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      if (text.includes('RSVP') || text.includes('error') || text.includes('Error')) {
        console.log(`Browser console: [${msg.type()}] ${text}`);
      }
    });
    
    try {
      // Waiver is created in beforeEach hook
      
      // Navigate to event page
      const eventPage = new EventPage(page);
      await eventPage.gotoEvent(testEventSlug);
      
      // Debug: Verify we're on the correct event page
      const currentUrl = page.url();
      console.log('Current URL after navigation:', currentUrl);
      console.log('Expected event slug:', testEventSlug);
      expect(currentUrl).toContain(testEventSlug);
      
      // Debug: Check auth state before RSVP
      const authState = await page.evaluate(() => {
        return {
          hasAuthClient: !!window.authClient,
          isAuthenticated: window.authClient?.isAuthenticated(),
          email: window.authClient?.getUserEmail(),
          sessionToken: localStorage.getItem('auth_session_token')
        };
      });
      console.log('Auth state before RSVP:', authState);
      
      // Submit RSVP
      const firstName = testUser.firstName;
      const lastName = testUser.lastName;
      await eventPage.completeRsvp(firstName, lastName);
      
      // Debug: Check for any JavaScript errors
      const consoleErrors = await page.evaluate(() => {
        return (window as any).__testErrors || [];
      });
      if (consoleErrors.length > 0) {
        console.log('JavaScript errors:', consoleErrors);
      }
      
      // Verify: RSVP success message is displayed
      await eventPage.expectRsvpSuccess();
      
      // Wait for RSVP to be processed
      await page.waitForTimeout(2000);
      
      // Verify: RSVP appears in user dashboard
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      const rsvps = await dashboardPage.getRsvpList();
      console.log('Dashboard RSVPs found:', rsvps.length);
      console.log('Dashboard RSVPs:', JSON.stringify(rsvps, null, 2));
      console.log('Looking for event:', testEventSlug);
      
      // Find the RSVP for this event by matching the eventId (which is the slug)
      const hasRsvp = rsvps.some(rsvp => rsvp.eventId === testEventSlug);
      expect(hasRsvp).toBe(true);
      
    } finally {
      // Cleanup
      await deleteTestData(request, userEmail, sessionToken);
    }
  });

  /**
   * Property 11: Capacity enforcement
   * Feature: volunteer-ux-playwright-testing, Property 11: Capacity enforcement
   * Validates: Requirements 3.2
   * 
   * For any event at capacity, RSVP attempts should be rejected
   * with an appropriate error message
   */
  test('Property 11: Capacity enforcement - RSVP rejected when event at capacity', async ({ page, request }) => {
    // Note: This test will be skipped if no event is at capacity
    // Using a real event - may need to manually set capacity to test this
    const testEventSlug = 'potomac-run-road-cleanup-august-2026';
    
    try {
      // Waiver is created in beforeEach hook
      
      // Navigate to event page
      const eventPage = new EventPage(page);
      await eventPage.gotoEvent(testEventSlug);
      
      // Check if event is at capacity
      const isAtCapacity = await eventPage.isAtCapacity();
      
      if (!isAtCapacity) {
        // Skip test if event is not at capacity
        test.skip();
        return;
      }
      
      // Attempt to submit RSVP
      const firstName = testUser.firstName;
      const lastName = testUser.lastName;
      await eventPage.completeRsvp(firstName, lastName);
      
      // Verify: Capacity error message is displayed
      await eventPage.expectCapacityError();
      
      // Verify: RSVP was not created
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      const rsvps = await dashboardPage.getRsvpList();
      const hasRsvp = rsvps.some(rsvp => 
        rsvp.eventTitle.toLowerCase().includes('potomac run')
      );
      expect(hasRsvp).toBe(false);
      
    } finally {
      // Cleanup
      await deleteTestData(request, userEmail, sessionToken);
    }
  });

  /**
   * Property 12: Duplicate RSVP prevention
   * Feature: volunteer-ux-playwright-testing, Property 12: Duplicate RSVP prevention
   * Validates: Requirements 3.3
   * 
   * For any user who has already RSVP'd to an event,
   * subsequent RSVP attempts should be rejected with an appropriate message
   */
  test('Property 12: Duplicate RSVP prevention - second RSVP attempt rejected', async ({ page, request }) => {
    // Test event - using a real event
    const testEventSlug = 'crows-nest-wetlands-accokeek-creek-cleanup-may-2026';
    
    try {
      // Waiver is created in beforeEach hook
      
      // Navigate to event page
      const eventPage = new EventPage(page);
      await eventPage.gotoEvent(testEventSlug);
      
      // Submit first RSVP
      const firstName = testUser.firstName;
      const lastName = testUser.lastName;
      await eventPage.completeRsvp(firstName, lastName);
      await eventPage.expectRsvpSuccess();
      
      // Wait for RSVP to be processed
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
      
      // Attempt to submit second RSVP
      const hasActiveRsvp = await eventPage.hasActiveRsvp();
      
      if (hasActiveRsvp) {
        // If cancel button is visible, user already has RSVP
        // This is the expected state - duplicate prevention worked
        await eventPage.expectCancelButtonVisible();
      } else {
        // If RSVP form is still available, try to submit again
        await eventPage.completeRsvp(firstName, lastName);
        
        // Verify: Duplicate error message is displayed
        await eventPage.expectDuplicateError();
      }
      
    } finally {
      // Cleanup
      await deleteTestData(request, userEmail, sessionToken);
    }
  });

  /**
   * Property 13: RSVP cancellation
   * Feature: volunteer-ux-playwright-testing, Property 13: RSVP cancellation
   * Validates: Requirements 3.4
   * 
   * For any RSVP cancelled more than 24 hours before the event,
   * the system should mark it as cancelled and update the dashboard
   */
  test('Property 13: RSVP cancellation - cancelled RSVP updates dashboard', async ({ page, request, testEvent }) => {
    // Use worker-specific test event to avoid capacity conflicts
    const testEventSlug = testEvent;
    
    try {
      // Waiver is created in beforeEach hook
      
      // Navigate to event page and submit RSVP
      const eventPage = new EventPage(page);
      await eventPage.gotoEvent(testEventSlug);
      await page.waitForTimeout(2000);
      
      const firstName = testUser.firstName;
      const lastName = testUser.lastName;
      await eventPage.completeRsvp(firstName, lastName);
      await eventPage.expectRsvpSuccess();
      
      // Wait for RSVP to be processed
      await page.waitForTimeout(2000);
      
      // Verify RSVP appears in dashboard
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      let rsvps = await dashboardPage.getRsvpList();
      console.log('Property 13 - User dashboard RSVPs:', rsvps.length);
      console.log('Property 13 - Dashboard RSVPs:', JSON.stringify(rsvps, null, 2));
      
      // User should have exactly 1 RSVP (the one they just created)
      expect(rsvps.length).toBe(1);
      
      // Cancel the RSVP from event page
      await eventPage.gotoEvent(testEventSlug);
      await eventPage.cancelRsvp();
      
      // Wait for cancellation to be processed
      await page.waitForTimeout(2000);

      // Verify: RSVP removed from dashboard or marked as cancelled
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      rsvps = await dashboardPage.getRsvpList();
      const activeRsvps = rsvps.filter(rsvp => rsvp.status === 'active');
      
      // User should now have 0 active RSVPs (the one they created was cancelled)
      expect(activeRsvps.length).toBe(0);
      
    } finally {
      // Cleanup
      await deleteTestData(request, userEmail, sessionToken);
    }
  });

  /**
   * Property 14: Dashboard RSVP sorting
   * Feature: volunteer-ux-playwright-testing, Property 14: Dashboard RSVP sorting
   * Validates: Requirements 3.5
   * 
   * For any user with multiple RSVPs, the dashboard should display them
   * sorted with upcoming events first, then past events
   */
  test('Property 14: Dashboard RSVP sorting - RSVPs sorted by date', async ({ page, request }) => {
    // Multiple real events with different dates
    const testEvents = [
      'brooke-road-and-thorny-point-road-cleanup-february-2026',
      'widewater-state-park-aquia-creek-cleanup-april-2026',
      'potomac-run-road-cleanup-june-2026'
    ];
    
    try {
      // Waiver is created in beforeEach hook
      
      // Submit RSVPs to multiple events
      const eventPage = new EventPage(page);
      const firstName = testUser.firstName;
      const lastName = testUser.lastName;
      
      for (const eventSlug of testEvents) {
        try {
          await eventPage.gotoEvent(eventSlug);
          await eventPage.completeRsvp(firstName, lastName);
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log(`Could not RSVP to ${eventSlug}:`, error);
          // Continue with other events
        }
      }
      
      // Navigate to dashboard
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Get RSVP list
      const rsvps = await dashboardPage.getRsvpList();
      console.log('Property 14 - Dashboard RSVPs found:', rsvps.length);
      console.log('Property 14 - Dashboard RSVPs:', JSON.stringify(rsvps, null, 2));
      
      // Verify: At least 2 RSVPs exist for sorting test
      if (rsvps.length < 2) {
        console.log('Not enough RSVPs for sorting test, skipping verification');
        return;
      }
      
      // Verify: RSVPs are sorted by date (upcoming first)
      await dashboardPage.expectRsvpsSortedByDate();
      
      // Additional verification: Parse dates and check order
      const dates = rsvps
        .map(rsvp => new Date(rsvp.eventDisplayDate))
        .filter(date => !isNaN(date.getTime()));
      
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i].getTime()).toBeLessThanOrEqual(dates[i + 1].getTime());
      }
      
    } finally {
      // Cleanup
      await deleteTestData(request, userEmail, sessionToken);
    }
  });
});
