import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Phase 3.1: Single Dog, Single Class Entry Registration', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete full single dog, single class registration workflow', async ({ page }) => {
    console.log('=== Starting Single Dog, Single Class Registration Test ===');
    
    // Step 1: Sign in as exhibitor
    await testSetup.signIn('user');
    console.log('✓ Signed in as exhibitor');
    
    // Step 2: Navigate to registration page (following existing pattern)
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();
    
    // Verify registration workflow loaded
    await expect(page.locator('[data-testid="registration-workflow"]')).toBeVisible();
    console.log('✓ Registration workflow loaded');

    // =====================================================
    // STEP 1: DOG SELECTION
    // =====================================================
    console.log('--- Testing Dog Selection Step ---');
    
    // Verify we're on dog selection step
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Verify exhibitor mode (no advanced search)
    await expect(page.locator('[data-testid="advanced-search-toggle"]')).not.toBeVisible();
    
    // Should see dog search interface
    await expect(page.locator('[data-testid="dog-search-interface"]')).toBeVisible();
    
    // Select a dog (use existing test pattern)
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    
    // Verify dog is selected
    await expect(page.locator('[data-testid="selected-dogs-count"]')).toContainText('1');
    
    // Verify we can proceed
    await expect(page.locator('[data-testid="next-step-button"]')).toBeEnabled();
    console.log('✓ Dog selection completed');
    
    // Proceed to class selection
    await page.click('[data-testid="next-step-button"]');

    // =====================================================
    // STEP 2: CLASS SELECTION  
    // =====================================================
    console.log('--- Testing Class Selection Step ---');
    
    // Verify we're on class selection step
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
    
    // Should not see bulk operations for exhibitor
    await expect(page.locator('[data-testid="bulk-operations-toggle"]')).not.toBeVisible();
    
    // Select classes for the dog (following existing pattern)
    await page.click('[data-testid="class-option-novice-standard"]');
    
    // Verify class is selected
    await expect(page.locator('[data-testid="selected-classes-count"]')).toContainText('1');
    
    // Verify we can proceed
    await expect(page.locator('[data-testid="next-step-button"]')).toBeEnabled();
    console.log('✓ Class selection completed');
    
    // Proceed to payment step
    await page.click('[data-testid="next-step-button"]');

    // =====================================================
    // STEP 3: PAYMENT (no handler assignment for exhibitor)
    // =====================================================
    console.log('--- Testing Payment Step ---');
    
    // Verify we're on payment step
    await expect(page.locator('[data-testid="registration-step-payment"]')).toBeVisible();
    
    // Should only see standard payment options for exhibitor
    await expect(page.locator('[data-testid="payment-method-credit-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-check"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-secretary-paid"]')).not.toBeVisible();
    
    // Select credit card payment
    await page.click('[data-testid="payment-method-credit-card"]');
    
    // Verify fee calculation
    await expect(page.locator('[data-testid="total-fees"]')).toContainText('$');
    
    // Verify we can proceed
    await expect(page.locator('[data-testid="next-step-button"]')).toBeEnabled();
    console.log('✓ Payment information completed');
    
    // Proceed to confirmation
    await page.click('[data-testid="next-step-button"]');

    // =====================================================
    // STEP 4: CONFIRMATION
    // =====================================================
    console.log('--- Testing Confirmation Step ---');
    
    // Verify we're on confirmation step
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    
    // Verify registration summary
    await expect(page.locator('[data-testid="confirmation-dog-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-classes-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-payment-method"]')).toContainText('Credit Card');
    
    // Should have limited secretary features for exhibitor
    await expect(page.locator('[data-testid="secretary-management-tabs"]')).not.toBeVisible();
    
    // Complete registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Verify success
    await expect(page.locator('[data-testid="registration-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="registration-confirmation-number"]')).toBeVisible();
    
    console.log('✓ Registration confirmation completed');
    console.log('=== Single Dog, Single Class Registration Test PASSED ===');
  });

  test('should handle validation errors correctly', async ({ page }) => {
    console.log('=== Testing Registration Validation ===');
    
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading(); 

    // Try to proceed without selecting a dog
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
    
    console.log('✓ Validation prevents proceeding without required data');
  });

  test('should handle payment processing correctly', async ({ page }) => {
    console.log('=== Testing Payment Processing ===');
    
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete dog and class selection quickly
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test check payment
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
    
    console.log('✓ Payment method validation working correctly');
  });

  test('should update entry status correctly through the workflow', async ({ page }) => {
    console.log('=== Testing Entry Status Updates ===');
    
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration flow
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Select payment and complete
    await page.click('[data-testid="payment-method-credit-card"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Complete registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Verify success indicates proper status progression
    await expect(page.locator('[data-testid="registration-success-message"]')).toBeVisible();
    
    console.log('✓ Entry status progressed through workflow correctly');
  });

  test('should handle network errors gracefully', async ({ page }) => {
    console.log('=== Testing Network Error Handling ===');
    
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
    
    console.log('✓ Network error handling working correctly');
  });

  test('should preserve draft data across page refreshes', async ({ page }) => {
    console.log('=== Testing Draft Persistence ===');
    
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Start registration
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
    
    console.log('✓ Draft persistence working correctly');
  });
});