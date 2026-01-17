import { Page, Locator, expect } from '@playwright/test';
import { waitForElementStable, waitForNetworkIdle, TIMEOUTS } from '../utils/wait-helpers';

/**
 * Interface for waiver status information
 */
export interface WaiverStatus {
  hasWaiver: boolean;
  expirationDate: string | null;
  submissionDate: string | null;
}

/**
 * Interface for RSVP item information
 */
export interface RsvpItem {
  eventId: string;
  eventTitle: string;
  eventDisplayDate: string;
  status: string;
}

/**
 * Interface for minor item information
 */
export interface MinorItem {
  minorId: string;
  firstName: string;
  lastName: string;
  age: number;
  dateOfBirth: string;
}

/**
 * Page Object Model for the Volunteer Dashboard
 * Handles waiver status, RSVPs, and minors management
 */
export class DashboardPage {
  readonly page: Page;
  
  // Locators
  readonly dashboardContainer: Locator;
  readonly emailInput: Locator;
  readonly checkEmailButton: Locator;
  readonly waiverSection: Locator;
  readonly waiverStatusText: Locator;
  readonly waiverExpirationDate: Locator;
  readonly submitWaiverButton: Locator;
  readonly rsvpSection: Locator;
  readonly rsvpList: Locator;
  readonly rsvpItems: Locator;
  readonly minorsSection: Locator;
  readonly minorsList: Locator;
  readonly manageMinorsButton: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Initialize locators based on the volunteer dashboard structure
    this.dashboardContainer = page.locator('#volunteer-dashboard-root, .dashboard-container');
    this.emailInput = page.locator('#email, input[name="email"]');
    this.checkEmailButton = page.locator('input[value="Check Email"], button:has-text("Check Email")');
    this.waiverSection = page.locator('[class*="waiver"], .waiver-status, #waiver-section');
    this.waiverStatusText = page.locator('text=/waiver/i').first();
    this.waiverExpirationDate = page.locator('text=/expir/i, text=/valid until/i');
    this.submitWaiverButton = page.locator('a[href*="waiver"], button:has-text("Complete Waiver")');
    this.rsvpSection = page.locator('[class*="rsvp"], .rsvp-list, #rsvp-section');
    this.rsvpList = page.locator('.rsvp-list, [class*="rsvp-item"]').first();
    this.rsvpItems = page.locator('.rsvp-item, [class*="event-card"]');
    this.minorsSection = page.locator('[class*="minor"], .minors-list, #minors-section');
    this.minorsList = page.locator('.minors-list, [class*="minor-item"]').first();
    this.manageMinorsButton = page.locator('a[href*="minors"], button:has-text("Manage Minors")');
    this.loadingIndicator = page.locator('.loading, [class*="loading"], text=/loading/i');
  }

  /**
   * Navigation Methods
   */

  /**
   * Navigate to the volunteer dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto('/volunteer');
    await waitForNetworkIdle(this.page, { timeout: TIMEOUTS.LONG });
  }

  /**
   * Wait for the dashboard to fully load
   */
  async waitForDashboardLoad(): Promise<void> {
    // Wait for loading indicator to disappear
    const loadingVisible = await this.loadingIndicator.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (loadingVisible) {
      await this.loadingIndicator.waitFor({ state: 'hidden', timeout: TIMEOUTS.LONG });
    }
    
    // Wait for dashboard container to be visible
    await expect(this.dashboardContainer).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Getter Methods
   */

  /**
   * Get the waiver status for the current user
   * @returns Waiver status information
   */
  async getWaiverStatus(): Promise<WaiverStatus> {
    await this.waitForDashboardLoad();
    
    // Check if waiver section is visible
    const waiverVisible = await this.waiverSection.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (!waiverVisible) {
      return {
        hasWaiver: false,
        expirationDate: null,
        submissionDate: null,
      };
    }
    
    // Get waiver status text
    const statusText = await this.waiverStatusText.textContent() || '';
    const hasWaiver = statusText.toLowerCase().includes('valid') || 
                      statusText.toLowerCase().includes('active') ||
                      statusText.toLowerCase().includes('complete');
    
    // Try to extract expiration date
    let expirationDate: string | null = null;
    const expirationVisible = await this.waiverExpirationDate.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (expirationVisible) {
      const expirationText = await this.waiverExpirationDate.textContent() || '';
      // Extract date from text (format: "valid until YYYY-MM-DD" or similar)
      const dateMatch = expirationText.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        expirationDate = dateMatch[0];
      }
    }
    
    return {
      hasWaiver,
      expirationDate,
      submissionDate: null, // Not typically displayed on dashboard
    };
  }

  /**
   * Get the list of RSVPs for the current user
   * @returns Array of RSVP items
   */
  async getRsvpList(): Promise<RsvpItem[]> {
    await this.waitForDashboardLoad();
    
    // Wait a bit for React to render the dashboard data
    await this.page.waitForTimeout(2000);
    
    // The RSVPs are rendered by React in a specific structure:
    // - Container: div with "Event RSVPs" heading
    // - List: div.space-y-2 containing RSVP items
    // - Items: div.bg-white.p-3.rounded.border for each RSVP
    
    // First check if there's an "Event RSVPs" section
    const rsvpHeading = this.page.locator('h3:has-text("Event RSVPs")');
    const headingVisible = await rsvpHeading.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (!headingVisible) {
      console.log('RSVP heading not found');
      return [];
    }
    
    // Check for "No event RSVPs yet" message
    const noRsvpsMessage = this.page.locator('p:has-text("No event RSVPs yet")');
    const noRsvpsVisible = await noRsvpsMessage.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (noRsvpsVisible) {
      console.log('No RSVPs message found');
      return [];
    }
    
    // Get all RSVP items - they're in divs with specific classes
    // The structure is: div.space-y-2 > div.bg-white.p-3.rounded.border
    const rsvpContainer = this.page.locator('h3:has-text("Event RSVPs")').locator('..').locator('div.space-y-2');
    const containerVisible = await rsvpContainer.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (!containerVisible) {
      console.log('RSVP container not found');
      return [];
    }
    
    // Get all RSVP item divs
    const items = await rsvpContainer.locator('> div.bg-white').all();
    console.log(`Found ${items.length} RSVP items in container`);
    
    const rsvps: RsvpItem[] = [];
    
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const text = await item.textContent() || '';
        console.log(`RSVP item ${i} text:`, text);
        
        // Extract event information from the item
        // The structure has:
        // - Event link (a.text-blue-600) with event_id as text
        // - Event date (div.text-sm.font-medium.text-gray-700)
        // - RSVP date (div.text-sm.text-gray-600)
        
        const eventLink = item.locator('a.text-blue-600');
        const eventId = await eventLink.textContent() || '';
        
        const eventDateDiv = item.locator('div.text-sm.font-medium.text-gray-700');
        const eventDisplayDate = await eventDateDiv.textContent() || '';
        
        // Check for status badge
        const statusBadge = item.locator('span.inline-block.px-2.py-1.rounded.text-xs');
        const statusBadgeVisible = await statusBadge.isVisible({ timeout: TIMEOUTS.SHORT })
          .catch(() => false);
        
        let status = 'active';
        if (statusBadgeVisible) {
          const statusText = await statusBadge.textContent() || '';
          status = statusText.toLowerCase().includes('cancelled') ? 'cancelled' : 'active';
        }
        
        rsvps.push({
          eventId: eventId.trim(),
          eventTitle: eventId.trim(), // Using event_id as title since that's what's displayed
          eventDisplayDate: eventDisplayDate.trim(),
          status,
        });
        
        console.log(`Parsed RSVP ${i}:`, rsvps[rsvps.length - 1]);
      } catch (error) {
        console.error(`Error parsing RSVP item ${i}:`, error);
      }
    }
    
    console.log(`Total RSVPs parsed: ${rsvps.length}`);
    return rsvps;
  }

  /**
   * Get the list of minors for the current user
   * @returns Array of minor items
   */
  async getMinorsList(): Promise<MinorItem[]> {
    await this.waitForDashboardLoad();
    
    // Check if minors section is visible
    const minorsVisible = await this.minorsSection.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (!minorsVisible) {
      return [];
    }
    
    // Get all minor items
    const items = this.page.locator('.minor-item, [class*="minor-card"]');
    const itemsCount = await items.count();
    const minors: MinorItem[] = [];
    
    for (let i = 0; i < itemsCount; i++) {
      try {
        const item = items.nth(i);
        const text = await item.textContent() || '';
        
        // Extract minor information from the item
        const minorId = await item.getAttribute('data-minor-id') || '';
        const nameMatch = text.match(/([A-Z][a-z]+)\s+([A-Z][a-z]+)/);
        const firstName = nameMatch?.[1] || '';
        const lastName = nameMatch?.[2] || '';
        const ageMatch = text.match(/Age:\s*(\d+)/i);
        const age = ageMatch ? parseInt(ageMatch[1]) : 0;
        const dobMatch = text.match(/\d{4}-\d{2}-\d{2}/);
        const dateOfBirth = dobMatch?.[0] || '';
        
        minors.push({
          minorId,
          firstName,
          lastName,
          age,
          dateOfBirth,
        });
      } catch (error) {
        console.error('Error parsing minor item:', error);
      }
    }
    
    return minors;
  }

  /**
   * Action Methods
   */

  /**
   * Check email to load dashboard data
   * @param email - Email address to check
   */
  async checkEmail(email: string): Promise<void> {
    await this.emailInput.clear();
    await this.emailInput.fill(email);
    await this.checkEmailButton.click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Click the submit waiver button
   */
  async clickSubmitWaiver(): Promise<void> {
    await this.submitWaiverButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click the manage minors button
   */
  async clickManageMinors(): Promise<void> {
    await this.manageMinorsButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Cancel an RSVP for a specific event
   * @param eventId - Event ID to cancel RSVP for
   */
  async clickCancelRsvp(eventId: string): Promise<void> {
    // Find the RSVP item for this event by looking for the event link
    const rsvpContainer = this.page.locator('h3:has-text("Event RSVPs")').locator('..').locator('div.space-y-2');
    const rsvpItem = rsvpContainer.locator(`div.bg-white:has(a:has-text("${eventId}"))`);
    
    // Find and click the cancel button within this item
    const cancelButton = rsvpItem.locator('button:has-text("Cancel"), a:has-text("Cancel")');
    await cancelButton.click();
    
    // Handle confirmation dialog if present
    this.page.on('dialog', dialog => dialog.accept());
    
    // Wait for the cancellation to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Assertion Methods
   */

  /**
   * Verify that the waiver is valid
   */
  async expectWaiverValid(): Promise<void> {
    const status = await this.getWaiverStatus();
    expect(status.hasWaiver).toBe(true);
    expect(status.expirationDate).toBeTruthy();
  }

  /**
   * Verify that the waiver is expired or not present
   */
  async expectWaiverExpired(): Promise<void> {
    const status = await this.getWaiverStatus();
    
    if (status.hasWaiver && status.expirationDate) {
      // Check if expiration date is in the past
      const expirationDate = new Date(status.expirationDate);
      const today = new Date();
      expect(expirationDate < today).toBe(true);
    } else {
      // No waiver present
      expect(status.hasWaiver).toBe(false);
    }
  }

  /**
   * Verify that the RSVP count matches expected value
   * @param count - Expected number of RSVPs
   */
  async expectRsvpCount(count: number): Promise<void> {
    const rsvps = await this.getRsvpList();
    expect(rsvps.length).toBe(count);
  }

  /**
   * Verify that a specific event is in the RSVP list
   * @param eventId - Event ID to check for
   */
  async expectEventInRsvpList(eventId: string): Promise<void> {
    const rsvps = await this.getRsvpList();
    const hasEvent = rsvps.some(rsvp => rsvp.eventId === eventId);
    expect(hasEvent).toBe(true);
  }

  /**
   * Verify that a specific event is not in the RSVP list
   * @param eventId - Event ID to check for
   */
  async expectEventNotInRsvpList(eventId: string): Promise<void> {
    const rsvps = await this.getRsvpList();
    const hasEvent = rsvps.some(rsvp => rsvp.eventId === eventId);
    expect(hasEvent).toBe(false);
  }

  /**
   * Verify that the minors count matches expected value
   * @param count - Expected number of minors
   */
  async expectMinorsCount(count: number): Promise<void> {
    const minors = await this.getMinorsList();
    expect(minors.length).toBe(count);
  }

  /**
   * Verify that the dashboard is visible
   */
  async expectDashboardVisible(): Promise<void> {
    await expect(this.dashboardContainer).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that RSVPs are sorted with upcoming events first
   */
  async expectRsvpsSortedByDate(): Promise<void> {
    const rsvps = await this.getRsvpList();
    
    if (rsvps.length <= 1) {
      return; // Nothing to sort
    }
    
    // Parse dates and verify they're in ascending order (upcoming first)
    const dates = rsvps.map(rsvp => new Date(rsvp.eventDisplayDate));
    
    for (let i = 0; i < dates.length - 1; i++) {
      // Allow for invalid dates (they should be at the end)
      if (!isNaN(dates[i].getTime()) && !isNaN(dates[i + 1].getTime())) {
        expect(dates[i].getTime()).toBeLessThanOrEqual(dates[i + 1].getTime());
      }
    }
  }

  /**
   * Helper Methods
   */

  /**
   * Check if the waiver is expired
   * @returns True if waiver is expired
   */
  async isWaiverExpired(): Promise<boolean> {
    const status = await this.getWaiverStatus();
    
    if (!status.hasWaiver || !status.expirationDate) {
      return true; // No waiver or no expiration date means expired/invalid
    }
    
    const expirationDate = new Date(status.expirationDate);
    const today = new Date();
    
    return expirationDate < today;
  }

  /**
   * Check if the user has a valid waiver
   * @returns True if user has a valid waiver
   */
  async hasValidWaiver(): Promise<boolean> {
    const status = await this.getWaiverStatus();
    return status.hasWaiver;
  }

  /**
   * Get the number of active RSVPs
   * @returns Number of active RSVPs
   */
  async getActiveRsvpCount(): Promise<number> {
    const rsvps = await this.getRsvpList();
    return rsvps.filter(rsvp => rsvp.status === 'active').length;
  }

  /**
   * Get the number of minors
   * @returns Number of minors
   */
  async getMinorsCount(): Promise<number> {
    const minors = await this.getMinorsList();
    return minors.length;
  }
}
