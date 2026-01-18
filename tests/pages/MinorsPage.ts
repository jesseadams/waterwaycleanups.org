import { Page, Locator, expect } from '@playwright/test';
import { waitForElementStable, waitForApiResponse, TIMEOUTS } from '../utils/wait-helpers';

/**
 * Interface for minor form data
 */
export interface MinorFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
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
  email?: string;
}

/**
 * Page Object Model for the Minors Management page
 * Handles adding, updating, and deleting minors
 */
export class MinorsPage {
  readonly page: Page;
  
  // Locators
  readonly minorsApp: Locator;
  readonly addMinorForm: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly dateOfBirthInput: Locator;
  readonly emailInput: Locator;
  readonly addMinorButton: Locator;
  readonly minorsList: Locator;
  readonly minorItems: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly validationError: Locator;
  readonly authCheck: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Initialize locators for the minors section on the volunteer dashboard
    // The dashboard uses React components
    this.minorsApp = page.locator('div').filter({ hasText: 'Add Minor' }).first();
    this.addMinorForm = page.locator('form').filter({ hasText: 'First Name' });
    
    // Input fields - use more flexible selectors
    this.firstNameInput = page.locator('input').filter({ hasText: '' }).nth(0); // Will be refined in addMinor method
    this.lastNameInput = page.locator('input').filter({ hasText: '' }).nth(1);
    this.dateOfBirthInput = page.locator('input[type="date"]');
    this.emailInput = page.locator('input[type="email"]');
    
    this.addMinorButton = page.locator('button').filter({ hasText: /Add Minor|Save Minor/ });
    this.minorsList = page.locator('div').filter({ hasText: /Age:.*years/ });
    this.minorItems = page.locator('div').filter({ hasText: /Age:.*years/ });
    this.successMessage = page.locator('text=/added successfully|success/i');
    this.errorMessage = page.locator('text=/error|failed/i');
    this.validationError = page.locator('text=/error|invalid/i');
    this.authCheck = page.locator('text=Checking authentication');
  }

  /**
   * Navigation Methods
   */

  /**
   * Navigate to the volunteer dashboard (where minors management is located)
   */
  async goto(): Promise<void> {
    await this.page.goto('/volunteer');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for the minors section to load on the dashboard
   */
  async waitForMinorsAppLoad(): Promise<void> {
    // Wait for page to load
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
    
    // Look for the "Add Minor" button which indicates the minors section is loaded
    const addMinorButton = this.page.locator('button:has-text("Add Minor")').first();
    await expect(addMinorButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Action Methods
   */

  /**
   * Add a minor with the provided data
   * @param data - Minor form data
   */
  async addMinor(data: MinorFormData): Promise<void> {
    // Click "Add Minor" button to show the form (if not already visible)
    const addButton = this.page.locator('button:has-text("Add Minor")').first();
    const isFormVisible = await this.page.locator('input[type="date"]').isVisible().catch(() => false);
    
    if (!isFormVisible) {
      await addButton.click();
      await this.page.waitForTimeout(500);
    }
    
    // Find input fields by their labels
    // First Name
    const firstNameLabel = this.page.locator('text=First Name').first();
    const firstNameInput = firstNameLabel.locator('..').locator('input');
    await firstNameInput.fill(data.firstName);
    
    // Last Name
    const lastNameLabel = this.page.locator('text=Last Name').first();
    const lastNameInput = lastNameLabel.locator('..').locator('input');
    await lastNameInput.fill(data.lastName);
    
    // Date of Birth
    const dobInput = this.page.locator('input[type="date"]');
    await dobInput.fill(data.dateOfBirth);
    
    // Email (optional)
    if (data.email) {
      const emailInput = this.page.locator('input[type="email"]');
      await emailInput.fill(data.email);
    }
    
    // Submit the form
    const submitButton = this.page.locator('button').filter({ hasText: /Add Minor|Save Minor/ }).first();
    await submitButton.click();
    
    // Wait for the API call to complete
    await this.page.waitForTimeout(2000);
  }

  /**
   * Update a minor's information
   * Note: The current implementation doesn't have an update UI,
   * so this would need to be implemented via API or future UI
   * @param minorId - Minor ID to update
   * @param data - Partial minor data to update
   */
  async updateMinor(minorId: string, data: Partial<MinorFormData>): Promise<void> {
    // This would require an edit UI which doesn't exist yet
    // For now, this is a placeholder for future implementation
    console.warn('Update minor UI not implemented yet');
    throw new Error('Update minor functionality not available in current UI');
  }

  /**
   * Delete a minor
   * @param minorId - Minor ID to delete
   */
  async deleteMinor(minorId: string): Promise<void> {
    // Find the minor card with this ID
    const minorCard = this.page.locator(`[data-minor-id="${minorId}"]`);
    
    // If not found by data attribute, try to find by matching the minor ID in the card
    const cardVisible = await minorCard.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    let deleteButton: Locator;
    
    if (cardVisible) {
      deleteButton = minorCard.locator('button:has-text("Remove")');
    } else {
      // Fallback: find the card containing the minor ID and get its remove button
      const allCards = await this.minorItems.all();
      
      for (const card of allCards) {
        const cardText = await card.textContent() || '';
        if (cardText.includes(minorId)) {
          deleteButton = card.locator('button:has-text("Remove")');
          break;
        }
      }
      
      if (!deleteButton!) {
        throw new Error(`Could not find minor with ID: ${minorId}`);
      }
    }
    
    // Handle confirmation dialog
    this.page.on('dialog', dialog => dialog.accept());
    
    // Click delete and wait for API response
    const responsePromise = waitForApiResponse(
      this.page,
      /minors-delete/,
      { timeout: TIMEOUTS.LONG }
    );
    
    await deleteButton.click();
    
    try {
      await responsePromise;
    } catch (error) {
      console.log('Delete minor API response timeout or error:', error);
    }
    
    // Wait for the list to update
    await this.page.waitForTimeout(1000);
  }

  /**
   * Delete a minor by name (when ID is not available)
   * @param firstName - Minor's first name
   * @param lastName - Minor's last name
   */
  async deleteMinorByName(firstName: string, lastName: string): Promise<void> {
    const allCards = await this.minorItems.all();
    
    for (const card of allCards) {
      const cardText = await card.textContent() || '';
      if (cardText.includes(firstName) && cardText.includes(lastName)) {
        const deleteButton = card.locator('button:has-text("Remove")');
        
        // Handle confirmation dialog
        this.page.on('dialog', dialog => dialog.accept());
        
        // Click delete and wait for API response
        const responsePromise = waitForApiResponse(
          this.page,
          /minors-delete/,
          { timeout: TIMEOUTS.LONG }
        );
        
        await deleteButton.click();
        
        try {
          await responsePromise;
        } catch (error) {
          console.log('Delete minor API response timeout or error:', error);
        }
        
        // Wait for the list to update
        await this.page.waitForTimeout(1000);
        return;
      }
    }
    
    throw new Error(`Could not find minor: ${firstName} ${lastName}`);
  }

  /**
   * Getter Methods
   */

  /**
   * Get the list of minors
   * @returns Array of minor items
   */
  async getMinorsList(): Promise<MinorItem[]> {
    await this.page.waitForTimeout(1000);
    
    // Find all minor cards - they have specific styling and contain "Age: X years old" text
    // Look for divs with the specific class used for minor cards
    const minorCards = this.page.locator('div.bg-gray-50.p-4.rounded-lg').filter({ hasText: /Age:.*years old/ });
    const count = await minorCards.count();
    
    const minors: MinorItem[] = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const card = minorCards.nth(i);
        const text = await card.textContent() || '';
        
        // Extract minor information from the card text
        // Format: "FirstName LastName\nAge: X years old\nDate of Birth: YYYY-MM-DD"
        
        // Extract name from h4 element
        const nameElement = card.locator('h4');
        const nameText = await nameElement.textContent() || '';
        const nameParts = nameText.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        // Extract age
        const ageMatch = text.match(/Age:\s*(\d+)\s*years old/i);
        const age = ageMatch ? parseInt(ageMatch[1]) : 0;
        
        // Extract date of birth
        const dobMatch = text.match(/Date of Birth:\s*(\d{4}-\d{2}-\d{2})/i);
        const dateOfBirth = dobMatch?.[1] || '';
        
        // Extract email if present
        const emailMatch = text.match(/Email:\s*([^\s]+@[^\s]+)/i);
        const email = emailMatch?.[1];
        
        // Try to get minor ID from the Remove button
        let minorId = '';
        const removeButton = card.locator('button:has-text("Remove")');
        const buttonExists = await removeButton.count() > 0;
        
        if (buttonExists) {
          // The button has an onClick handler, but we can't easily extract the ID
          // Use a combination of first and last name as a fallback
          minorId = `${firstName}-${lastName}-${dateOfBirth}`;
        }
        
        if (firstName && lastName) {
          minors.push({
            minorId,
            firstName,
            lastName,
            age,
            dateOfBirth,
            email,
          });
        }
      } catch (error) {
        console.error('Error parsing minor item:', error);
      }
    }
    
    return minors;
  }

  /**
   * Get the count of minors
   * @returns Number of minors
   */
  async getMinorsCount(): Promise<number> {
    const minors = await this.getMinorsList();
    return minors.length;
  }

  /**
   * Assertion Methods
   */

  /**
   * Verify that a minor is in the list
   * @param minorId - Minor ID to check for
   */
  async expectMinorInList(minorId: string): Promise<void> {
    const minors = await this.getMinorsList();
    const hasMinor = minors.some(minor => minor.minorId === minorId);
    expect(hasMinor).toBe(true);
  }

  /**
   * Verify that a minor is not in the list
   * @param minorId - Minor ID to check for
   */
  async expectMinorNotInList(minorId: string): Promise<void> {
    const minors = await this.getMinorsList();
    const hasMinor = minors.some(minor => minor.minorId === minorId);
    expect(hasMinor).toBe(false);
  }

  /**
   * Verify that a minor with specific name is in the list
   * @param firstName - First name
   * @param lastName - Last name
   */
  async expectMinorByNameInList(firstName: string, lastName: string): Promise<void> {
    const minors = await this.getMinorsList();
    const hasMinor = minors.some(
      minor => minor.firstName === firstName && minor.lastName === lastName
    );
    expect(hasMinor).toBe(true);
  }

  /**
   * Verify that a validation error is displayed for a specific field
   * @param field - Field name to check for validation error
   */
  async expectValidationError(field: string): Promise<void> {
    // Look for validation error near the specified field
    const fieldLocator = this.page.locator(`input[name="${field}"]`);
    const errorLocator = fieldLocator.locator('..').locator('.error, .validation-error, [class*="error"]');
    
    const errorVisible = await errorLocator.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    if (!errorVisible) {
      // Check for general error message
      await expect(this.errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    } else {
      await expect(errorLocator).toBeVisible();
    }
  }

  /**
   * Verify that a success message is displayed
   */
  async expectSuccessMessage(): Promise<void> {
    await expect(this.successMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that an error message is displayed
   * @param message - Expected error message text (partial match, optional)
   */
  async expectErrorMessage(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    
    if (message) {
      const errorText = await this.errorMessage.textContent();
      expect(errorText?.toLowerCase()).toContain(message.toLowerCase());
    }
  }

  /**
   * Verify that the minors list is empty
   */
  async expectEmptyMinorsList(): Promise<void> {
    const count = await this.getMinorsCount();
    expect(count).toBe(0);
  }

  /**
   * Verify that the minors count matches expected value
   * @param expectedCount - Expected number of minors
   */
  async expectMinorsCount(expectedCount: number): Promise<void> {
    const actualCount = await this.getMinorsCount();
    expect(actualCount).toBe(expectedCount);
  }

  /**
   * Verify that the add minor form is visible
   */
  async expectAddMinorFormVisible(): Promise<void> {
    await expect(this.addMinorForm).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that the minors list is visible
   */
  async expectMinorsListVisible(): Promise<void> {
    await expect(this.minorsList).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that an age transition notification is displayed (minor turning 18)
   * Requirements: 8.1
   */
  async expectAgeTransitionNotification(): Promise<void> {
    // Look for notification about minor turning 18 and needing their own account
    const notification = this.page.locator('text=/18.*own account|adult.*create account|no longer.*minor/i');
    await expect(notification).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a future date of birth error is displayed
   * Requirements: 8.2
   */
  async expectFutureDateError(): Promise<void> {
    // Look for error message about future date
    const errorMessage = this.page.locator('text=/future date|date.*future|cannot be.*future|invalid.*date/i');
    await expect(errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that an adult date of birth error is displayed (18+ years old)
   * Requirements: 8.3
   */
  async expectAdultDateError(): Promise<void> {
    // Look for error message about adult age
    const errorMessage = this.page.locator('text=/must be.*under 18|18.*older|adult|not.*minor/i');
    await expect(errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a deletion warning is displayed for minors with active RSVPs
   * Requirements: 8.4
   */
  async expectDeletionWarning(): Promise<void> {
    // Look for warning about active RSVPs when deleting
    const warningMessage = this.page.locator('text=/active.*rsvp|rsvp.*cancel|event.*registration/i');
    await expect(warningMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Confirm deletion in a dialog/modal
   * Requirements: 8.4
   */
  async confirmDeletion(): Promise<void> {
    // Handle browser dialog
    this.page.once('dialog', dialog => {
      dialog.accept();
    });
    
    // Also check for modal confirmation button
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")');
    const isModalVisible = await confirmButton.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);
    
    if (isModalVisible) {
      await confirmButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Add a minor with special characters in the name
   * Requirements: 8.5
   * @param name - Full name with special characters (will be split into first/last)
   * @param dob - Date of birth in YYYY-MM-DD format
   */
  async addMinorWithSpecialCharacters(name: string, dob: string): Promise<void> {
    // Split name into first and last name
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(' ') || name;
    
    // Click "Add Minor" button to show the form (if not already visible)
    const addButton = this.page.locator('button:has-text("Add Minor")').first();
    const isFormVisible = await this.page.locator('input[type="date"]').isVisible().catch(() => false);
    
    if (!isFormVisible) {
      await addButton.click();
      await this.page.waitForTimeout(500);
    }
    
    // Find input fields by their labels
    // First Name
    const firstNameLabel = this.page.locator('text=First Name').first();
    const firstNameInput = firstNameLabel.locator('..').locator('input');
    await firstNameInput.fill(firstName);
    
    // Last Name
    const lastNameLabel = this.page.locator('text=Last Name').first();
    const lastNameInput = lastNameLabel.locator('..').locator('input');
    await lastNameInput.fill(lastName);
    
    // Date of Birth
    const dobInput = this.page.locator('input[type="date"]');
    await dobInput.fill(dob);
    
    // Submit the form
    const submitButton = this.page.locator('button').filter({ hasText: /Add Minor|Save Minor/ }).first();
    await submitButton.click();
    
    // Wait for the API call to complete
    await this.page.waitForTimeout(2000);
  }

  /**
   * Helper Methods
   */

  /**
   * Check if a minor exists in the list by name
   * @param firstName - First name
   * @param lastName - Last name
   * @returns True if minor exists
   */
  async hasMinorByName(firstName: string, lastName: string): Promise<boolean> {
    const minors = await this.getMinorsList();
    return minors.some(
      minor => minor.firstName === firstName && minor.lastName === lastName
    );
  }

  /**
   * Find a minor by name
   * @param firstName - First name
   * @param lastName - Last name
   * @returns Minor item or null if not found
   */
  async findMinorByName(firstName: string, lastName: string): Promise<MinorItem | null> {
    const minors = await this.getMinorsList();
    return minors.find(
      minor => minor.firstName === firstName && minor.lastName === lastName
    ) || null;
  }

  /**
   * Clear the add minor form
   */
  async clearForm(): Promise<void> {
    await this.firstNameInput.clear();
    await this.lastNameInput.clear();
    await this.dateOfBirthInput.clear();
    await this.emailInput.clear();
  }

  /**
   * Calculate age from date of birth
   * @param dateOfBirth - Date of birth in YYYY-MM-DD format
   * @returns Age in years
   */
  calculateAge(dateOfBirth: string): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Verify that a minor's age is calculated correctly
   * @param minor - Minor item
   * @returns True if age calculation is correct
   */
  isAgeCorrect(minor: MinorItem): boolean {
    const calculatedAge = this.calculateAge(minor.dateOfBirth);
    return calculatedAge === minor.age;
  }
}
