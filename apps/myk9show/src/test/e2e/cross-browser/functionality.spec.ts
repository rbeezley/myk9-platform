import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Cross-Browser Functionality Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Authentication Workflows', () => {
    test('sign in functionality across browsers', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      await visualHelper.waitForPageLoad();
      
      // Verify sign-in form is present
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();
      await expect(page.locator('input[placeholder*="Email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      
      // Test form submission
      await page.fill('input[placeholder*="Email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("Sign")');
      
      // Verify authentication attempt (should show error for test credentials)
      await expect(page.locator('text=Invalid login credentials')).toBeVisible();
      
      console.log(`✅ ${browserName}: Authentication workflow completed`);
    });

    test('sign out functionality', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Verify user is signed in
      await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
      
      // Sign out
      await page.click('[data-testid="user-menu-trigger"]');
      await page.click('[data-testid="sign-out-button"]');
      
      // Verify sign out
      await expect(page).toHaveURL('/sign-in');
      await expect(page.locator('[data-testid="sign-in-form"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Sign out workflow completed`);
    });
  });

  test.describe('Dog Management Workflows', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('create dog workflow', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Start dog creation
      await page.click('[data-testid="add-dog-button"]');
      await expect(page.locator('[data-testid="add-dog-modal"]')).toBeVisible();
      
      // Fill dog form
      await visualHelper.fillDogForm();
      
      // Submit form
      await page.click('[data-testid="save-dog-button"]');
      
      // Verify success (mocked response)
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="add-dog-modal"]')).not.toBeVisible();
      
      console.log(`✅ ${browserName}: Dog creation workflow completed`);
    });

    test('edit dog workflow', async ({ page, browserName }) => {
      await visualHelper.mockDogListData();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Open edit dialog
      await page.click('[data-testid="dog-options-menu"]');
      await page.click('[data-testid="edit-dog-option"]');
      await expect(page.locator('[data-testid="edit-dog-modal"]')).toBeVisible();
      
      // Modify dog data
      await page.fill('[data-testid="dog-call-name"]', 'Updated Dog Name');
      await page.click('[data-testid="save-dog-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Dog edit workflow completed`);
    });

    test('delete dog workflow', async ({ page, browserName }) => {
      await visualHelper.mockDogListData();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Open delete confirmation
      await page.click('[data-testid="dog-options-menu"]');
      await page.click('[data-testid="delete-dog-option"]');
      await expect(page.locator('[data-testid="confirmation-dialog"]')).toBeVisible();
      
      // Confirm deletion
      await page.click('[data-testid="confirm-delete-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Dog deletion workflow completed`);
    });
  });

  test.describe('Show Management Workflows', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('show creation workflow', async ({ page, browserName }) => {
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      // Start show creation
      await page.click('[data-testid="add-show-button"]');
      await expect(page.locator('[data-testid="add-show-modal"]')).toBeVisible();
      
      // Fill show form
      await page.fill('[data-testid="show-name"]', 'Test Championship Show');
      await page.fill('[data-testid="show-location"]', 'Test Arena, TX');
      await page.fill('[data-testid="show-start-date"]', '2024-06-15');
      await page.fill('[data-testid="show-end-date"]', '2024-06-16');
      await page.selectOption('[data-testid="show-organization"]', 'AKC');
      
      // Submit form
      await page.click('[data-testid="save-show-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Show creation workflow completed`);
    });

    test('entry management workflow', async ({ page, browserName }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      // Verify entries table is loaded
      await expect(page.locator('[data-testid="entries-table"]')).toBeVisible();
      await expect(page.locator('tbody tr')).toHaveCount(3);
      
      // Test entry status update
      await page.click('[data-testid="entry-status-dropdown"]');
      await page.click('[data-testid="status-confirmed"]');
      
      // Verify status update
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Entry management workflow completed`);
    });
  });

  test.describe('Template System Workflows', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('admin');
    });

    test('template creation workflow', async ({ page, browserName }) => {
      await page.goto('/admin/template-management');
      await visualHelper.waitForPageLoad();
      
      // Start template creation
      await page.click('[data-testid="create-template-button"]');
      await expect(page.locator('[data-testid="template-form"]')).toBeVisible();
      
      // Fill template form
      await page.fill('[data-testid="template-name"]', 'Test Template');
      await page.selectOption('[data-testid="template-organization"]', 'AKC');
      await page.selectOption('[data-testid="template-show-type"]', 'AGILITY');
      await page.fill('[data-testid="template-description"]', 'Test template description');
      
      // Submit form
      await page.click('[data-testid="save-template-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Template creation workflow completed`);
    });

    test('class creation from template', async ({ page, browserName }) => {
      await visualHelper.mockTemplateListData();
      await page.goto('/secretary/class-creation');
      await visualHelper.waitForPageLoad();
      
      // Select template
      await page.click('[data-testid="template-card"]');
      await expect(page.locator('[data-testid="class-form"]')).toBeVisible();
      
      // Customize class details
      await page.fill('[data-testid="class-name"]', 'Novice Standard Class');
      await page.fill('[data-testid="class-max-entries"]', '30');
      await page.fill('[data-testid="class-entry-fee"]', '35.00');
      
      // Create class
      await page.click('[data-testid="create-class-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Class creation workflow completed`);
    });
  });

  test.describe('Registration Workflows', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
      await visualHelper.mockRegistrationData();
    });

    test('complete registration workflow', async ({ page, browserName }) => {
      await page.goto('/shows/show-123/register');
      await visualHelper.waitForPageLoad();
      
      // Step 1: Dog selection
      await expect(page.locator('[data-testid="dog-selection-step"]')).toBeVisible();
      await page.click('[data-testid="select-dog-1"]');
      await page.click('[data-testid="next-step-button"]');
      
      // Step 2: Class selection
      await expect(page.locator('[data-testid="class-selection-step"]')).toBeVisible();
      await page.click('[data-testid="select-class-1"]');
      await page.click('[data-testid="next-step-button"]');
      
      // Step 3: Review and payment
      await expect(page.locator('[data-testid="review-step"]')).toBeVisible();
      await page.click('[data-testid="payment-method-check"]');
      await page.fill('[data-testid="check-number"]', '12345');
      await page.click('[data-testid="submit-registration-button"]');
      
      // Verify completion
      await expect(page.locator('[data-testid="registration-success"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Complete registration workflow completed`);
    });
  });

  test.describe('Search and Filter Functionality', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('search functionality', async ({ page, browserName }) => {
      await visualHelper.mockDogListData();
      await visualHelper.mockSearchSuggestions();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Test search functionality
      await page.fill('[data-testid="search-input"]', 'Buddy');
      await page.keyboard.press('Enter');
      
      // Verify search results
      await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Search functionality completed`);
    });

    test('filter functionality', async ({ page, browserName }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      // Open filter panel
      await page.click('[data-testid="filter-button"]');
      await expect(page.locator('[data-testid="filter-panel"]')).toBeVisible();
      
      // Apply filters
      await page.selectOption('[data-testid="organization-filter"]', 'AKC');
      await page.selectOption('[data-testid="status-filter"]', 'upcoming');
      await page.click('[data-testid="apply-filters-button"]');
      
      // Verify filtered results
      await expect(page.locator('[data-testid="filtered-results"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Filter functionality completed`);
    });
  });

  test.describe('Form Validation', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('client-side validation', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Submit empty form to trigger validation
      await page.click('[data-testid="save-dog-button"]');
      
      // Verify validation errors
      await expect(page.locator('.error-message, .field-error')).toHaveCount.greaterThan(0);
      
      // Test field-specific validation
      await page.fill('[data-testid="dog-call-name"]', 'A'); // Too short
      await page.blur('[data-testid="dog-call-name"]');
      await expect(page.locator('[data-testid="call-name-error"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Client-side validation completed`);
    });

    test('real-time validation feedback', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Test real-time validation on email field (if present)
      const emailField = page.locator('[data-testid="owner-email"]');
      if (await emailField.isVisible()) {
        await emailField.fill('invalid-email');
        await emailField.blur();
        await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
        
        await emailField.fill('valid@example.com');
        await emailField.blur();
        await expect(page.locator('[data-testid="email-error"]')).not.toBeVisible();
      }
      
      console.log(`✅ ${browserName}: Real-time validation completed`);
    });
  });

  test.describe('Responsive Design Functionality', () => {
    test('mobile navigation functionality', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Test mobile navigation
      await page.click('[data-testid="mobile-menu-trigger"]');
      await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();
      
      // Navigate to dogs page via mobile menu
      await page.click('[data-testid="mobile-nav-dogs"]');
      await expect(page).toHaveURL('/dogs');
      
      console.log(`✅ ${browserName}: Mobile navigation completed`);
    });

    test('tablet layout functionality', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      // Verify tablet-specific layout
      await expect(page.locator('[data-testid="tablet-layout"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Tablet layout completed`);
    });
  });

  test.describe('Accessibility Features', () => {
    test('keyboard navigation', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); // Should activate focused element
      
      // Verify keyboard accessibility
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
      
      console.log(`✅ ${browserName}: Keyboard navigation completed`);
    });

    test('screen reader compatibility', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Check for ARIA labels and roles
      const ariaLabels = await page.locator('[aria-label]').count();
      const ariaRoles = await page.locator('[role]').count();
      
      expect(ariaLabels).toBeGreaterThan(0);
      expect(ariaRoles).toBeGreaterThan(0);
      
      console.log(`✅ ${browserName}: Screen reader compatibility verified`);
    });
  });

  test.describe('Error Handling', () => {
    test('network error handling', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      
      // Simulate network error
      await visualHelper.simulateNetworkError();
      await page.goto('/dogs');
      
      // Verify error handling
      await expect(page.locator('[data-testid="error-state"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: Network error handling completed`);
    });

    test('404 page handling', async ({ page, browserName }) => {
      await page.goto('/nonexistent-page');
      await visualHelper.waitForPageLoad();
      
      // Verify 404 page
      await expect(page.locator('[data-testid="404-page"]')).toBeVisible();
      await expect(page.locator('[data-testid="home-link"]')).toBeVisible();
      
      console.log(`✅ ${browserName}: 404 handling completed`);
    });
  });
});