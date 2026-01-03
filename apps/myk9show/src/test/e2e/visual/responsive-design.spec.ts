import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Responsive Design Visual Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  const viewports = [
    { name: 'mobile-small', width: 320, height: 568 }, // iPhone SE
    { name: 'mobile-medium', width: 375, height: 667 }, // iPhone 8
    { name: 'mobile-large', width: 414, height: 896 }, // iPhone 11 Pro Max
    { name: 'tablet-portrait', width: 768, height: 1024 }, // iPad Portrait
    { name: 'tablet-landscape', width: 1024, height: 768 }, // iPad Landscape
    { name: 'desktop-small', width: 1280, height: 720 }, // Small Desktop
    { name: 'desktop-medium', width: 1440, height: 900 }, // Medium Desktop
    { name: 'desktop-large', width: 1920, height: 1080 }, // Large Desktop
  ];

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await visualHelper.disableAnimations();
  });

  test.describe('Dashboard Responsive Layout', () => {
    ['user', 'secretary', 'judge', 'admin'].forEach(role => {
      viewports.forEach(viewport => {
        test(`${role} dashboard - ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
          await page.goto('/');
          await visualHelper.waitForPageLoad();
          
          await expect(page).toHaveScreenshot(`dashboard-${role}-${viewport.name}.png`, {
            fullPage: true,
            animations: 'disabled',
          });
        });
      });
    });
  });

  test.describe('Navigation Responsive Behavior', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    viewports.forEach(viewport => {
      test(`navigation layout - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        // Test navigation in different states
        const sidebar = page.locator('[data-testid="navigation-sidebar"]');
        
        if (viewport.width < 768) {
          // Mobile: navigation should be hidden by default
          await expect(sidebar).toHaveScreenshot(`navigation-mobile-${viewport.name}.png`);
          
          // Test mobile menu toggle
          await page.click('[data-testid="mobile-menu-toggle"]');
          await page.waitForTimeout(300);
          await expect(sidebar).toHaveScreenshot(`navigation-mobile-open-${viewport.name}.png`);
        } else {
          // Desktop/Tablet: navigation should be visible
          await expect(sidebar).toHaveScreenshot(`navigation-desktop-${viewport.name}.png`);
        }
      });
    });
  });

  test.describe('Form Responsive Layout', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    viewports.forEach(viewport => {
      test(`dog form layout - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dog-form-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`dog form filled - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        await visualHelper.fillDogForm();
        
        await expect(page).toHaveScreenshot(`dog-form-filled-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Registration Workflow Responsive', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
      await visualHelper.mockRegistrationData();
    });

    viewports.forEach(viewport => {
      test(`registration step 1 - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows/show-123/register');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`registration-step1-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`registration step 2 - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows/show-123/register');
        await visualHelper.completeRegistrationStep1();
        
        await expect(page).toHaveScreenshot(`registration-step2-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`registration step 3 - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows/show-123/register');
        await visualHelper.completeRegistrationStep1();
        await visualHelper.completeRegistrationStep2();
        
        await expect(page).toHaveScreenshot(`registration-step3-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Data Table Responsive Layout', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
      await visualHelper.mockEntriesTableData();
    });

    viewports.forEach(viewport => {
      test(`entries table - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/secretary/entries');
        await visualHelper.waitForPageLoad();
        
        const tableContainer = page.locator('[data-testid="entries-table-container"]');
        
        if (viewport.width < 768) {
          // Mobile: table should stack or have horizontal scroll
          await expect(tableContainer).toHaveScreenshot(`entries-table-mobile-${viewport.name}.png`);
        } else {
          // Desktop/Tablet: full table layout
          await expect(tableContainer).toHaveScreenshot(`entries-table-desktop-${viewport.name}.png`);
        }
      });
    });
  });

  test.describe('Show List Responsive Layout', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
      await visualHelper.mockShowListData();
    });

    viewports.forEach(viewport => {
      test(`show list - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`show-list-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Modal Responsive Behavior', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    viewports.forEach(viewport => {
      test(`add dog modal - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="add-dog-button"]');
        await page.waitForSelector('[data-testid="add-dog-modal"]');
        
        const modal = page.locator('[data-testid="add-dog-modal"]');
        await expect(modal).toHaveScreenshot(`add-dog-modal-${viewport.name}.png`);
      });

      test(`confirmation dialog - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        // Trigger delete confirmation
        await page.click('[data-testid="dog-options-menu"]');
        await page.click('[data-testid="delete-dog-option"]');
        await page.waitForSelector('[data-testid="confirmation-dialog"]');
        
        const dialog = page.locator('[data-testid="confirmation-dialog"]');
        await expect(dialog).toHaveScreenshot(`confirmation-dialog-${viewport.name}.png`);
      });
    });
  });

  test.describe('Search and Filter Responsive', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
      await visualHelper.mockSearchSuggestions();
    });

    viewports.forEach(viewport => {
      test(`search interface - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        const searchContainer = page.locator('[data-testid="search-container"]');
        await expect(searchContainer).toHaveScreenshot(`search-interface-${viewport.name}.png`);
      });

      test(`search with suggestions - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        await page.fill('[data-testid="search-input"]', 'agil');
        await page.waitForSelector('[data-testid="search-suggestions"]');
        
        const searchContainer = page.locator('[data-testid="search-container"]');
        await expect(searchContainer).toHaveScreenshot(`search-suggestions-${viewport.name}.png`);
      });

      test(`filter panel - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        if (viewport.width < 768) {
          // Mobile: filter should be in a modal or slide-out panel
          await page.click('[data-testid="mobile-filter-toggle"]');
          await page.waitForSelector('[data-testid="mobile-filter-panel"]');
          
          const filterPanel = page.locator('[data-testid="mobile-filter-panel"]');
          await expect(filterPanel).toHaveScreenshot(`filter-panel-mobile-${viewport.name}.png`);
        } else {
          // Desktop: filter panel should be inline
          await page.click('[data-testid="filter-toggle"]');
          await page.waitForSelector('[data-testid="filter-panel"]');
          
          const filterPanel = page.locator('[data-testid="filter-panel"]');
          await expect(filterPanel).toHaveScreenshot(`filter-panel-desktop-${viewport.name}.png`);
        }
      });
    });
  });

  test.describe('Typography and Spacing Responsive', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    viewports.forEach(viewport => {
      test(`typography scaling - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        // Focus on typography elements
        const typographyElements = page.locator('.typography-sample, h1, h2, h3, .text-lg, .text-xl');
        await expect(typographyElements.first()).toHaveScreenshot(`typography-${viewport.name}.png`);
      });

      test(`button sizing - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        const buttonContainer = page.locator('[data-testid="action-buttons"]');
        await expect(buttonContainer).toHaveScreenshot(`buttons-${viewport.name}.png`);
      });
    });
  });

  test.describe('Card Layout Responsive', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
      await visualHelper.mockShowListData();
    });

    viewports.forEach(viewport => {
      test(`card grid layout - ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        const cardGrid = page.locator('[data-testid="show-cards-grid"]');
        await expect(cardGrid).toHaveScreenshot(`card-grid-${viewport.name}.png`);
      });
    });
  });

  test.describe('Content Overflow and Scrolling', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('secretary');
      await visualHelper.mockEntriesTableData();
    });

    ['mobile-small', 'tablet-portrait', 'desktop-medium'].forEach(viewport => {
      const vp = viewports.find(v => v.name === viewport)!;
      
      test(`horizontal scroll behavior - ${viewport}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/secretary/entries');
        await visualHelper.waitForPageLoad();
        
        // Test horizontal scrolling on tables
        const tableContainer = page.locator('[data-testid="entries-table-container"]');
        
        // Scroll to the right to show overflow behavior
        await page.evaluate(() => {
          const container = document.querySelector('[data-testid="entries-table-container"]');
          if (container) {
            container.scrollLeft = container.scrollWidth / 2;
          }
        });
        
        await expect(tableContainer).toHaveScreenshot(`table-scroll-${viewport}.png`);
      });
    });
  });

  test.describe('Touch Interface Elements', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    ['mobile-small', 'mobile-medium', 'tablet-portrait'].forEach(viewport => {
      const vp = viewports.find(v => v.name === viewport)!;
      
      test(`touch targets - ${viewport}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        // Focus on touch-friendly elements
        // const touchElements = page.locator('[data-testid="touch-target"], button, .clickable');
        await expect(page).toHaveScreenshot(`touch-targets-${viewport}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });
});