import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Secretary Registration - New Users & Dogs', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete new exhibitor and dog creation workflow', async ({ page }) => {
    // Sign in as secretary
    await testSetup.signIn('secretary');
    
    // Navigate to show registration
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();

    // Step 1: Dog Selection with Creation
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Should see "Create New" option
    await expect(page.locator('[data-testid="create-new-dropdown"]')).toBeVisible();
    
    // Start creation workflow
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-exhibitor-and-dogs"]');
    
    // Should open QuickCreateFlow
    await expect(page.locator('[data-testid="quick-create-flow"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-step-exhibitor"]')).toHaveClass(/active/);

    // Step 1: Create Exhibitor
    await page.fill('[data-testid="exhibitor-first-name"]', 'John');
    await page.fill('[data-testid="exhibitor-last-name"]', 'Smith');
    await page.fill('[data-testid="exhibitor-email"]', 'john.smith@example.com');
    await page.fill('[data-testid="exhibitor-phone"]', '555-123-4567');
    await page.fill('[data-testid="exhibitor-address"]', '123 Main St');
    await page.fill('[data-testid="exhibitor-city"]', 'Anytown');
    await page.selectOption('[data-testid="exhibitor-state"]', 'CA');
    await page.fill('[data-testid="exhibitor-zip"]', '12345');
    
    // Test duplicate detection
    await page.click('[data-testid="check-duplicates-button"]');
    await expect(page.locator('[data-testid="duplicate-detection-results"]')).toBeVisible();
    
    // Should show no duplicates for unique email
    await expect(page.locator('[data-testid="no-duplicates-found"]')).toBeVisible();
    
    // Continue to dog creation
    await page.click('[data-testid="next-step-button"]');

    // Step 2: Create Dogs
    await expect(page.locator('[data-testid="create-step-dogs"]')).toHaveClass(/active/);
    
    // Add first dog
    await page.click('[data-testid="add-dog-button"]');
    
    // Basic Info tab
    await page.fill('[data-testid="dog-call-name"]', 'Buddy');
    await page.fill('[data-testid="dog-registered-name"]', 'Champion Buddy of Greatness');
    await page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
    await page.selectOption('[data-testid="dog-gender"]', 'Male');
    await page.fill('[data-testid="dog-birth-date"]', '2020-05-15');
    
    // Should auto-calculate age
    await expect(page.locator('[data-testid="calculated-age"]')).toContainText('4 years');
    
    // Registration tab
    await page.click('[data-testid="registration-tab"]');
    await page.selectOption('[data-testid="registration-org"]', 'AKC');
    await page.fill('[data-testid="registration-number"]', 'SS12345678');
    
    // Additional Info tab
    await page.click('[data-testid="additional-info-tab"]');
    await page.fill('[data-testid="microchip-number"]', '123456789012345');
    await page.selectOption('[data-testid="color"]', 'Golden');
    
    // Add second dog
    await page.click('[data-testid="add-another-dog-button"]');
    await page.fill('[data-testid="dog-call-name-2"]', 'Luna');
    await page.fill('[data-testid="dog-registered-name-2"]', 'Moonlight Luna Princess');
    await page.selectOption('[data-testid="dog-breed-2"]', 'Border Collie');
    await page.selectOption('[data-testid="dog-gender-2"]', 'Female');
    
    // Continue to review
    await page.click('[data-testid="next-step-button"]');

    // Step 3: Review
    await expect(page.locator('[data-testid="create-step-review"]')).toHaveClass(/active/);
    
    // Verify exhibitor data
    await expect(page.locator('[data-testid="review-exhibitor-name"]')).toContainText('John Smith');
    await expect(page.locator('[data-testid="review-exhibitor-email"]')).toContainText('john.smith@example.com');
    
    // Verify dogs data
    await expect(page.locator('[data-testid="review-dog-1-name"]')).toContainText('Buddy');
    await expect(page.locator('[data-testid="review-dog-2-name"]')).toContainText('Luna');
    
    // Complete creation
    await page.click('[data-testid="create-all-button"]');
    
    // Should show creation success
    await expect(page.locator('[data-testid="creation-success"]')).toBeVisible();
    
    // Dogs should be auto-selected for registration
    await expect(page.locator('[data-testid="auto-selected-dogs"]')).toContainText('2');
    
    // Continue with normal registration workflow
    await page.click('[data-testid="continue-registration-button"]');

    // Step 2: Class Selection
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
    
    // Apply classes to both dogs
    await page.click('[data-testid="preset-beginner-agility"]');
    await page.click('[data-testid="apply-to-all-button"]');
    
    await page.click('[data-testid="next-step-button"]');

    // Step 3: Handler Assignment (auto-assigned to owner)
    await expect(page.locator('[data-testid="registration-step-handler-assignment"]')).toBeVisible();
    await expect(page.locator('[data-testid="auto-assigned-to-owner"]')).toContainText('2');
    
    await page.click('[data-testid="next-step-button"]');

    // Step 4: Payment
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '2001');
    
    await page.click('[data-testid="next-step-button"]');

    // Step 5: Confirmation
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-exhibitor-created"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-dogs-created"]')).toContainText('2');
    
    // Complete registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Verify success with creation summary
    await expect(page.locator('[data-testid="registration-success-with-creation"]')).toBeVisible();
    await expect(page.locator('[data-testid="exhibitor-created-id"]')).toBeVisible();
    await expect(page.locator('[data-testid="dogs-created-count"]')).toContainText('2');
  });

  test('should handle duplicate exhibitor detection', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Start creation with existing email
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-exhibitor-only"]');
    
    await page.fill('[data-testid="exhibitor-email"]', 'existing@example.com');
    await page.fill('[data-testid="exhibitor-first-name"]', 'John');
    await page.fill('[data-testid="exhibitor-last-name"]', 'Smith');
    
    // Check for duplicates
    await page.click('[data-testid="check-duplicates-button"]');
    
    // Should show duplicate matches
    await expect(page.locator('[data-testid="duplicate-matches"]')).toBeVisible();
    await expect(page.locator('[data-testid="duplicate-score-high"]')).toBeVisible();
    
    // Should offer to select existing user
    await expect(page.locator('[data-testid="select-existing-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-anyway-button"]')).toBeVisible();
    
    // Select existing user
    await page.click('[data-testid="select-existing-button"]');
    
    // Should return to dog selection with existing user's dogs
    await expect(page.locator('[data-testid="existing-user-dogs"]')).toBeVisible();
  });

  test('should validate dog creation forms', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-dog-only"]');
    
    // Try to save without required fields
    await page.click('[data-testid="save-dog-button"]');
    
    // Should show validation errors
    await expect(page.locator('[data-testid="call-name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="breed-error"]')).toBeVisible();
    
    // Fill required fields
    await page.fill('[data-testid="dog-call-name"]', 'Rex');
    await page.selectOption('[data-testid="dog-breed"]', 'German Shepherd');
    
    // Should clear validation errors
    await expect(page.locator('[data-testid="call-name-error"]')).not.toBeVisible();
    
    // Test auto-fill from registered name
    await page.fill('[data-testid="dog-registered-name"]', 'Amazing Rex of Champions');
    await page.click('[data-testid="auto-fill-call-name"]');
    
    // Should suggest "Rex" from registered name
    await expect(page.locator('[data-testid="suggested-call-name"]')).toContainText('Rex');
  });

  test('should handle search query forwarding to creation forms', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Search for non-existent exhibitor
    await page.fill('[data-testid="search-input"]', 'Jane Doe janedoe@email.com');
    await page.waitForSelector('[data-testid="no-results-found"]');
    
    // Click create new from search results
    await page.click('[data-testid="create-from-search"]');
    
    // Should pre-fill form with search query data
    await expect(page.locator('[data-testid="exhibitor-name-prefilled"]')).toHaveValue('Jane Doe');
    await expect(page.locator('[data-testid="exhibitor-email-prefilled"]')).toHaveValue('janedoe@email.com');
  });

  test('should support batch dog creation', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-exhibitor-and-dogs"]');
    
    // Create exhibitor
    await page.fill('[data-testid="exhibitor-first-name"]', 'Mary');
    await page.fill('[data-testid="exhibitor-last-name"]', 'Johnson');
    await page.fill('[data-testid="exhibitor-email"]', 'mary.johnson@example.com');
    await page.click('[data-testid="next-step-button"]');
    
    // Add multiple dogs
    for (let i = 1; i <= 5; i++) {
      await page.click('[data-testid="add-dog-button"]');
      await page.fill(`[data-testid="dog-call-name-${i}"]`, `Dog${i}`);
      await page.selectOption(`[data-testid="dog-breed-${i}"]`, 'Labrador Retriever');
      await page.selectOption(`[data-testid="dog-gender-${i}"]`, i % 2 === 0 ? 'Female' : 'Male');
    }
    
    // Verify all dogs listed
    await expect(page.locator('[data-testid="dogs-to-create-count"]')).toContainText('5');
    
    // Continue to review
    await page.click('[data-testid="next-step-button"]');
    
    // Should show all dogs in review
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(`[data-testid="review-dog-${i}"]`)).toBeVisible();
    }
    
    // Create all
    await page.click('[data-testid="create-all-button"]');
    
    // Should show batch creation success
    await expect(page.locator('[data-testid="batch-creation-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="dogs-created-count"]')).toContainText('5');
  });

  test('should validate breed and registration requirements', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-dog-only"]');
    
    // Select breed with specific registration requirements
    await page.selectOption('[data-testid="dog-breed"]', 'Border Collie');
    
    // Should show breed-specific validation
    await expect(page.locator('[data-testid="breed-requirements"]')).toBeVisible();
    
    // Test registration number validation
    await page.click('[data-testid="registration-tab"]');
    await page.selectOption('[data-testid="registration-org"]', 'AKC');
    await page.fill('[data-testid="registration-number"]', 'invalid');
    
    // Should show format error
    await expect(page.locator('[data-testid="registration-format-error"]')).toBeVisible();
    
    // Fix registration number
    await page.fill('[data-testid="registration-number"]', 'SS12345678');
    await expect(page.locator('[data-testid="registration-format-error"]')).not.toBeVisible();
  });

  test('should maintain creation progress on navigation', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Start creation workflow
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-exhibitor-and-dogs"]');
    
    // Fill partial data
    await page.fill('[data-testid="exhibitor-first-name"]', 'Test');
    await page.fill('[data-testid="exhibitor-email"]', 'test@example.com');
    
    // Navigate away
    await page.goto('/');
    
    // Return to registration
    await page.goto('/shows/show-123/register');
    await page.click('[data-testid="create-new-dropdown"]');
    await page.click('[data-testid="create-exhibitor-and-dogs"]');
    
    // Should restore draft data
    await expect(page.locator('[data-testid="draft-restored-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="exhibitor-first-name"]')).toHaveValue('Test');
    await expect(page.locator('[data-testid="exhibitor-email"]')).toHaveValue('test@example.com');
  });
});