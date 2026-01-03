import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Exhibitor Self-Registration Workflow', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete full exhibitor registration workflow', async ({ page }) => {
    // Sign in as exhibitor
    await testSetup.signIn('user');
    
    // Navigate to show registration
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();

    // Step 1: Dog Selection
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Should only see own dogs (not advanced search)
    await expect(page.locator('[data-testid="dog-search-interface"]')).toBeVisible();
    await expect(page.locator('[data-testid="advanced-search-toggle"]')).not.toBeVisible();
    
    // Select a dog
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    
    // Verify dog is selected
    await expect(page.locator('[data-testid="selected-dogs-count"]')).toContainText('1');
    
    // Continue to next step
    await page.click('[data-testid="next-step-button"]');

    // Step 2: Class Selection
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
    
    // Should not see bulk operations
    await expect(page.locator('[data-testid="bulk-operations-toggle"]')).not.toBeVisible();
    
    // Select classes for the dog
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="class-option-novice-jumpers"]');
    
    // Verify classes selected
    await expect(page.locator('[data-testid="selected-classes-count"]')).toContainText('2');
    
    // Continue to payment
    await page.click('[data-testid="next-step-button"]');

    // Step 3: Payment (no handler assignment for exhibitor)
    await expect(page.locator('[data-testid="registration-step-payment"]')).toBeVisible();
    
    // Should only see standard payment options
    await expect(page.locator('[data-testid="payment-method-credit-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-check"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-secretary-paid"]')).not.toBeVisible();
    
    // Select credit card payment
    await page.click('[data-testid="payment-method-credit-card"]');
    
    // Verify fee calculation
    await expect(page.locator('[data-testid="total-fees"]')).toContainText('$');
    
    // Continue to confirmation
    await page.click('[data-testid="next-step-button"]');

    // Step 4: Confirmation
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    
    // Verify registration summary
    await expect(page.locator('[data-testid="confirmation-dog-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-classes-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-payment-method"]')).toContainText('Credit Card');
    
    // Should have limited secretary features
    await expect(page.locator('[data-testid="secretary-management-tabs"]')).not.toBeVisible();
    
    // Complete registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Verify success
    await expect(page.locator('[data-testid="registration-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="registration-confirmation-number"]')).toBeVisible();
  });

  test('should handle dog selection with 5 dog limit', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();

    // Select multiple dogs up to limit
    for (let i = 1; i <= 5; i++) {
      await page.click(`[data-testid="dog-card-${i}"] [data-testid="select-dog-button"]`);
    }
    
    // Verify selection count
    await expect(page.locator('[data-testid="selected-dogs-count"]')).toContainText('5');
    
    // Try to select 6th dog - should show limit warning
    await page.click('[data-testid="dog-card-6"] [data-testid="select-dog-button"]');
    await expect(page.locator('[data-testid="dog-limit-warning"]')).toBeVisible();
    
    // Verify still at 5 dogs
    await expect(page.locator('[data-testid="selected-dogs-count"]')).toContainText('5');
  });

  test('should validate required information', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();

    // Try to proceed without selecting dogs
    await page.click('[data-testid="next-step-button"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="dog-selection-error"]')).toBeVisible();
    
    // Select a dog and proceed
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');

    // Try to proceed without selecting classes
    await page.click('[data-testid="next-step-button"]');
    
    // Should show class selection error
    await expect(page.locator('[data-testid="class-selection-error"]')).toBeVisible();
  });

  test('should handle payment form validation', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete dog and class selection
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');

    // Select check payment
    await page.click('[data-testid="payment-method-check"]');
    
    // Try to proceed without check number
    await page.click('[data-testid="next-step-button"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="check-number-error"]')).toBeVisible();
    
    // Fill check number
    await page.fill('[data-testid="check-number-input"]', '1234');
    
    // Should be able to proceed
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await testSetup.signIn('user');
    
    // Mock network failure
    await page.route('**/api/**', async (route) => {
      await route.abort('failed');
    });
    
    await page.goto('/shows/show-123/register');
    
    // Should show network error boundary
    await expect(page.locator('[data-testid="network-error-boundary"]')).toBeVisible();
    
    // Should have retry button
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  });

  test('should persist draft registration data', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Select dog and class
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    
    // Navigate away and back
    await page.goto('/');
    await page.goto('/shows/show-123/register');
    
    // Should restore previous selections
    await expect(page.locator('[data-testid="dog-card-1"]')).toHaveClass(/selected/);
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="class-option-novice-standard"]')).toHaveClass(/selected/);
  });
});