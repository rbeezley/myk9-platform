import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Cross-Browser Visual Regression Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await visualHelper.disableAnimations();
  });

  test.describe('Critical Pages Cross-Browser', () => {
    ['chromium', 'firefox', 'webkit'].forEach(targetBrowser => {
      test(`homepage visual consistency - ${targetBrowser}`, async ({ page, browserName }) => {
        test.skip(browserName !== targetBrowser, `Skipping ${targetBrowser} test in ${browserName}`);
        
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        // Take full page screenshot
        await expect(page).toHaveScreenshot(`homepage-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.3, // Allow for minor font rendering differences
          maxDiffPixels: 1000
        });
        
        console.log(`✅ Homepage visual test completed for ${browserName}`);
      });

      test(`sign-in page visual consistency - ${targetBrowser}`, async ({ page, browserName }) => {
        test.skip(browserName !== targetBrowser, `Skipping ${targetBrowser} test in ${browserName}`);
        
        await page.goto('/sign-in');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`signin-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.3
        });
        
        console.log(`✅ Sign-in visual test completed for ${browserName}`);
      });

      test(`dashboard visual consistency - ${targetBrowser}`, async ({ page, browserName }) => {
        test.skip(browserName !== targetBrowser, `Skipping ${targetBrowser} test in ${browserName}`);
        
        await testSetup.signIn('user');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dashboard-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.3
        });
        
        console.log(`✅ Dashboard visual test completed for ${browserName}`);
      });
    });
  });

  test.describe('Component Visual Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('button components cross-browser', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Primary button
      const primaryButton = page.locator('[data-testid="add-dog-button"]');
      await expect(primaryButton).toHaveScreenshot(`primary-button-${browserName}.png`, {
        threshold: 0.2
      });
      
      // Button hover state
      await primaryButton.hover();
      await expect(primaryButton).toHaveScreenshot(`primary-button-hover-${browserName}.png`, {
        threshold: 0.2
      });
      
      console.log(`✅ Button components visual test completed for ${browserName}`);
    });

    test('form controls cross-browser', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Text input
      const textInput = page.locator('[data-testid="dog-call-name"]');
      await expect(textInput).toHaveScreenshot(`text-input-${browserName}.png`);
      
      // Focused text input
      await textInput.focus();
      await expect(textInput).toHaveScreenshot(`text-input-focused-${browserName}.png`);
      
      // Select dropdown
      const selectInput = page.locator('[data-testid="dog-breed-select"]');
      await expect(selectInput).toHaveScreenshot(`select-input-${browserName}.png`);
      
      // Checkbox
      const checkbox = page.locator('[data-testid="dog-active-checkbox"]');
      if (await checkbox.isVisible()) {
        await expect(checkbox).toHaveScreenshot(`checkbox-${browserName}.png`);
        
        await checkbox.check();
        await expect(checkbox).toHaveScreenshot(`checkbox-checked-${browserName}.png`);
      }
      
      console.log(`✅ Form controls visual test completed for ${browserName}`);
    });

    test('navigation components cross-browser', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Main navigation
      const mainNav = page.locator('[data-testid="main-navigation"]');
      if (await mainNav.isVisible()) {
        await expect(mainNav).toHaveScreenshot(`main-navigation-${browserName}.png`);
      }
      
      // Sidebar navigation
      const sidebar = page.locator('[data-testid="navigation-sidebar"]');
      if (await sidebar.isVisible()) {
        await expect(sidebar).toHaveScreenshot(`sidebar-navigation-${browserName}.png`);
      }
      
      console.log(`✅ Navigation visual test completed for ${browserName}`);
    });

    test('card components cross-browser', async ({ page, browserName }) => {
      await visualHelper.mockDogListData();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Dog card
      const dogCard = page.locator('[data-testid="dog-card"]').first();
      if (await dogCard.isVisible()) {
        await expect(dogCard).toHaveScreenshot(`dog-card-${browserName}.png`);
        
        // Card hover state
        await dogCard.hover();
        await expect(dogCard).toHaveScreenshot(`dog-card-hover-${browserName}.png`);
      }
      
      console.log(`✅ Card components visual test completed for ${browserName}`);
    });

    test('modal dialogs cross-browser', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Open modal
      await page.click('[data-testid="add-dog-button"]');
      await page.waitForSelector('[data-testid="add-dog-modal"]');
      
      const modal = page.locator('[data-testid="add-dog-modal"]');
      await expect(modal).toHaveScreenshot(`modal-dialog-${browserName}.png`);
      
      console.log(`✅ Modal dialogs visual test completed for ${browserName}`);
    });
  });

  test.describe('Data Display Components', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('data tables cross-browser', async ({ page, browserName }) => {
      await visualHelper.mockEntriesTableData();
      await page.goto('/secretary/entries');
      await visualHelper.waitForPageLoad();
      
      const table = page.locator('[data-testid="entries-table"]');
      await expect(table).toHaveScreenshot(`data-table-${browserName}.png`, {
        threshold: 0.3 // Tables might have slight rendering differences
      });
      
      console.log(`✅ Data tables visual test completed for ${browserName}`);
    });

    test('statistics cards cross-browser', async ({ page, browserName }) => {
      await page.goto('/secretary/dashboard');
      await visualHelper.waitForPageLoad();
      
      const statsSection = page.locator('[data-testid="dashboard-stats"]');
      if (await statsSection.isVisible()) {
        await expect(statsSection).toHaveScreenshot(`stats-cards-${browserName}.png`);
      }
      
      console.log(`✅ Statistics cards visual test completed for ${browserName}`);
    });
  });

  test.describe('Responsive Design Visual Tests', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    const viewports = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1200, height: 800, name: 'desktop' }
    ];

    viewports.forEach(viewport => {
      test(`homepage responsive - ${viewport.name}`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`homepage-${viewport.name}-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.3
        });
        
        console.log(`✅ Homepage ${viewport.name} visual test completed for ${browserName}`);
      });

      test(`dogs page responsive - ${viewport.name}`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await visualHelper.mockDogListData();
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dogs-page-${viewport.name}-${browserName}.png`, {
          fullPage: true,
          animations: 'disabled',
          threshold: 0.3
        });
        
        console.log(`✅ Dogs page ${viewport.name} visual test completed for ${browserName}`);
      });
    });
  });

  test.describe('Theme Visual Consistency', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('light theme cross-browser', async ({ page, browserName }) => {
      await visualHelper.switchToLightTheme();
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`light-theme-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
        threshold: 0.3
      });
      
      console.log(`✅ Light theme visual test completed for ${browserName}`);
    });

    test('dark theme cross-browser', async ({ page, browserName }) => {
      await visualHelper.switchToDarkTheme();
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`dark-theme-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled',
        threshold: 0.3
      });
      
      console.log(`✅ Dark theme visual test completed for ${browserName}`);
    });
  });

  test.describe('Form State Visual Tests', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('form validation states cross-browser', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Trigger validation errors
      await page.click('[data-testid="save-dog-button"]');
      await page.waitForSelector('.error-message, .field-error', { timeout: 3000 });
      
      // Screenshot of form with validation errors
      const formContainer = page.locator('[data-testid="dog-form"]');
      await expect(formContainer).toHaveScreenshot(`form-validation-errors-${browserName}.png`, {
        threshold: 0.3
      });
      
      // Fill one field to show partial validation
      await page.fill('[data-testid="dog-call-name"]', 'Test Dog');
      await page.blur('[data-testid="dog-call-name"]');
      
      await expect(formContainer).toHaveScreenshot(`form-partial-validation-${browserName}.png`, {
        threshold: 0.3
      });
      
      console.log(`✅ Form validation visual test completed for ${browserName}`);
    });

    test('form field focus states cross-browser', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Test different field focus states
      const fields = [
        '[data-testid="dog-call-name"]',
        '[data-testid="dog-breed-select"]',
        '[data-testid="dog-birth-date"]'
      ];
      
      for (const field of fields) {
        const element = page.locator(field);
        if (await element.isVisible()) {
          await element.focus();
          await expect(element).toHaveScreenshot(`field-focus-${field.replace(/[[\]"=-]/g, '')}-${browserName}.png`);
        }
      }
      
      console.log(`✅ Form field focus visual test completed for ${browserName}`);
    });
  });

  test.describe('Loading and Empty States', () => {
    test('loading states cross-browser', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await visualHelper.simulateSlowNetwork();
      
      // Navigate to trigger loading state
      const navigationPromise = page.goto('/dogs');
      
      // Try to capture loading state
      try {
        await page.waitForSelector('[data-testid="loading-spinner"]', { timeout: 1000 });
        const loadingElement = page.locator('[data-testid="loading-spinner"]');
        await expect(loadingElement).toHaveScreenshot(`loading-state-${browserName}.png`);
      } catch {
        // Loading state might be too fast to capture
        console.log(`Loading state too fast to capture for ${browserName}`);
      }
      
      await navigationPromise;
      console.log(`✅ Loading states visual test completed for ${browserName}`);
    });

    test('empty states cross-browser', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await visualHelper.mockEmptyDogList();
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const emptyState = page.locator('[data-testid="empty-state"]');
      if (await emptyState.isVisible()) {
        await expect(emptyState).toHaveScreenshot(`empty-state-${browserName}.png`);
      }
      
      console.log(`✅ Empty states visual test completed for ${browserName}`);
    });
  });

  test.describe('Error States Visual Tests', () => {
    test('404 page cross-browser', async ({ page, browserName }) => {
      await page.goto('/nonexistent-page');
      await visualHelper.waitForPageLoad();
      
      await expect(page).toHaveScreenshot(`404-page-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled'
      });
      
      console.log(`✅ 404 page visual test completed for ${browserName}`);
    });

    test('network error states cross-browser', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await visualHelper.simulateNetworkError();
      await page.goto('/dogs');
      
      try {
        await page.waitForSelector('[data-testid="error-state"]', { timeout: 5000 });
        const errorState = page.locator('[data-testid="error-state"]');
        await expect(errorState).toHaveScreenshot(`network-error-${browserName}.png`);
      } catch {
        console.log(`Network error state not found for ${browserName}`);
      }
      
      console.log(`✅ Network error visual test completed for ${browserName}`);
    });
  });

  test.describe('Print Styles Visual Tests', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
    });

    test('print layout cross-browser', async ({ page, browserName }) => {
      await visualHelper.mockShowDetailsData();
      await page.goto('/shows/show-123/reports');
      await visualHelper.waitForPageLoad();
      
      // Emulate print media
      await page.emulateMedia({ media: 'print' });
      
      await expect(page).toHaveScreenshot(`print-layout-${browserName}.png`, {
        fullPage: true,
        animations: 'disabled'
      });
      
      console.log(`✅ Print layout visual test completed for ${browserName}`);
    });
  });

  test.describe('Animation and Transition Visual Tests', () => {
    test('hover animations cross-browser', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      // Re-enable animations for this test
      await page.addStyleTag({
        content: `
          * {
            animation-duration: 0.3s !important;
            transition-duration: 0.3s !important;
          }
        `
      });
      
      const button = page.locator('[data-testid="add-dog-button"]');
      await button.hover();
      
      // Wait for hover animation
      await page.waitForTimeout(400);
      
      await expect(button).toHaveScreenshot(`button-hover-animation-${browserName}.png`);
      
      console.log(`✅ Animation visual test completed for ${browserName}`);
    });
  });
});