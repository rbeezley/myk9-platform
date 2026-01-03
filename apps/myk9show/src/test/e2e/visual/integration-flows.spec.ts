import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Integration Flow Visual Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await visualHelper.disableAnimations();
  });

  test.describe('Complete Registration Flow', () => {
    test('full registration workflow visual progression', async ({ page }) => {
      await testSetup.signIn('user');
      await visualHelper.mockRegistrationData();
      
      // Step 1: Initial landing
      await page.goto('/shows/show-123/register');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-01-landing.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Dog selection with dogs loaded
      await expect(page.locator('[data-testid="dog-selection-step"]')).toBeVisible();
      await expect(page).toHaveScreenshot('flow-registration-02-dog-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Dog selected
      await page.click('[data-testid="select-dog-1"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-registration-03-dog-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Move to class selection
      await page.click('[data-testid="next-step-button"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-04-class-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: Class selected
      await page.click('[data-testid="select-class-1"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-registration-05-class-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Move to payment
      await page.click('[data-testid="next-step-button"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-06-payment-options.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 7: Payment method selected
      await page.click('[data-testid="payment-method-check"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-registration-07-payment-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 8: Payment details filled
      await page.fill('[data-testid="check-number"]', '12345');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-registration-08-payment-filled.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 9: Processing payment
      await page.click('[data-testid="submit-payment-button"]');
      await page.waitForSelector('[data-testid="payment-processing"]', { timeout: 3000 });
      await expect(page).toHaveScreenshot('flow-registration-09-processing.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 10: Confirmation
      await page.waitForSelector('[data-testid="registration-confirmation"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-10-confirmation.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('registration flow error handling', async ({ page }) => {
      await testSetup.signIn('user');
      await visualHelper.mockRegistrationData();
      
      await page.goto('/shows/show-123/register');
      await visualHelper.waitForPageLoad();
      
      // Try to proceed without selecting a dog
      await page.click('[data-testid="next-step-button"]');
      await page.waitForSelector('[data-testid="validation-error"]');
      await expect(page).toHaveScreenshot('flow-registration-error-no-dog.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Select dog and proceed
      await page.click('[data-testid="select-dog-1"]');
      await page.click('[data-testid="next-step-button"]');
      await visualHelper.waitForPageLoad();
      
      // Try to proceed without selecting a class
      await page.click('[data-testid="next-step-button"]');
      await page.waitForSelector('[data-testid="validation-error"]');
      await expect(page).toHaveScreenshot('flow-registration-error-no-class.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('registration flow mobile responsive', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await testSetup.signIn('user');
      await visualHelper.mockRegistrationData();
      
      await page.goto('/shows/show-123/register');
      await visualHelper.waitForPageLoad();
      
      // Mobile: Step 1
      await expect(page).toHaveScreenshot('flow-registration-mobile-01-start.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Mobile: Dog selection
      await page.click('[data-testid="select-dog-1"]');
      await page.click('[data-testid="next-step-button"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-mobile-02-classes.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Mobile: Payment
      await page.click('[data-testid="select-class-1"]');
      await page.click('[data-testid="next-step-button"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-registration-mobile-03-payment.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Dog Management Flow', () => {
    test('complete dog creation and management flow', async ({ page }) => {
      await testSetup.signIn('user');
      
      // Step 1: Dogs list (empty)
      await visualHelper.mockEmptyDogList();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-dogs-01-empty-list.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Click add dog
      await page.click('[data-testid="add-dog-button"]');
      await page.waitForSelector('[data-testid="dog-form"]');
      await expect(page).toHaveScreenshot('flow-dogs-02-add-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Fill form partially
      await page.fill('[data-testid="dog-call-name"]', 'Buddy');
      await page.fill('[data-testid="dog-registered-name"]', 'Champion Buddy');
      await expect(page).toHaveScreenshot('flow-dogs-03-form-partial.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Complete form
      await page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
      await page.selectOption('[data-testid="dog-sex"]', 'Male');
      await page.fill('[data-testid="dog-birth-date"]', '2020-01-15');
      await expect(page).toHaveScreenshot('flow-dogs-04-form-complete.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: Save dog
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-dogs-05-save-success.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Return to list with new dog
      await visualHelper.mockDogListData();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-dogs-06-list-with-dog.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 7: View dog details
      await page.click('[data-testid="dog-card-1"]');
      await visualHelper.mockDogDetailsData();
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-dogs-07-dog-details.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 8: Edit dog
      await page.click('[data-testid="edit-dog-button"]');
      await page.waitForSelector('[data-testid="dog-form"]');
      await expect(page).toHaveScreenshot('flow-dogs-08-edit-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 9: Update dog
      await page.fill('[data-testid="dog-call-name"]', 'Buddy Updated');
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-dogs-09-update-success.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog deletion flow', async ({ page }) => {
      await testSetup.signIn('user');
      await visualHelper.mockDogListData();
      
      // Start with dog list
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-delete-01-dog-list.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Open options menu
      await page.click('[data-testid="dog-options-menu-1"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-delete-02-options-menu.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Click delete
      await page.click('[data-testid="delete-dog-option"]');
      await page.waitForSelector('[data-testid="confirmation-dialog"]');
      await expect(page).toHaveScreenshot('flow-delete-03-confirmation.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Confirm deletion
      await page.click('[data-testid="confirm-delete-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-delete-04-deletion-success.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Show Management Flow', () => {
    test('secretary show creation and management flow', async ({ page }) => {
      await testSetup.signIn('secretary');
      
      // Step 1: Empty show list
      await page.route('**/api/shows', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      }));
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-shows-01-empty-list.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Create show form
      await page.click('[data-testid="create-show-button"]');
      await page.waitForSelector('[data-testid="show-creation-form"]');
      await expect(page).toHaveScreenshot('flow-shows-02-creation-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Fill show details
      await page.fill('[data-testid="show-name"]', 'Spring Agility Championship');
      await page.fill('[data-testid="show-location"]', 'Central Park, NY');
      await page.fill('[data-testid="show-start-date"]', '2024-04-15');
      await page.fill('[data-testid="show-end-date"]', '2024-04-16');
      await expect(page).toHaveScreenshot('flow-shows-03-form-filled.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Save show
      await page.click('[data-testid="save-show-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-shows-04-save-success.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: Show details page
      await visualHelper.mockShowDetailsData();
      await page.goto('/shows/show-123');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-shows-05-show-details.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Entry management
      await page.click('[data-testid="manage-entries-button"]');
      await visualHelper.mockEntryManagementData();
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-shows-06-entry-management.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 7: Class creation
      await page.click('[data-testid="create-class-button"]');
      await page.waitForSelector('[data-testid="class-creation-form"]');
      await expect(page).toHaveScreenshot('flow-shows-07-class-creation.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('show entry approval workflow', async ({ page }) => {
      await testSetup.signIn('secretary');
      await visualHelper.mockEntryManagementData();
      
      // Step 1: Entry management with pending entries
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-approval-01-pending-entries.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Select pending entry
      await page.click('[data-testid="entry-row-pending"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-approval-02-entry-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Review entry details
      await page.click('[data-testid="review-entry-button"]');
      await page.waitForSelector('[data-testid="entry-review-modal"]');
      await expect(page).toHaveScreenshot('flow-approval-03-entry-review.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Approve entry
      await page.click('[data-testid="approve-entry-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-approval-04-entry-approved.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Template Management Flow', () => {
    test('admin template creation and usage flow', async ({ page }) => {
      await testSetup.signIn('admin');
      
      // Step 1: Template list
      await visualHelper.mockTemplateListData();
      await page.goto('/admin/templates');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-templates-01-template-list.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Create new template
      await page.click('[data-testid="create-template-button"]');
      await page.waitForSelector('[data-testid="template-creation-form"]');
      await expect(page).toHaveScreenshot('flow-templates-02-creation-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Fill template basic info
      await page.fill('[data-testid="template-name"]', 'New Agility Template');
      await page.selectOption('[data-testid="organization-select"]', 'AKC');
      await page.selectOption('[data-testid="show-type-select"]', 'AGILITY');
      await expect(page).toHaveScreenshot('flow-templates-03-basic-info.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Add fields
      await page.click('[data-testid="add-field-button"]');
      await page.waitForSelector('[data-testid="field-builder"]');
      await expect(page).toHaveScreenshot('flow-templates-04-field-builder.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: Configure field
      await page.fill('[data-testid="field-name"]', 'maxEntries');
      await page.selectOption('[data-testid="field-type"]', 'admin-set');
      await page.fill('[data-testid="field-display-name"]', 'Maximum Entries');
      await expect(page).toHaveScreenshot('flow-templates-05-field-configured.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Save template
      await page.click('[data-testid="save-template-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-templates-06-template-saved.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 7: Template editor
      await visualHelper.mockTemplateEditData();
      await page.goto('/admin/templates/template-123/edit');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-templates-07-template-editor.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('secretary template usage flow', async ({ page }) => {
      await testSetup.signIn('secretary');
      await visualHelper.mockTemplateListData();
      
      // Step 1: Class creation from template
      await page.goto('/secretary/class-creation');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-template-usage-01-class-creation.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Select template
      await page.click('[data-testid="template-card-1"]');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('flow-template-usage-02-template-selected.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Customize template fields
      await page.click('[data-testid="customize-template-button"]');
      await page.waitForSelector('[data-testid="field-override-form"]');
      await expect(page).toHaveScreenshot('flow-template-usage-03-field-customization.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Create class from template
      await page.fill('[data-testid="max-entries-override"]', '25');
      await page.click('[data-testid="create-class-button"]');
      await page.waitForSelector('[data-testid="success-notification"]');
      await expect(page).toHaveScreenshot('flow-template-usage-04-class-created.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Judge Scoring Flow', () => {
    test('judge scoring interface flow', async ({ page }) => {
      await testSetup.signIn('judge');
      
      // Step 1: Judge dashboard
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-scoring-01-judge-dashboard.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Class selection for scoring
      await page.goto('/judge/classes');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-scoring-02-class-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Scoring interface
      await page.click('[data-testid="start-scoring-class-1"]');
      await page.waitForSelector('[data-testid="scoring-interface"]');
      await expect(page).toHaveScreenshot('flow-scoring-03-scoring-interface.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Individual dog scoring
      await page.click('[data-testid="score-dog-1"]');
      await page.waitForSelector('[data-testid="individual-scoring-modal"]');
      await expect(page).toHaveScreenshot('flow-scoring-04-individual-scoring.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: Submit scores
      await page.fill('[data-testid="score-input"]', '85');
      await page.click('[data-testid="submit-score-button"]');
      await page.waitForSelector('[data-testid="score-submitted"]');
      await expect(page).toHaveScreenshot('flow-scoring-05-score-submitted.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Final results
      await page.click('[data-testid="finalize-results-button"]');
      await page.waitForSelector('[data-testid="results-finalized"]');
      await expect(page).toHaveScreenshot('flow-scoring-06-results-finalized.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Search and Discovery Flow', () => {
    test('user show discovery and registration flow', async ({ page }) => {
      await testSetup.signIn('user');
      await visualHelper.mockSearchSuggestions();
      await visualHelper.mockShowListData();
      
      // Step 1: Browse shows
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-discovery-01-browse-shows.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 2: Search for shows
      await page.fill('[data-testid="search-input"]', 'agility');
      await page.waitForSelector('[data-testid="search-suggestions"]');
      await expect(page).toHaveScreenshot('flow-discovery-02-search-suggestions.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 3: Filter results
      await page.click('[data-testid="filter-toggle"]');
      await page.waitForSelector('[data-testid="filter-panel"]');
      await expect(page).toHaveScreenshot('flow-discovery-03-filter-panel.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 4: Apply filters
      await page.check('[data-testid="filter-organization-akc"]');
      await page.check('[data-testid="filter-type-agility"]');
      await page.click('[data-testid="apply-filters-button"]');
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-discovery-04-filtered-results.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 5: View show details
      await page.click('[data-testid="show-card-1"]');
      await visualHelper.mockShowDetailsData();
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-discovery-05-show-details.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      // Step 6: Start registration
      await page.click('[data-testid="register-for-show-button"]');
      await visualHelper.mockRegistrationData();
      await visualHelper.waitForPageLoad();
      await expect(page).toHaveScreenshot('flow-discovery-06-registration-start.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });
});