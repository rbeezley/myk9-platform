import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Cross-Browser Visual Consistency Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await visualHelper.disableAnimations();
  });

  test.describe('Core Page Layouts', () => {
    ['user', 'secretary', 'judge', 'admin'].forEach(role => {
      test(`${role} dashboard consistency`, async ({ page, browserName }) => {
        await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dashboard-${role}-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });

    test('homepage consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`homepage-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('sign-in page consistency', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`signin-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Form Rendering Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('dog registration form consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`dog-form-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('form field types consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Fill different field types to test rendering
      await page.fill('[data-testid="dog-call-name"]', 'Test Dog');
      await page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
      await page.fill('[data-testid="dog-birth-date"]', '2020-01-15');
      await page.check('[data-testid="dog-active-checkbox"]');
      
      await expect(page).toHaveScreenshot(`form-fields-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('form validation consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Trigger validation errors
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('.error-message, .field-error', { timeout: 3000 });
      
      await expect(page).toHaveScreenshot(`form-validation-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Component Rendering Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('button styles consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const buttonContainer = page.locator('[data-testid="action-buttons"]');
      await expect(buttonContainer).toHaveScreenshot(`buttons-${browserName}.png`);
    });

    test('button hover states consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const addButton = page.locator('[data-testid="add-dog-button"]');
      await addButton.hover();
      
      await expect(addButton).toHaveScreenshot(`button-hover-${browserName}.png`);
    });

    test('card component consistency', async ({ page, browserName }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const firstCard = page.locator('[data-testid="show-card"]').first();
      await expect(firstCard).toHaveScreenshot(`card-component-${browserName}.png`);
    });

    test('navigation sidebar consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const sidebar = page.locator('[data-testid="navigation-sidebar"]');
      await expect(sidebar).toHaveScreenshot(`navigation-sidebar-${browserName}.png`);
    });

    test('data table consistency', async ({ page, browserName }) => {
      await testSetup.signIn('secretary');
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      const table = page.locator('[data-testid="entries-table"]');
      await expect(table).toHaveScreenshot(`data-table-${browserName}.png`);
    });
  });

  test.describe('Modal and Dialog Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('modal dialog consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="add-dog-button"]');
      await page.waitForSelector('[data-testid="add-dog-modal"]');
      
      const modal = page.locator('[data-testid="add-dog-modal"]');
      await expect(modal).toHaveScreenshot(`modal-dialog-${browserName}.png`);
    });

    test('confirmation dialog consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="dog-options-menu"]');
      await page.click('[data-testid="delete-dog-option"]');
      await page.waitForSelector('[data-testid="confirmation-dialog"]');
      
      const dialog = page.locator('[data-testid="confirmation-dialog"]');
      await expect(dialog).toHaveScreenshot(`confirmation-dialog-${browserName}.png`);
    });

    test('dropdown menu consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      await page.click('[data-testid="dog-breed-select"]');
      await page.waitForSelector('[data-testid="breed-options"]');
      
      const dropdown = page.locator('[data-testid="breed-select-container"]');
      await expect(dropdown).toHaveScreenshot(`dropdown-menu-${browserName}.png`);
    });
  });

  test.describe('Typography and Font Rendering', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('heading typography consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const headingContainer = page.locator('[data-testid="page-headings"]');
      await expect(headingContainer).toHaveScreenshot(`headings-${browserName}.png`);
    });

    test('body text consistency', async ({ page, browserName }) => {
      await visualHelper.mockDogDetailsData();
      await page.goto('/dogs/dog-123');
      await visualHelper.waitForPageLoad();
      
      const textContainer = page.locator('[data-testid="dog-details-text"]');
      await expect(textContainer).toHaveScreenshot(`body-text-${browserName}.png`);
    });

    test('form label consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const labelsContainer = page.locator('[data-testid="form-labels"]');
      await expect(labelsContainer).toHaveScreenshot(`form-labels-${browserName}.png`);
    });
  });

  test.describe('CSS Grid and Flexbox Layouts', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('grid layout consistency', async ({ page, browserName }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const gridContainer = page.locator('[data-testid="show-cards-grid"]');
      await expect(gridContainer).toHaveScreenshot(`grid-layout-${browserName}.png`);
    });

    test('flexbox layout consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const flexContainer = page.locator('[data-testid="flex-layout"]');
      await expect(flexContainer).toHaveScreenshot(`flex-layout-${browserName}.png`);
    });

    test('responsive grid consistency', async ({ page, browserName }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const gridContainer = page.locator('[data-testid="show-cards-grid"]');
      await expect(gridContainer).toHaveScreenshot(`responsive-grid-${browserName}.png`);
    });
  });

  test.describe('Form Controls and Inputs', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('text input consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const textInput = page.locator('[data-testid="dog-call-name"]');
      await textInput.focus();
      
      await expect(textInput).toHaveScreenshot(`text-input-${browserName}.png`);
    });

    test('select dropdown consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const selectInput = page.locator('[data-testid="dog-breed-select"]');
      await expect(selectInput).toHaveScreenshot(`select-input-${browserName}.png`);
    });

    test('checkbox consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const checkbox = page.locator('[data-testid="dog-active-checkbox"]');
      await expect(checkbox).toHaveScreenshot(`checkbox-${browserName}.png`);
    });

    test('radio button consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const radioGroup = page.locator('[data-testid="dog-sex-radio-group"]');
      await expect(radioGroup).toHaveScreenshot(`radio-buttons-${browserName}.png`);
    });

    test('date input consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const dateInput = page.locator('[data-testid="dog-birth-date"]');
      await expect(dateInput).toHaveScreenshot(`date-input-${browserName}.png`);
    });
  });

  test.describe('Border and Shadow Rendering', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('card shadows consistency', async ({ page, browserName }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const card = page.locator('[data-testid="show-card"]').first();
      await expect(card).toHaveScreenshot(`card-shadows-${browserName}.png`);
    });

    test('border radius consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const roundedElements = page.locator('.rounded, .rounded-lg, .rounded-xl');
      await expect(roundedElements.first()).toHaveScreenshot(`border-radius-${browserName}.png`);
    });

    test('focus ring consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const input = page.locator('[data-testid="dog-call-name"]');
      await input.focus();
      
      await expect(input).toHaveScreenshot(`focus-ring-${browserName}.png`);
    });
  });

  test.describe('Color and Theme Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('light theme consistency', async ({ page, browserName }) => {
      await visualHelper.switchToLightTheme();
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`light-theme-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('dark theme consistency', async ({ page, browserName }) => {
      await visualHelper.switchToDarkTheme();
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`dark-theme-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('primary color consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const primaryElements = page.locator('.bg-primary, .text-primary, .border-primary');
      await expect(primaryElements.first()).toHaveScreenshot(`primary-colors-${browserName}.png`);
    });

    test('semantic color consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Trigger validation to show error colors
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('.error-message, .field-error', { timeout: 3000 });
      
      const errorElements = page.locator('.text-red-500, .border-red-500, .bg-red-50');
      await expect(errorElements.first()).toHaveScreenshot(`semantic-colors-${browserName}.png`);
    });
  });

  test.describe('Interactive Element States', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('button active state consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const button = page.locator('[data-testid="add-dog-button"]');
      await button.click({ force: true });
      
      await expect(button).toHaveScreenshot(`button-active-${browserName}.png`);
    });

    test('link hover state consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const link = page.locator('a').first();
      await link.hover();
      
      await expect(link).toHaveScreenshot(`link-hover-${browserName}.png`);
    });

    test('disabled element consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Disable the save button via JavaScript
      await page.evaluate(() => {
        const button = document.querySelector('[data-testid="save-dog-button"]') as HTMLButtonElement;
        if (button) button.disabled = true;
      });
      
      const disabledButton = page.locator('[data-testid="save-dog-button"]');
      await expect(disabledButton).toHaveScreenshot(`disabled-element-${browserName}.png`);
    });
  });

  test.describe('Print Styles Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('print layout consistency', async ({ page, browserName }) => {
      await visualHelper.mockShowDetailsData();
      await page.goto('/shows/show-123/reports');
      await visualHelper.waitForPageLoad();
      
      await page.emulateMedia({ media: 'print' });
      
      await expect(page).toHaveScreenshot(`print-layout-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Error State Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('404 page consistency', async ({ page, browserName }) => {
      await page.goto('/nonexistent-page');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`404-page-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('network error consistency', async ({ page, browserName }) => {
      await visualHelper.simulateNetworkError();
      await page.goto('/shows');
      await page.waitForSelector('[data-testid="error-state"]', { timeout: 10000 });
      
      await expect(page).toHaveScreenshot(`network-error-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });
});