import { Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result } from 'axe-core';

/**
 * Accessibility Testing Helper utilities using axe-core
 * Provides utilities for injecting axe, running accessibility checks,
 * and asserting WCAG compliance
 */

/**
 * Axe Configuration Options
 */
export interface AxeOptions {
  // WCAG level to test against
  wcagLevel?: 'A' | 'AA' | 'AAA';
  
  // Specific rules to run
  runOnly?: string[];
  
  // Rules to disable
  disableRules?: string[];
  
  // Elements to include in testing
  include?: string[];
  
  // Elements to exclude from testing
  exclude?: string[];
  
  // Whether to include detailed report
  detailedReport?: boolean;
}

/**
 * Inject axe-core into the page for accessibility testing
 * Note: With @axe-core/playwright, axe is automatically injected when using AxeBuilder
 * This function is provided for API compatibility but is not strictly necessary
 * @param page - Playwright page
 */
export async function injectAxe(page: Page): Promise<void> {
  // With @axe-core/playwright, axe is automatically injected when analyze() is called
  // This function is a no-op but provided for API compatibility
  console.log('✅ axe-core will be injected automatically on first analysis');
}

/**
 * Run accessibility checks on the current page
 * @param page - Playwright page
 * @param options - Axe configuration options
 * @returns Accessibility violations found
 */
export async function checkA11y(
  page: Page,
  options: AxeOptions = {}
): Promise<Result[]> {
  try {
    // Create AxeBuilder instance
    let axeBuilder = new AxeBuilder({ page });
    
    // Configure WCAG level
    if (options.wcagLevel) {
      const levelMap = {
        'A': ['wcag2a', 'wcag21a'],
        'AA': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        'AAA': ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa'],
      };
      axeBuilder = axeBuilder.withTags(levelMap[options.wcagLevel]);
    } else {
      // Default to WCAG 2.1 Level AA
      axeBuilder = axeBuilder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    }
    
    // Add specific rules if provided
    if (options.runOnly && options.runOnly.length > 0) {
      axeBuilder = axeBuilder.withRules(options.runOnly);
    }
    
    // Disable specific rules if provided
    if (options.disableRules && options.disableRules.length > 0) {
      axeBuilder = axeBuilder.disableRules(options.disableRules);
    }
    
    // Add include selectors
    if (options.include && options.include.length > 0) {
      options.include.forEach(selector => {
        axeBuilder = axeBuilder.include(selector);
      });
    }
    
    // Add exclude selectors
    if (options.exclude && options.exclude.length > 0) {
      options.exclude.forEach(selector => {
        axeBuilder = axeBuilder.exclude(selector);
      });
    }
    
    // Run accessibility analysis
    const results: AxeResults = await axeBuilder.analyze();
    const violations = results.violations;
    
    if (violations.length > 0) {
      console.log(`⚠️  Found ${violations.length} accessibility violations`);
      violations.forEach((violation, index) => {
        console.log(`  ${index + 1}. ${violation.id}: ${violation.description}`);
        console.log(`     Impact: ${violation.impact}`);
        console.log(`     Nodes affected: ${violation.nodes.length}`);
      });
    } else {
      console.log('✅ No accessibility violations found');
    }
    
    return violations;
  } catch (error) {
    console.error('❌ Accessibility check failed:', error);
    throw error;
  }
}

/**
 * Assert that the page meets WCAG accessibility compliance
 * This will fail the test if any violations are found
 * @param page - Playwright page
 * @param options - Axe configuration options
 */
export async function expectA11yCompliance(
  page: Page,
  options: AxeOptions = {}
): Promise<void> {
  try {
    // Run accessibility checks
    const violations = await checkA11y(page, options);
    
    // Assert no violations
    expect(violations).toHaveLength(0);
    
    console.log('✅ Page meets WCAG accessibility compliance');
  } catch (error) {
    console.error('❌ Accessibility compliance check failed:', error);
    throw error;
  }
}

/**
 * Check specific accessibility rules
 * @param page - Playwright page
 * @param ruleIds - Array of axe rule IDs to check
 * @returns Violations for the specified rules
 */
export async function checkSpecificRules(
  page: Page,
  ruleIds: string[]
): Promise<any[]> {
  return await checkA11y(page, {
    runOnly: ruleIds,
  });
}

/**
 * Check color contrast compliance
 * @param page - Playwright page
 * @returns Color contrast violations
 */
export async function checkColorContrast(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, ['color-contrast']);
}

/**
 * Check keyboard accessibility
 * @param page - Playwright page
 * @returns Keyboard accessibility violations
 */
export async function checkKeyboardAccessibility(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'focus-order-semantics',
    'focusable-content',
    'focusable-element',
    'tabindex',
  ]);
}

/**
 * Check form accessibility
 * @param page - Playwright page
 * @returns Form accessibility violations
 */
export async function checkFormAccessibility(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'label',
    'label-title-only',
    'form-field-multiple-labels',
    'input-button-name',
    'input-image-alt',
  ]);
}

/**
 * Check ARIA usage
 * @param page - Playwright page
 * @returns ARIA violations
 */
export async function checkAriaUsage(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'aria-allowed-attr',
    'aria-allowed-role',
    'aria-hidden-focus',
    'aria-input-field-name',
    'aria-required-attr',
    'aria-required-children',
    'aria-required-parent',
    'aria-roles',
    'aria-valid-attr',
    'aria-valid-attr-value',
  ]);
}

/**
 * Check heading structure
 * @param page - Playwright page
 * @returns Heading structure violations
 */
export async function checkHeadingStructure(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'heading-order',
    'empty-heading',
    'page-has-heading-one',
  ]);
}

/**
 * Check image accessibility
 * @param page - Playwright page
 * @returns Image accessibility violations
 */
export async function checkImageAccessibility(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'image-alt',
    'image-redundant-alt',
    'object-alt',
    'svg-img-alt',
  ]);
}

/**
 * Check landmark regions
 * @param page - Playwright page
 * @returns Landmark violations
 */
export async function checkLandmarks(page: Page): Promise<any[]> {
  return await checkSpecificRules(page, [
    'landmark-one-main',
    'landmark-unique',
    'region',
  ]);
}

/**
 * Exclude common third-party elements from accessibility checks
 * This is useful for excluding elements you don't control (ads, widgets, etc.)
 * @returns Array of selectors to exclude
 */
export function getCommonExclusions(): string[] {
  return [
    // Common third-party widgets
    'iframe[src*="google.com"]',
    'iframe[src*="facebook.com"]',
    'iframe[src*="twitter.com"]',
    'iframe[src*="youtube.com"]',
    
    // Common ad containers
    '.ad',
    '.advertisement',
    '[id*="ad-"]',
    '[class*="ad-"]',
    
    // Analytics scripts
    'script[src*="analytics"]',
    'script[src*="gtag"]',
    'script[src*="gtm"]',
  ];
}

/**
 * Get a detailed report of accessibility violations
 * @param violations - Array of violations from axe
 * @returns Formatted report string
 */
export function formatViolationReport(violations: any[]): string {
  if (violations.length === 0) {
    return '✅ No accessibility violations found';
  }
  
  let report = `\n⚠️  Found ${violations.length} accessibility violations:\n\n`;
  
  violations.forEach((violation, index) => {
    report += `${index + 1}. ${violation.id}\n`;
    report += `   Description: ${violation.description}\n`;
    report += `   Impact: ${violation.impact}\n`;
    report += `   Help: ${violation.help}\n`;
    report += `   Help URL: ${violation.helpUrl}\n`;
    report += `   Nodes affected: ${violation.nodes.length}\n`;
    
    violation.nodes.forEach((node: any, nodeIndex: number) => {
      report += `   \n   Node ${nodeIndex + 1}:\n`;
      report += `     HTML: ${node.html}\n`;
      report += `     Target: ${node.target.join(', ')}\n`;
      
      if (node.failureSummary) {
        report += `     Failure: ${node.failureSummary}\n`;
      }
    });
    
    report += '\n';
  });
  
  return report;
}

/**
 * Save accessibility report to file
 * @param page - Playwright page
 * @param violations - Array of violations
 * @param filename - Output filename
 */
export async function saveAccessibilityReport(
  page: Page,
  violations: any[],
  filename: string = 'accessibility-report.txt'
): Promise<void> {
  const report = formatViolationReport(violations);
  
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(filename, report, 'utf-8');
    console.log(`📄 Accessibility report saved to ${filename}`);
  } catch (error) {
    console.error('❌ Failed to save accessibility report:', error);
  }
}

/**
 * Assert that specific elements are keyboard accessible
 * @param page - Playwright page
 * @param selectors - Array of element selectors to check
 */
export async function expectKeyboardAccessible(
  page: Page,
  selectors: string[]
): Promise<void> {
  for (const selector of selectors) {
    const element = page.locator(selector);
    
    // Check if element exists
    await expect(element).toBeVisible();
    
    // Check if element is focusable
    await element.focus();
    const isFocused = await element.evaluate((el) => el === document.activeElement);
    
    expect(isFocused).toBe(true);
    console.log(`✅ Element is keyboard accessible: ${selector}`);
  }
}

/**
 * Assert that focus indicators are visible
 * @param page - Playwright page
 * @param selector - Element selector to check
 */
export async function expectVisibleFocusIndicator(
  page: Page,
  selector: string
): Promise<void> {
  const element = page.locator(selector);
  
  // Focus the element
  await element.focus();
  
  // Check for visible focus indicator (outline or box-shadow)
  const hasVisibleFocus = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    const outline = styles.outline;
    const boxShadow = styles.boxShadow;
    
    // Check if outline or box-shadow is set (not 'none')
    return (
      (outline && outline !== 'none' && outline !== '0px') ||
      (boxShadow && boxShadow !== 'none')
    );
  });
  
  expect(hasVisibleFocus).toBe(true);
  console.log(`✅ Element has visible focus indicator: ${selector}`);
}

/**
 * Check if screen reader text is present
 * @param page - Playwright page
 * @param text - Expected screen reader text
 * @returns Whether the text is present in screen reader accessible content
 */
export async function hasScreenReaderText(
  page: Page,
  text: string
): Promise<boolean> {
  // Check for text in aria-label, aria-labelledby, or visually hidden elements
  const hasText = await page.evaluate((searchText) => {
    // Check aria-label
    const ariaLabels = Array.from(document.querySelectorAll('[aria-label]'));
    if (ariaLabels.some(el => el.getAttribute('aria-label')?.includes(searchText))) {
      return true;
    }
    
    // Check aria-labelledby
    const ariaLabelledBy = Array.from(document.querySelectorAll('[aria-labelledby]'));
    for (const el of ariaLabelledBy) {
      const labelId = el.getAttribute('aria-labelledby');
      if (labelId) {
        const labelEl = document.getElementById(labelId);
        if (labelEl?.textContent?.includes(searchText)) {
          return true;
        }
      }
    }
    
    // Check visually hidden elements (common screen reader only patterns)
    const visuallyHidden = Array.from(document.querySelectorAll('.sr-only, .visually-hidden, .screen-reader-text'));
    if (visuallyHidden.some(el => el.textContent?.includes(searchText))) {
      return true;
    }
    
    return false;
  }, text);
  
  return hasText;
}

/**
 * Assert that screen reader text is present
 * @param page - Playwright page
 * @param text - Expected screen reader text
 */
export async function expectScreenReaderText(
  page: Page,
  text: string
): Promise<void> {
  const hasText = await hasScreenReaderText(page, text);
  expect(hasText).toBe(true);
  console.log(`✅ Screen reader text found: "${text}"`);
}
