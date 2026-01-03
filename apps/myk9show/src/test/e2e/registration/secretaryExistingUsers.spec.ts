import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Secretary Registration - Existing Users', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete secretary workflow for existing users', async ({ page }) => {
    // Sign in as secretary
    await testSetup.signIn('secretary');
    
    // Navigate to show registration
    await page.goto('/shows/show-123/register');
    await testSetup.waitForLoading();

    // Step 1: Dog Selection - Enhanced Mode
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Should see advanced search interface
    await expect(page.locator('[data-testid="dog-search-interface"]')).toBeVisible();
    await expect(page.locator('[data-testid="advanced-search-toggle"]')).toBeVisible();
    
    // Should see bulk selection features
    await expect(page.locator('[data-testid="bulk-selection-toggle"]')).toBeVisible();
    
    // Test advanced search
    await page.fill('[data-testid="search-input"]', 'Golden Retriever');
    await page.click('[data-testid="advanced-search-toggle"]');
    
    // Use breed filter
    await page.selectOption('[data-testid="breed-filter"]', 'Golden Retriever');
    await page.click('[data-testid="apply-filters-button"]');
    
    // Select multiple dogs (up to 50)
    for (let i = 1; i <= 10; i++) {
      await page.click(`[data-testid="dog-card-${i}"] [data-testid="select-dog-button"]`);
    }
    
    // Verify bulk selection
    await expect(page.locator('[data-testid="selected-dogs-count"]')).toContainText('10');
    
    // Test bulk operations
    await page.click('[data-testid="bulk-selection-toggle"]');
    await page.click('[data-testid="select-all-visible-button"]');
    
    // Continue to class selection
    await page.click('[data-testid="next-step-button"]');

    // Step 2: Class Selection - Bulk Operations
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
    
    // Should see bulk operations
    await expect(page.locator('[data-testid="bulk-operations-toggle"]')).toBeVisible();
    
    // Test class presets
    await expect(page.locator('[data-testid="class-presets"]')).toBeVisible();
    await page.click('[data-testid="preset-all-agility"]');
    
    // Should apply to all selected dogs
    await expect(page.locator('[data-testid="bulk-classes-applied"]')).toBeVisible();
    
    // Test individual class modification
    await page.click('[data-testid="dog-1-classes-edit"]');
    await page.click('[data-testid="add-class-scent-work"]');
    await page.click('[data-testid="save-dog-classes"]');
    
    // Continue to handler assignment
    await page.click('[data-testid="next-step-button"]');

    // Step 3: Handler Assignment
    await expect(page.locator('[data-testid="registration-step-handler-assignment"]')).toBeVisible();
    
    // Should show handler assignment dashboard
    await expect(page.locator('[data-testid="handler-assignment-stats"]')).toBeVisible();
    
    // Should have auto-assigned owners as handlers
    await expect(page.locator('[data-testid="auto-assigned-handlers"]')).toContainText('10');
    
    // Test bulk handler assignment
    await page.click('[data-testid="bulk-assign-handler"]');
    await page.fill('[data-testid="handler-search"]', 'Professional Handler');
    await page.click('[data-testid="handler-result-1"]');
    await page.click('[data-testid="assign-to-selected-button"]');
    
    // Verify handler assignments
    await expect(page.locator('[data-testid="professional-handlers-count"]')).toBeVisible();
    
    // Continue to payment
    await page.click('[data-testid="next-step-button"]');

    // Step 4: Payment - Secretary Features
    await expect(page.locator('[data-testid="registration-step-payment"]')).toBeVisible();
    
    // Should see all payment options including secretary-specific
    await expect(page.locator('[data-testid="payment-method-secretary-paid"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-group-payment"]')).toBeVisible();
    
    // Test bulk payment handling
    await page.click('[data-testid="payment-reconciliation-tab"]');
    await expect(page.locator('[data-testid="payment-statistics"]')).toBeVisible();
    
    // Mark multiple entries as paid by check
    await page.click('[data-testid="bulk-operations-tab"]');
    await page.click('[data-testid="select-all-pending"]');
    await page.selectOption('[data-testid="bulk-payment-method"]', 'check');
    await page.fill('[data-testid="bulk-check-numbers"]', '1001-1010');
    await page.click('[data-testid="apply-bulk-payment"]');
    
    // Verify payment status updates
    await expect(page.locator('[data-testid="bulk-payment-success"]')).toBeVisible();
    
    // Continue to confirmation
    await page.click('[data-testid="next-step-button"]');

    // Step 5: Confirmation - Secretary Management
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    
    // Should see secretary management tabs
    await expect(page.locator('[data-testid="secretary-management-tabs"]')).toBeVisible();
    
    // Test status management
    await page.click('[data-testid="status-management-tab"]');
    await page.click('[data-testid="entry-1-status-dropdown"]');
    await page.selectOption('[data-testid="entry-1-status-dropdown"]', 'accepted');
    await page.fill('[data-testid="status-change-notes"]', 'Entry accepted - all documentation complete');
    await page.click('[data-testid="update-status-button"]');
    
    // Test armband assignment
    await page.click('[data-testid="armband-assignment-tab"]');
    await page.click('[data-testid="auto-assign-armbands"]');
    await expect(page.locator('[data-testid="armbands-assigned-success"]')).toBeVisible();
    
    // Complete registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Verify bulk registration success
    await expect(page.locator('[data-testid="bulk-registration-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="registrations-created-count"]')).toContainText('10');
  });

  test('should handle search performance with large datasets', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Test search with 1000+ dogs
    await page.fill('[data-testid="search-input"]', 'a');
    
    // Should use virtual scrolling
    await expect(page.locator('[data-testid="virtual-list"]')).toBeVisible();
    
    // Search should be debounced and fast
    const startTime = Date.now();
    await page.fill('[data-testid="search-input"]', 'border collie');
    await page.waitForSelector('[data-testid="search-results"]', { timeout: 1000 });
    const endTime = Date.now();
    
    // Should complete search in under 500ms
    expect(endTime - startTime).toBeLessThan(500);
    
    // Should show search performance indicator
    await expect(page.locator('[data-testid="search-performance-indicator"]')).toBeVisible();
  });

  test('should cache search results effectively', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Perform initial search
    await page.fill('[data-testid="search-input"]', 'labrador');
    await page.waitForSelector('[data-testid="search-results"]');
    
    // Clear search and search again
    await page.fill('[data-testid="search-input"]', '');
    await page.fill('[data-testid="search-input"]', 'labrador');
    
    // Should show cached results indicator
    await expect(page.locator('[data-testid="cached-results-indicator"]')).toBeVisible();
    
    // Should show recent searches
    await page.click('[data-testid="search-input"]');
    await expect(page.locator('[data-testid="recent-searches"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-search-labrador"]')).toBeVisible();
  });

  test('should handle bulk operations efficiently', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Select 20 dogs for bulk operations
    await page.click('[data-testid="bulk-selection-toggle"]');
    for (let i = 1; i <= 20; i++) {
      await page.click(`[data-testid="dog-card-${i}"] [data-testid="select-dog-checkbox"]`);
    }
    
    // Test bulk class application
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="bulk-operations-toggle"]');
    await page.click('[data-testid="preset-beginner-agility"]');
    
    // Should complete in under 2 seconds
    const startTime = Date.now();
    await page.click('[data-testid="apply-to-all-button"]');
    await page.waitForSelector('[data-testid="bulk-operation-complete"]', { timeout: 3000 });
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(2000);
    
    // Verify all dogs have classes
    await expect(page.locator('[data-testid="dogs-with-classes-count"]')).toContainText('20');
  });

  test('should provide detailed registration audit trail', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Complete registration workflow
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]'); // Skip handler (auto-assigned)
    await page.click('[data-testid="payment-method-secretary-paid"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Check audit trail in confirmation
    await expect(page.locator('[data-testid="audit-trail"]')).toBeVisible();
    await expect(page.locator('[data-testid="created-by-secretary"]')).toBeVisible();
    await expect(page.locator('[data-testid="registration-timestamp"]')).toBeVisible();
    await expect(page.locator('[data-testid="modification-history"]')).toBeVisible();
  });

  test('should handle fee overrides and payment reconciliation', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Complete to payment step
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-expensive-special"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]'); // Skip handler
    
    // Test fee override
    await page.click('[data-testid="fee-override-tab"]');
    await page.fill('[data-testid="override-amount"]', '50.00');
    await page.fill('[data-testid="override-reason"]', 'Senior discount applied');
    await page.click('[data-testid="apply-override-button"]');
    
    // Verify fee calculation update
    await expect(page.locator('[data-testid="total-fees"]')).toContainText('$50.00');
    await expect(page.locator('[data-testid="override-applied-indicator"]')).toBeVisible();
    
    // Test payment reconciliation
    await page.click('[data-testid="payment-reconciliation-tab"]');
    await expect(page.locator('[data-testid="payment-statistics"]')).toBeVisible();
    await expect(page.locator('[data-testid="fee-overrides-summary"]')).toContainText('$50.00');
  });
});