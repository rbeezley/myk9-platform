import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Comprehensive Visual Regression Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Dashboard Pages - Cross Role', () => {
    ['user', 'secretary', 'judge', 'admin'].forEach(role => {
      test(`${role} dashboard - desktop view`, async ({ page }) => {
        await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dashboard-${role}-desktop.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`${role} dashboard - mobile view`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dashboard-${role}-mobile.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`${role} dashboard - tablet view`, async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dashboard-${role}-tablet.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Dog Management Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('dog profile form - empty state', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('dog-form-empty.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog profile form - filled state', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Fill out the form
      await page.fill('[data-testid="dog-call-name"]', 'Buddy');
      await page.fill('[data-testid="dog-registered-name"]', 'Champion Buddy of Excellence');
      await page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
      await page.selectOption('[data-testid="dog-sex"]', 'Male');
      await page.fill('[data-testid="dog-birth-date"]', '2020-01-15');
      
      await expect(page).toHaveScreenshot('dog-form-filled.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog profile form - validation errors', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Try to submit empty form to trigger validation
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('.error-message, .field-error', { timeout: 3000 });
      
      await expect(page).toHaveScreenshot('dog-form-validation-errors.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog list view - with data', async ({ page }) => {
      await visualHelper.mockDogListData();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('dog-list-with-data.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog list view - empty state', async ({ page }) => {
      await visualHelper.mockEmptyDogList();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('dog-list-empty.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dog details page', async ({ page }) => {
      await visualHelper.mockDogDetailsData();
      await page.goto('/dogs/dog-123');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('dog-details-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Show Management Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('show creation form', async ({ page }) => {
      await page.goto('/secretary/create-show');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('show-creation-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('show list page - with data', async ({ page }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('show-list-with-data.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('show details page', async ({ page }) => {
      await visualHelper.mockShowDetailsData();
      await page.goto('/shows/show-123');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('show-details-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('entry management interface', async ({ page }) => {
      await visualHelper.mockEntryManagementData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('entry-management-interface.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Registration Workflow Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('registration step 1 - dog selection', async ({ page }) => {
      await visualHelper.mockRegistrationData();
      await page.goto('/shows/show-123/register');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('registration-step1-dog-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('registration step 2 - class selection', async ({ page }) => {
      await visualHelper.mockRegistrationData();
      await page.goto('/shows/show-123/register');
      await visualHelper.completeRegistrationStep1();
      
      await expect(page).toHaveScreenshot('registration-step2-class-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('registration step 3 - payment', async ({ page }) => {
      await visualHelper.mockRegistrationData();
      await page.goto('/shows/show-123/register');
      await visualHelper.completeRegistrationStep1();
      await visualHelper.completeRegistrationStep2();
      
      await expect(page).toHaveScreenshot('registration-step3-payment.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('registration confirmation', async ({ page }) => {
      await visualHelper.mockRegistrationData();
      await page.goto('/shows/show-123/register');
      await visualHelper.completeFullRegistration();
      
      await expect(page).toHaveScreenshot('registration-confirmation.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Template Management Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('admin');
    });

    test('template list page', async ({ page }) => {
      await visualHelper.mockTemplateListData();
      await page.goto('/admin/templates');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('template-list-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('template creation form', async ({ page }) => {
      await page.goto('/admin/templates/create');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('template-creation-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('template editor interface', async ({ page }) => {
      await visualHelper.mockTemplateEditData();
      await page.goto('/admin/templates/template-123/edit');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('template-editor-interface.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Search and Filter Interfaces', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('search bar - empty state', async ({ page }) => {
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const searchBar = page.locator('[data-testid="search-bar"]');
      await expect(searchBar).toBeVisible();
      
      await expect(searchBar).toHaveScreenshot('search-bar-empty.png');
    });

    test('search bar - with suggestions', async ({ page }) => {
      await visualHelper.mockSearchSuggestions();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      await page.fill('[data-testid="search-input"]', 'agil');
      await page.waitForSelector('[data-testid="search-suggestions"]');
      
      const searchContainer = page.locator('[data-testid="search-container"]');
      await expect(searchContainer).toHaveScreenshot('search-bar-with-suggestions.png');
    });

    test('filter panel - collapsed', async ({ page }) => {
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const filterToggle = page.locator('[data-testid="filter-toggle"]');
      await expect(filterToggle).toBeVisible();
      
      await expect(filterToggle).toHaveScreenshot('filter-panel-collapsed.png');
    });

    test('filter panel - expanded', async ({ page }) => {
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="filter-toggle"]');
      await page.waitForSelector('[data-testid="filter-panel"]');
      
      const filterPanel = page.locator('[data-testid="filter-panel"]');
      await expect(filterPanel).toHaveScreenshot('filter-panel-expanded.png');
    });
  });

  test.describe('Data Table Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('entries table - standard view', async ({ page }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      const entriesTable = page.locator('[data-testid="entries-table"]');
      await expect(entriesTable).toHaveScreenshot('entries-table-standard.png');
    });

    test('entries table - with sorting', async ({ page }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      // Click sort on entry number column
      await page.click('[data-testid="sort-entry-number"]');
      await page.waitForTimeout(500); // Wait for sort animation
      
      const entriesTable = page.locator('[data-testid="entries-table"]');
      await expect(entriesTable).toHaveScreenshot('entries-table-sorted.png');
    });

    test('entries table - with selection', async ({ page }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      // Select multiple entries
      await page.check('[data-testid="entry-checkbox-1"]');
      await page.check('[data-testid="entry-checkbox-3"]');
      await page.waitForTimeout(300);
      
      const entriesTable = page.locator('[data-testid="entries-table"]');
      await expect(entriesTable).toHaveScreenshot('entries-table-with-selection.png');
    });

    test('bulk action bar', async ({ page }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      // Select entries to show bulk action bar
      await page.check('[data-testid="entry-checkbox-1"]');
      await page.check('[data-testid="entry-checkbox-2"]');
      await page.waitForSelector('[data-testid="bulk-action-bar"]');
      
      const bulkActionBar = page.locator('[data-testid="bulk-action-bar"]');
      await expect(bulkActionBar).toHaveScreenshot('bulk-action-bar.png');
    });
  });

  test.describe('Navigation Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('main navigation - collapsed', async ({ page }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Ensure navigation is collapsed
      await page.click('[data-testid="collapse-sidebar"]');
      await page.waitForTimeout(300);
      
      const sidebar = page.locator('[data-testid="navigation-sidebar"]');
      await expect(sidebar).toHaveScreenshot('navigation-collapsed.png');
    });

    test('main navigation - expanded', async ({ page }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Ensure navigation is expanded
      await page.click('[data-testid="expand-sidebar"]');
      await page.waitForTimeout(300);
      
      const sidebar = page.locator('[data-testid="navigation-sidebar"]');
      await expect(sidebar).toHaveScreenshot('navigation-expanded.png');
    });

    test('breadcrumb navigation', async ({ page }) => {
      await page.goto('/shows/show-123/details');
      await visualHelper.waitForPageLoad();
      
      const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
      await expect(breadcrumbs).toHaveScreenshot('breadcrumb-navigation.png');
    });

    test('tab navigation', async ({ page }) => {
      await page.goto('/dogs/dog-123');
      await visualHelper.waitForPageLoad();
      
      const tabNavigation = page.locator('[data-testid="tab-navigation"]');
      await expect(tabNavigation).toHaveScreenshot('tab-navigation.png');
    });
  });

  test.describe('Modal and Dialog Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('confirmation dialog', async ({ page }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Trigger delete confirmation
      await page.click('[data-testid="dog-options-menu"]');
      await page.click('[data-testid="delete-dog-option"]');
      await page.waitForSelector('[data-testid="confirmation-dialog"]');
      
      const dialog = page.locator('[data-testid="confirmation-dialog"]');
      await expect(dialog).toHaveScreenshot('confirmation-dialog.png');
    });

    test('add dog modal', async ({ page }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="add-dog-button"]');
      await page.waitForSelector('[data-testid="add-dog-modal"]');
      
      const modal = page.locator('[data-testid="add-dog-modal"]');
      await expect(modal).toHaveScreenshot('add-dog-modal.png');
    });

    test('settings modal', async ({ page }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="settings-option"]');
      await page.waitForSelector('[data-testid="settings-modal"]');
      
      const modal = page.locator('[data-testid="settings-modal"]');
      await expect(modal).toHaveScreenshot('settings-modal.png');
    });
  });

  test.describe('State Variations', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('loading states', async ({ page }) => {
      // Mock slow API response to capture loading state
      await page.route('**/api/dogs', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      const navigationPromise = page.goto('/dogs');
      
      // Capture loading state
      await page.waitForSelector('[data-testid="loading-skeleton"]');
      await expect(page).toHaveScreenshot('loading-state-skeleton.png', {
        fullPage: true,
        animations: 'disabled',
      });
      
      await navigationPromise;
    });

    test('error states', async ({ page }) => {
      // Mock API error
      await page.route('**/api/dogs', route => route.abort());
      
      await page.goto('/dogs');
      await page.waitForSelector('[data-testid="error-state"]');
      
      await expect(page).toHaveScreenshot('error-state-network.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('empty states', async ({ page }) => {
      await visualHelper.mockEmptyDogList();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot('empty-state-dogs.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('success notification', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.fillDogForm();
      await page.click('[data-testid="save-dog-button"]');
      
      await page.waitForSelector('[data-testid="success-notification"]');
      
      const notification = page.locator('[data-testid="success-notification"]');
      await expect(notification).toHaveScreenshot('success-notification.png');
    });
  });

  test.describe('Interactive States', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('button hover states', async ({ page }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const addButton = page.locator('[data-testid="add-dog-button"]');
      await addButton.hover();
      
      await expect(addButton).toHaveScreenshot('button-hover-state.png');
    });

    test('form field focus states', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const nameField = page.locator('[data-testid="dog-call-name"]');
      await nameField.focus();
      
      await expect(nameField).toHaveScreenshot('input-focus-state.png');
    });

    test('dropdown open state', async ({ page }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="dog-breed-select"]');
      await page.waitForSelector('[data-testid="breed-options"]');
      
      const dropdown = page.locator('[data-testid="breed-select-container"]');
      await expect(dropdown).toHaveScreenshot('dropdown-open-state.png');
    });

    test('accordion expanded state', async ({ page }) => {
      await page.goto('/dogs/dog-123');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="health-records-accordion"]');
      await page.waitForSelector('[data-testid="health-records-content"]');
      
      const accordion = page.locator('[data-testid="health-records-accordion"]');
      await expect(accordion).toHaveScreenshot('accordion-expanded-state.png');
    });
  });
});