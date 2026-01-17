import { Page, Locator, expect } from '@playwright/test';
import { waitForElementStable, waitForApiResponse, TIMEOUTS } from '../utils/wait-helpers';

/**
 * Page Object Model for Event pages
 * Handles event RSVP submission and management
 */
export class EventPage {
  readonly page: Page;
  
  // Locators
  readonly eventContainer: Locator;
  readonly eventTitle: Locator;
  readonly eventDate: Locator;
  readonly rsvpWidget: Locator;
  readonly rsvpButton: Locator;
  readonly rsvpForm: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly submitRsvpButton: Locator;
  readonly cancelRsvpButton: Locator;
  readonly attendanceCount: Locator;
  readonly attendanceCap: Locator;
  readonly rsvpSuccessMessage: Locator;
  readonly rsvpErrorMessage: Locator;
  readonly capacityErrorMessage: Locator;
  readonly duplicateErrorMessage: Locator;
  readonly rsvpStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Initialize locators based on the event page structure
    this.eventContainer = page.locator('.event-container, article, main');
    this.eventTitle = page.locator('h1, .event-title');
    this.eventDate = page.locator('.event-date, [class*="date"]');
    this.rsvpWidget = page.locator('.event-rsvp-widget, [class*="rsvp-widget"]');
    this.rsvpButton = page.locator('.rsvp-toggle-button, button:has-text("RSVP")');
    this.rsvpForm = page.locator('.rsvp-form, form[class*="rsvp"]');
    this.firstNameInput = page.locator('input[name="first_name"], input[placeholder*="First Name" i]');
    this.lastNameInput = page.locator('input[name="last_name"], input[placeholder*="Last Name" i]');
    this.submitRsvpButton = page.locator('button[type="submit"]:has-text("Submit"), button:has-text("Confirm RSVP")');
    // Cancel button can be either individual "Cancel" links or a "Cancel Registration" button
    this.cancelRsvpButton = page.locator('button:has-text("Cancel"), a:has-text("Cancel")');
    this.attendanceCount = page.locator('.rsvp-count, [class*="attendance-count"]');
    this.attendanceCap = page.locator('.rsvp-capacity, [class*="attendance-cap"]');
    this.rsvpSuccessMessage = page.locator('.rsvp-success, .alert-success');
    this.rsvpErrorMessage = page.locator('.rsvp-error, .alert-error');
    this.capacityErrorMessage = page.locator('.rsvp-error:has-text("capacity"), .rsvp-error:has-text("full")');
    this.duplicateErrorMessage = page.locator('.rsvp-error:has-text("already"), .rsvp-error:has-text("duplicate")');
    this.rsvpStatus = page.locator('.rsvp-status, [class*="rsvp-status"]');
  }

  /**
   * Navigation Methods
   */

  /**
   * Navigate to a specific event page
   * @param eventId - Event ID or slug
   */
  async gotoEvent(eventId: string): Promise<void> {
    // Event URLs are typically /events/{event-slug}
    await this.page.goto(`/events/${eventId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to an event by its URL path
   * @param eventPath - Full event path (e.g., "/events/cleanup-event-2026")
   */
  async gotoEventByPath(eventPath: string): Promise<void> {
    await this.page.goto(eventPath);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Action Methods
   */

  /**
   * Fill the RSVP form with first and last name
   * @param firstName - First name
   * @param lastName - Last name
   */
  async fillRsvpForm(firstName: string, lastName: string): Promise<void> {
    // Wait for form to be visible
    await waitForElementStable(this.page, '.rsvp-form, form[class*="rsvp"]', { 
      timeout: TIMEOUTS.DEFAULT 
    });
    
    // Fill first name
    await this.firstNameInput.clear();
    await this.firstNameInput.fill(firstName);
    
    // Fill last name
    await this.lastNameInput.clear();
    await this.lastNameInput.fill(lastName);
  }

  /**
   * Submit the RSVP form
   */
  async submitRsvp(): Promise<void> {
    // Wait for submit button to be visible and enabled
    await expect(this.submitRsvpButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await expect(this.submitRsvpButton).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });
    
    // Click submit and wait for API response
    const responsePromise = waitForApiResponse(
      this.page,
      /submit-event-rsvp/,
      { timeout: TIMEOUTS.LONG }
    );
    
    await this.submitRsvpButton.click();
    
    try {
      await responsePromise;
    } catch (error) {
      console.log('RSVP submission API response timeout or error:', error);
    }
    
    // Wait for submission to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Click the RSVP button to open the RSVP form
   */
  async clickRsvpButton(): Promise<void> {
    await this.rsvpButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Complete the full RSVP flow
   * For users without minors, clicking the button directly submits the RSVP
   * For users with minors, a form appears to select attendees
   * @param firstName - First name (not used for direct RSVP)
   * @param lastName - Last name (not used for direct RSVP)
   */
  async completeRsvp(firstName: string, lastName: string): Promise<void> {
    // Click the RSVP button
    await this.clickRsvpButton();
    
    // Wait a moment for the JavaScript to process
    await this.page.waitForTimeout(2000);
    
    // Check if a form appeared (multi-person selector for users with minors)
    const formVisible = await this.rsvpForm.isVisible().catch(() => false);
    
    if (formVisible) {
      // Form appeared - fill it out and submit
      await this.fillRsvpForm(firstName, lastName);
      await this.submitRsvp();
    } else {
      // No form - direct RSVP was submitted automatically
      // Just wait for the success message or error
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Cancel an existing RSVP
   */
  async cancelRsvp(): Promise<void> {
    await this.cancelRsvpButton.click();
    
    // Handle confirmation dialog if present
    this.page.on('dialog', dialog => dialog.accept());
    
    // Wait for cancellation to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Getter Methods
   */

  /**
   * Get the current attendance count for the event
   * @returns Current number of attendees
   */
  async getAttendanceCount(): Promise<number> {
    const countText = await this.attendanceCount.textContent();
    const match = countText?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Get the attendance capacity for the event
   * @returns Maximum number of attendees
   */
  async getAttendanceCap(): Promise<number> {
    const capText = await this.attendanceCap.textContent();
    const match = capText?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Get the event title
   * @returns Event title text
   */
  async getEventTitle(): Promise<string> {
    return await this.eventTitle.textContent() || '';
  }

  /**
   * Get the event date
   * @returns Event date text
   */
  async getEventDate(): Promise<string> {
    return await this.eventDate.textContent() || '';
  }

  /**
   * Check if the event is at capacity
   * @returns True if event is at capacity
   */
  async isAtCapacity(): Promise<boolean> {
    const count = await this.getAttendanceCount();
    const cap = await this.getAttendanceCap();
    return count >= cap;
  }

  /**
   * Assertion Methods
   */

  /**
   * Verify that the RSVP form is visible
   */
  async expectRsvpFormVisible(): Promise<void> {
    await expect(this.rsvpForm).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that the RSVP was successful
   */
  async expectRsvpSuccess(): Promise<void> {
    await expect(this.rsvpSuccessMessage).toBeVisible({ timeout: TIMEOUTS.LONG });
    
    // Verify success message contains expected text
    const successText = await this.rsvpSuccessMessage.textContent();
    expect(successText?.toLowerCase()).toMatch(/success|registered|confirmed/);
  }

  /**
   * Verify that a capacity error is displayed
   */
  async expectCapacityError(): Promise<void> {
    await expect(this.capacityErrorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a duplicate RSVP error is displayed
   */
  async expectDuplicateError(): Promise<void> {
    await expect(this.duplicateErrorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that an error message is displayed
   * @param message - Expected error message text (partial match, optional)
   */
  async expectErrorMessage(message?: string): Promise<void> {
    await expect(this.rsvpErrorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    
    if (message) {
      const errorText = await this.rsvpErrorMessage.textContent();
      expect(errorText?.toLowerCase()).toContain(message.toLowerCase());
    }
  }

  /**
   * Verify that no error message is displayed
   */
  async expectNoErrorMessage(): Promise<void> {
    const errorVisible = await this.rsvpErrorMessage.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    expect(errorVisible).toBe(false);
  }

  /**
   * Verify that the RSVP button is visible
   */
  async expectRsvpButtonVisible(): Promise<void> {
    await expect(this.rsvpButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that the cancel RSVP button is visible
   */
  async expectCancelButtonVisible(): Promise<void> {
    await expect(this.cancelRsvpButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that the attendance count matches expected value
   * @param expectedCount - Expected attendance count
   */
  async expectAttendanceCount(expectedCount: number): Promise<void> {
    const actualCount = await this.getAttendanceCount();
    expect(actualCount).toBe(expectedCount);
  }

  /**
   * Verify that the event is at capacity
   */
  async expectAtCapacity(): Promise<void> {
    const atCapacity = await this.isAtCapacity();
    expect(atCapacity).toBe(true);
  }

  /**
   * Verify that the event is not at capacity
   */
  async expectNotAtCapacity(): Promise<void> {
    const atCapacity = await this.isAtCapacity();
    expect(atCapacity).toBe(false);
  }

  /**
   * Verify that the user has an active RSVP
   */
  async expectHasActiveRsvp(): Promise<void> {
    // Check for cancel button or RSVP status indicating active registration
    const cancelVisible = await this.cancelRsvpButton.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    const statusText = await this.rsvpStatus.textContent().catch(() => '') || '';
    const hasActiveStatus = statusText.toLowerCase().includes('registered') || 
                           statusText.toLowerCase().includes('confirmed');
    
    expect(cancelVisible || hasActiveStatus).toBe(true);
  }

  /**
   * Verify that the user does not have an active RSVP
   */
  async expectNoActiveRsvp(): Promise<void> {
    // Check that cancel button is not visible
    const cancelVisible = await this.cancelRsvpButton.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    expect(cancelVisible).toBe(false);
  }

  /**
   * Helper Methods
   */

  /**
   * Check if the RSVP form is visible
   * @returns True if RSVP form is visible
   */
  async isRsvpFormVisible(): Promise<boolean> {
    return await this.rsvpForm.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
  }

  /**
   * Check if the user has an active RSVP
   * @returns True if user has active RSVP
   */
  async hasActiveRsvp(): Promise<boolean> {
    // First scroll to the RSVP widget to ensure it's in view
    const widgetVisible = await this.rsvpWidget.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (widgetVisible) {
      await this.rsvpWidget.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(500); // Wait for any animations
    }
    
    // Check if RSVP button shows "Already Registered" and is disabled
    // This is the primary indicator after a successful RSVP
    const rsvpButtonText = await this.rsvpButton.textContent().catch(() => '');
    const rsvpButtonDisabled = await this.rsvpButton.isDisabled().catch(() => false);
    
    if (rsvpButtonText.includes('Already Registered') && rsvpButtonDisabled) {
      return true;
    }
    
    // Check if cancel button is visible (for individual attendee cancellation)
    const cancelVisible = await this.cancelRsvpButton.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (cancelVisible) {
      return true;
    }
    
    // Check if success message with registered attendees is visible
    const successVisible = await this.rsvpSuccessMessage.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (successVisible) {
      const successText = await this.rsvpSuccessMessage.textContent().catch(() => '');
      if (successText.includes('registered') || successText.includes('Registered')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get the number of available spots
   * @returns Number of available spots (capacity - count)
   */
  async getAvailableSpots(): Promise<number> {
    const count = await this.getAttendanceCount();
    const cap = await this.getAttendanceCap();
    return Math.max(0, cap - count);
  }

  /**
   * Wait for RSVP count to update
   * @param expectedCount - Expected count after update
   * @param timeout - Maximum time to wait in milliseconds
   */
  async waitForAttendanceCountUpdate(expectedCount: number, timeout: number = TIMEOUTS.DEFAULT): Promise<void> {
    await this.page.waitForFunction(
      async ({ selector, expected }) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const text = element.textContent || '';
        const match = text.match(/\d+/);
        const count = match ? parseInt(match[0]) : 0;
        return count === expected;
      },
      { selector: '.rsvp-count, [class*="attendance-count"]', expected: expectedCount },
      { timeout }
    );
  }
}
