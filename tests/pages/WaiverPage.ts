import { Page, Locator, expect } from '@playwright/test';
import { waitForElementStable, waitForApiResponse, TIMEOUTS } from '../utils/wait-helpers';

/**
 * Interface for waiver form data
 */
export interface WaiverFormData {
  fullLegalName: string;
  phoneNumber: string;
  dateOfBirth: string;
  waiverAcknowledgement: boolean;
  adultSignature?: string;
  adultTodaysDate?: string;
}

/**
 * Page Object Model for the Volunteer Waiver page
 * Handles waiver form submission and validation
 */
export class WaiverPage {
  readonly page: Page;
  
  // Locators
  readonly waiverForm: Locator;
  readonly emailInput: Locator;
  readonly checkEmailButton: Locator;
  readonly fullLegalNameInput: Locator;
  readonly phoneNumberInput: Locator;
  readonly dateOfBirthInput: Locator;
  readonly waiverAcknowledgementCheckbox: Locator;
  readonly adultSignatureInput: Locator;
  readonly adultTodaysDateInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly validationError: Locator;
  readonly waiverFormFields: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Initialize locators based on the waiver form structure
    this.waiverForm = page.locator('#volunteerwaiver, form[name="volunteerwaiver"]');
    this.emailInput = page.locator('#email, input[name="email"]');
    this.checkEmailButton = page.locator('input[value="Check Email"], button:has-text("Check Email")');
    this.fullLegalNameInput = page.locator('#full_legal_name, input[name="full_legal_name"]');
    this.phoneNumberInput = page.locator('#phone_number, input[name="phone_number"]');
    this.dateOfBirthInput = page.locator('#date_of_birth, input[name="date_of_birth"]');
    this.waiverAcknowledgementCheckbox = page.locator('#waiver_acknowledgement, input[name="waiver_acknowledgement"]');
    this.adultSignatureInput = page.locator('#adult_signature, input[name="adult_signature"]');
    this.adultTodaysDateInput = page.locator('#adult_todays_date, input[name="adult_todays_date"]');
    this.submitButton = page.locator('input[value="Submit Waiver"], button[type="submit"]:has-text("Submit")');
    this.errorMessage = page.locator('.error, .alert-error, .message.error, #waiver-form-message.error');
    this.successMessage = page.locator('.success, .alert-success, .message.success, .success-message');
    this.validationError = page.locator('.validation-error, [class*="error"]');
    this.waiverFormFields = page.locator('#waiver-form-fields');
  }

  /**
   * Navigation Methods
   */

  /**
   * Navigate to the volunteer waiver page
   */
  async goto(): Promise<void> {
    await this.page.goto('/volunteer-waiver');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Action Methods
   */

  /**
   * Fill the waiver form with provided data
   * @param data - Waiver form data
   */
  async fillWaiverForm(data: WaiverFormData): Promise<void> {
    // Wait for form fields to be visible
    await waitForElementStable(this.page, '#waiver-form-fields', { timeout: TIMEOUTS.DEFAULT });
    
    // Fill full legal name
    await this.fullLegalNameInput.clear();
    await this.fullLegalNameInput.fill(data.fullLegalName);
    
    // Fill phone number
    await this.phoneNumberInput.clear();
    await this.phoneNumberInput.fill(data.phoneNumber);
    
    // Fill date of birth
    await this.dateOfBirthInput.clear();
    await this.dateOfBirthInput.fill(data.dateOfBirth);
    
    // Wait for age calculation and adult/minor fields to appear
    await this.page.waitForTimeout(500);
    
    // Check waiver acknowledgement
    if (data.waiverAcknowledgement) {
      const isChecked = await this.waiverAcknowledgementCheckbox.isChecked();
      if (!isChecked) {
        await this.waiverAcknowledgementCheckbox.check();
      }
    }
    
    // Fill adult-specific fields if provided
    if (data.adultSignature) {
      const signatureVisible = await this.adultSignatureInput.isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      
      if (signatureVisible) {
        await this.adultSignatureInput.clear();
        await this.adultSignatureInput.fill(data.adultSignature);
      }
    }
    
    // Note: adult_todays_date is typically readonly and auto-populated by the form
    // We skip filling it if it's readonly
    if (data.adultTodaysDate) {
      const dateVisible = await this.adultTodaysDateInput.isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      
      if (dateVisible) {
        // Check if the field is readonly (getAttribute returns "" for readonly, null if not present)
        const isReadonly = await this.adultTodaysDateInput.getAttribute('readonly');
        if (isReadonly === null) {
          // Field is not readonly, we can fill it
          await this.adultTodaysDateInput.clear();
          await this.adultTodaysDateInput.fill(data.adultTodaysDate);
        }
        // If readonly, the field is auto-populated and we don't need to fill it
      }
    }
  }

  /**
   * Submit the waiver form
   */
  async submitWaiver(): Promise<void> {
    // Wait for submit button to be visible and enabled
    await expect(this.submitButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await expect(this.submitButton).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });
    
    // Click submit and wait for API response
    const responsePromise = waitForApiResponse(
      this.page,
      /submit-volunteer-waiver/,
      { timeout: TIMEOUTS.LONG }
    );
    
    await this.submitButton.click();
    
    try {
      await responsePromise;
    } catch (error) {
      console.log('Waiver submission API response timeout or error:', error);
    }
    
    // Wait for submission to complete
    await this.page.waitForTimeout(1000);
  }

  /**
   * Enter email and check for existing waiver
   * @param email - Email address to check
   */
  async checkEmail(email: string): Promise<void> {
    await this.emailInput.clear();
    await this.emailInput.fill(email);
    
    // Click check email button and wait for response
    const responsePromise = waitForApiResponse(
      this.page,
      /check-volunteer-waiver/,
      { timeout: TIMEOUTS.LONG }
    );
    
    await this.checkEmailButton.click();
    
    try {
      await responsePromise;
    } catch (error) {
      console.log('Check email API response timeout or error:', error);
    }
    
    // Wait for form to appear or message to display
    await this.page.waitForTimeout(1000);
  }

  /**
   * Complete the full waiver submission flow
   * @param email - Email address
   * @param data - Waiver form data
   */
  async submitCompleteWaiver(email: string, data: WaiverFormData): Promise<void> {
    await this.checkEmail(email);
    await this.fillWaiverForm(data);
    await this.submitWaiver();
  }

  /**
   * Assertion Methods
   */

  /**
   * Verify that the waiver form is visible
   */
  async expectFormVisible(): Promise<void> {
    await expect(this.waiverForm).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that waiver form fields are visible
   */
  async expectFormFieldsVisible(): Promise<void> {
    await expect(this.waiverFormFields).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that a validation error is displayed for a specific field
   * @param field - Field name to check for validation error
   */
  async expectValidationError(field: string): Promise<void> {
    // Look for validation error near the specified field
    const fieldLocator = this.page.locator(`#${field}, input[name="${field}"]`);
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
   * Verify that the waiver submission was successful
   */
  async expectSubmissionSuccess(): Promise<void> {
    await expect(this.successMessage).toBeVisible({ timeout: TIMEOUTS.LONG });
    
    // Verify success message contains expected text
    const successText = await this.successMessage.textContent();
    expect(successText?.toLowerCase()).toMatch(/thank you|success|received|recorded/);
  }

  /**
   * Verify that an error message is displayed
   * @param message - Expected error message text (partial match)
   */
  async expectErrorMessage(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    
    if (message) {
      const errorText = await this.errorMessage.textContent();
      expect(errorText?.toLowerCase()).toContain(message.toLowerCase());
    }
  }

  /**
   * Verify that no error message is displayed
   */
  async expectNoErrorMessage(): Promise<void> {
    const errorVisible = await this.errorMessage.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    expect(errorVisible).toBe(false);
  }

  /**
   * Verify that the submit button is disabled
   */
  async expectSubmitButtonDisabled(): Promise<void> {
    await expect(this.submitButton).toBeDisabled({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that the submit button is enabled
   */
  async expectSubmitButtonEnabled(): Promise<void> {
    await expect(this.submitButton).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that adult fields are visible (for users 18+)
   */
  async expectAdultFieldsVisible(): Promise<void> {
    await expect(this.adultSignatureInput).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await expect(this.adultTodaysDateInput).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Verify that adult fields are not visible (for minors)
   */
  async expectAdultFieldsHidden(): Promise<void> {
    const signatureVisible = await this.adultSignatureInput.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const dateVisible = await this.adultTodaysDateInput.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    
    expect(signatureVisible).toBe(false);
    expect(dateVisible).toBe(false);
  }

  /**
   * Verify that a minor warning message is displayed
   */
  async expectMinorWarning(): Promise<void> {
    const warningLocator = this.page.locator('#minor-warning-box, .minor-warning-box, text=/under 18/i');
    await expect(warningLocator).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  /**
   * Helper Methods
   */

  /**
   * Check if the waiver form fields are visible
   * @returns True if form fields are visible
   */
  async areFormFieldsVisible(): Promise<boolean> {
    return await this.waiverFormFields.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
  }

  /**
   * Check if the submit button is enabled
   * @returns True if submit button is enabled
   */
  async isSubmitButtonEnabled(): Promise<boolean> {
    return await this.submitButton.isEnabled({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
  }

  /**
   * Get the current value of a form field
   * @param fieldName - Name of the field
   * @returns Field value
   */
  async getFieldValue(fieldName: string): Promise<string> {
    const field = this.page.locator(`#${fieldName}, input[name="${fieldName}"]`);
    return await field.inputValue();
  }

  /**
   * Check if a field has a validation error
   * @param fieldName - Name of the field
   * @returns True if field has validation error
   */
  async hasFieldValidationError(fieldName: string): Promise<boolean> {
    const fieldLocator = this.page.locator(`#${fieldName}, input[name="${fieldName}"]`);
    const errorLocator = fieldLocator.locator('..').locator('.error, .validation-error, [class*="error"]');
    
    return await errorLocator.isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
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
   * Check if a date of birth represents an adult (18+)
   * @param dateOfBirth - Date of birth in YYYY-MM-DD format
   * @returns True if age is 18 or older
   */
  isAdult(dateOfBirth: string): boolean {
    return this.calculateAge(dateOfBirth) >= 18;
  }
}
