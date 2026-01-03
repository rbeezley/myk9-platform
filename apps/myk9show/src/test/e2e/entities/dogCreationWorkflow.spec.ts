/**
 * E2E Tests for Dog Creation Workflows
 * 
 * Tests the actual GUI interactions for creating dogs, people, and shows
 * Complements the LoadTestService performance tests with real user workflow validation
 */

import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Dog Creation GUI Workflows', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Add Dog Wizard', () => {
    test('should complete full dog creation wizard', async ({ page }) => {
      // Navigate to add dog page
      await page.goto('/dogs/add');
      await testSetup.waitForLoading();

      // Step 1: Basic Information
      await expect(page.locator('[data-testid="dog-basic-info-step"]')).toBeVisible();
      
      await page.fill('[data-testid="dog-name-input"]', 'Buddy');
      await page.selectOption('[data-testid="dog-breed-select"]', 'Golden Retriever');
      await page.selectOption('[data-testid="dog-sex-select"]', 'male');
      await page.fill('[data-testid="dog-age-input"]', '3');
      await page.fill('[data-testid="dog-color-input"]', 'Golden');
      
      // Test validation - required fields
      await page.fill('[data-testid="dog-name-input"]', '');
      await page.click('[data-testid="next-step-button"]');
      await expect(page.locator('[data-testid="name-error-message"]')).toContainText('Name is required');
      
      // Fix validation error and continue
      await page.fill('[data-testid="dog-name-input"]', 'Buddy');
      await page.click('[data-testid="next-step-button"]');

      // Step 2: Owner Information
      await expect(page.locator('[data-testid="dog-owner-info-step"]')).toBeVisible();
      
      // Option 1: Select existing owner
      await page.click('[data-testid="existing-owner-tab"]');
      await page.fill('[data-testid="owner-search-input"]', 'John Doe');
      await page.click('[data-testid="owner-search-result-1"]');
      
      // Or Option 2: Create new owner
      await page.click('[data-testid="new-owner-tab"]');
      await page.fill('[data-testid="owner-first-name"]', 'Jane');
      await page.fill('[data-testid="owner-last-name"]', 'Smith');
      await page.fill('[data-testid="owner-email"]', 'jane.smith@example.com');
      await page.fill('[data-testid="owner-phone"]', '555-123-4567');
      
      await page.click('[data-testid="next-step-button"]');

      // Step 3: Registration Information
      await expect(page.locator('[data-testid="dog-registration-step"]')).toBeVisible();
      
      await page.selectOption('[data-testid="registration-org-select"]', 'AKC');
      await page.fill('[data-testid="registration-name-input"]', 'CH Buddy Golden Star');
      await page.fill('[data-testid="registration-number-input"]', 'AKC12345678');
      await page.fill('[data-testid="microchip-number-input"]', '123456789012345');
      
      await page.click('[data-testid="next-step-button"]');

      // Step 4: Health Information (Optional)
      await expect(page.locator('[data-testid="dog-health-step"]')).toBeVisible();
      
      await page.fill('[data-testid="weight-input"]', '65');
      await page.fill('[data-testid="height-input"]', '24');
      
      // Add vaccination record
      await page.click('[data-testid="add-vaccination-button"]');
      await page.selectOption('[data-testid="vaccine-type-select"]', 'Rabies');
      await page.fill('[data-testid="vaccine-date-input"]', '2024-01-15');
      await page.fill('[data-testid="veterinarian-input"]', 'Dr. Wilson');
      
      await page.click('[data-testid="next-step-button"]');

      // Step 5: Review and Submit
      await expect(page.locator('[data-testid="dog-review-step"]')).toBeVisible();
      
      // Verify all information is displayed correctly
      await expect(page.locator('[data-testid="review-dog-name"]')).toContainText('Buddy');
      await expect(page.locator('[data-testid="review-dog-breed"]')).toContainText('Golden Retriever');
      await expect(page.locator('[data-testid="review-owner-name"]')).toContainText('Jane Smith');
      await expect(page.locator('[data-testid="review-registration-number"]')).toContainText('AKC12345678');
      
      // Submit the form
      await page.click('[data-testid="submit-dog-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Dog registered successfully');
      await expect(page.url()).toContain('/dogs');
      
      // Verify dog appears in list
      await expect(page.locator('[data-testid="dog-card-buddy"]')).toBeVisible();
    });

    test('should handle wizard navigation - back and forth', async ({ page }) => {
      await page.goto('/dogs/add');
      
      // Fill step 1
      await page.fill('[data-testid="dog-name-input"]', 'Max');
      await page.selectOption('[data-testid="dog-breed-select"]', 'Labrador');
      await page.click('[data-testid="next-step-button"]');
      
      // Go to step 2, then back to step 1
      await page.click('[data-testid="previous-step-button"]');
      await expect(page.locator('[data-testid="dog-name-input"]')).toHaveValue('Max');
      await expect(page.locator('[data-testid="dog-breed-select"]')).toHaveValue('Labrador');
      
      // Navigate forward again
      await page.click('[data-testid="next-step-button"]');
      await expect(page.locator('[data-testid="dog-owner-info-step"]')).toBeVisible();
    });

    test('should handle form validation errors', async ({ page }) => {
      await page.goto('/dogs/add');
      
      // Try to submit without required fields
      await page.click('[data-testid="next-step-button"]');
      
      // Should show validation errors
      await expect(page.locator('[data-testid="name-error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="breed-error-message"]')).toBeVisible();
      
      // Fill one field, error should disappear
      await page.fill('[data-testid="dog-name-input"]', 'Test Dog');
      await expect(page.locator('[data-testid="name-error-message"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="breed-error-message"]')).toBeVisible();
    });

    test('should save draft and allow resuming', async ({ page }) => {
      await page.goto('/dogs/add');
      
      // Fill partial information
      await page.fill('[data-testid="dog-name-input"]', 'Draft Dog');
      await page.selectOption('[data-testid="dog-breed-select"]', 'Beagle');
      
      // Save as draft
      await page.click('[data-testid="save-draft-button"]');
      await expect(page.locator('[data-testid="draft-saved-message"]')).toContainText('Draft saved');
      
      // Navigate away and come back
      await page.goto('/dogs');
      await page.goto('/dogs/add');
      
      // Should offer to resume draft
      await expect(page.locator('[data-testid="resume-draft-dialog"]')).toBeVisible();
      await page.click('[data-testid="resume-draft-button"]');
      
      // Should restore previous values
      await expect(page.locator('[data-testid="dog-name-input"]')).toHaveValue('Draft Dog');
      await expect(page.locator('[data-testid="dog-breed-select"]')).toHaveValue('Beagle');
    });
  });

  test.describe('User Creation Workflow', () => {
    test('should create new person through add person form', async ({ page }) => {
      await page.goto('/people/add');
      
      // Fill person details
      await page.fill('[data-testid="first-name-input"]', 'Alice');
      await page.fill('[data-testid="last-name-input"]', 'Johnson');
      await page.fill('[data-testid="email-input"]', 'alice.johnson@example.com');
      await page.fill('[data-testid="phone-input"]', '555-987-6543');
      
      // Address information
      await page.fill('[data-testid="address-input"]', '123 Main St');
      await page.fill('[data-testid="city-input"]', 'Springfield');
      await page.selectOption('[data-testid="state-select"]', 'IL');
      await page.fill('[data-testid="zip-input"]', '62701');
      
      // Membership information
      await page.fill('[data-testid="membership-id-input"]', 'MEM789123');
      await page.check('[data-testid="role-exhibitor-checkbox"]');
      
      // Submit
      await page.click('[data-testid="submit-person-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText('User added successfully');
      await expect(page.url()).toContain('/people');
      
      // Verify person appears in list
      await expect(page.locator('[data-testid="person-card-alice-johnson"]')).toBeVisible();
    });
  });

  test.describe('Show Creation Workflow', () => {
    test('should create new show through show wizard', async ({ page }) => {
      // Navigate to admin area and create show
      await page.goto('/admin/shows/add');
      
      // Basic show information
      await page.fill('[data-testid="show-name-input"]', 'Spring Championship 2024');
      await page.selectOption('[data-testid="organization-select"]', 'AKC');
      await page.fill('[data-testid="start-date-input"]', '2024-06-15');
      await page.fill('[data-testid="end-date-input"]', '2024-06-16');
      
      // Location information
      await page.fill('[data-testid="venue-input"]', 'Central Park Convention Center');
      await page.fill('[data-testid="venue-address-input"]', '456 Convention Blvd');
      await page.fill('[data-testid="venue-city-input"]', 'Chicago');
      await page.selectOption('[data-testid="venue-state-select"]', 'IL');
      
      // Entry information
      await page.fill('[data-testid="entry-deadline-input"]', '2024-06-01');
      await page.fill('[data-testid="regular-fee-input"]', '35');
      await page.fill('[data-testid="veteran-fee-input"]', '30');
      
      // Submit
      await page.click('[data-testid="create-show-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Show created successfully');
      await expect(page.url()).toContain('/shows/');
      
      // Verify show details are displayed
      await expect(page.locator('[data-testid="show-title"]')).toContainText('Spring Championship 2024');
    });
  });

  test.describe('Integration Workflows', () => {
    test('should create person, then dog for that person', async ({ page }) => {
      // First create a person
      await page.goto('/people/add');
      await page.fill('[data-testid="first-name-input"]', 'Bob');
      await page.fill('[data-testid="last-name-input"]', 'Wilson');
      await page.fill('[data-testid="email-input"]', 'bob.wilson@example.com');
      await page.click('[data-testid="submit-person-button"]');
      
      // Wait for person to be created
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      // Now create a dog for this person
      await page.goto('/dogs/add');
      await page.fill('[data-testid="dog-name-input"]', 'Rex');
      await page.selectOption('[data-testid="dog-breed-select"]', 'German Shepherd');
      await page.click('[data-testid="next-step-button"]');
      
      // Select the person we just created
      await page.click('[data-testid="existing-owner-tab"]');
      await page.fill('[data-testid="owner-search-input"]', 'Bob Wilson');
      await page.click('[data-testid="owner-search-result-bob-wilson"]');
      await page.click('[data-testid="next-step-button"]');
      
      // Skip registration step
      await page.click('[data-testid="skip-registration-button"]');
      
      // Submit
      await page.click('[data-testid="submit-dog-button"]');
      
      // Verify dog is linked to person
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Dog registered successfully');
      await page.goto('/people');
      await page.click('[data-testid="person-card-bob-wilson"]');
      await expect(page.locator('[data-testid="person-dogs-list"]')).toContainText('Rex');
    });
  });

  test.describe('Performance and Stress Testing', () => {
    test('should handle form with many options efficiently', async ({ page }) => {
      // Navigate to dog creation with many breed options
      await page.goto('/dogs/add');
      
      // Measure time to load breed dropdown
      const startTime = Date.now();
      await page.click('[data-testid="dog-breed-select"]');
      await expect(page.locator('[data-testid="breed-option-golden-retriever"]')).toBeVisible();
      const loadTime = Date.now() - startTime;
      
      // Should load quickly (under 1 second)
      expect(loadTime).toBeLessThan(1000);
      
      // Search within dropdown should be fast
      await page.fill('[data-testid="breed-search-input"]', 'Lab');
      await expect(page.locator('[data-testid="breed-option-labrador"]')).toBeVisible();
      await expect(page.locator('[data-testid="breed-option-golden-retriever"]')).not.toBeVisible();
    });
  });
});