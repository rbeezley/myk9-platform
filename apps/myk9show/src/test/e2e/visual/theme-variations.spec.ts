import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

test.describe('Theme Variation Visual Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  const themes = ['light', 'dark'];
  const userRoles = ['user', 'secretary', 'judge', 'admin'];

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await visualHelper.disableAnimations();
  });

  test.describe('Dashboard Theme Variations', () => {
    themes.forEach(theme => {
      userRoles.forEach(role => {
        test(`${role} dashboard - ${theme} theme`, async ({ page }) => {
          if (theme === 'dark') {
            await visualHelper.switchToDarkTheme();
          } else {
            await visualHelper.switchToLightTheme();
          }
          
          await testSetup.signIn(role as 'user' | 'secretary' | 'judge' | 'admin');
          await page.goto('/');
          await visualHelper.waitForPageLoad();
          
          await expect(page).toHaveScreenshot(`dashboard-${role}-${theme}.png`, {
            fullPage: true,
            animations: 'disabled',
          });
        });
      });
    });
  });

  test.describe('Form Theme Variations', () => {
    themes.forEach(theme => {
      test(`dog registration form - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`dog-form-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`form with data - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        await visualHelper.fillDogForm();
        
        await expect(page).toHaveScreenshot(`dog-form-filled-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`form validation errors - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        
        // Trigger validation errors
        await page.click('[data-testid="save-dog-button"]');
        await page.waitForSelector('.error-message, .field-error', { timeout: 3000 });
        
        await expect(page).toHaveScreenshot(`form-validation-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`show creation form - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('secretary');
        await page.goto('/secretary/create-show');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`show-form-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Data Display Theme Variations', () => {
    themes.forEach(theme => {
      test(`data table - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('secretary');
        await visualHelper.mockEntriesTableData();
        await page.goto('/secretary/entries');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`data-table-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`card grid layout - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockShowListData();
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`card-grid-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`list view - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockDogListData();
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`list-view-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`details page - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockDogDetailsData();
        await page.goto('/dogs/dog-123');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`details-page-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('Navigation Theme Variations', () => {
    themes.forEach(theme => {
      test(`navigation sidebar - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        const sidebar = page.locator('[data-testid="navigation-sidebar"]');
        await expect(sidebar).toHaveScreenshot(`navigation-${theme}.png`);
      });

      test(`breadcrumb navigation - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/shows/show-123/details');
        await visualHelper.waitForPageLoad();
        
        const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
        await expect(breadcrumbs).toHaveScreenshot(`breadcrumbs-${theme}.png`);
      });

      test(`tab navigation - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockDogDetailsData();
        await page.goto('/dogs/dog-123');
        await visualHelper.waitForPageLoad();
        
        const tabs = page.locator('[data-testid="tab-navigation"]');
        await expect(tabs).toHaveScreenshot(`tabs-${theme}.png`);
      });

      test(`mobile navigation - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await page.setViewportSize({ width: 375, height: 667 });
        await testSetup.signIn('user');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        // Open mobile menu
        await page.click('[data-testid="mobile-menu-toggle"]');
        await page.waitForTimeout(300);
        
        const mobileNav = page.locator('[data-testid="mobile-navigation"]');
        await expect(mobileNav).toHaveScreenshot(`mobile-nav-${theme}.png`);
      });
    });
  });

  test.describe('Modal and Dialog Theme Variations', () => {
    themes.forEach(theme => {
      test(`modal dialog - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="add-dog-button"]');
        await page.waitForSelector('[data-testid="add-dog-modal"]');
        
        const modal = page.locator('[data-testid="add-dog-modal"]');
        await expect(modal).toHaveScreenshot(`modal-${theme}.png`);
      });

      test(`confirmation dialog - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="dog-options-menu"]');
        await page.click('[data-testid="delete-dog-option"]');
        await page.waitForSelector('[data-testid="confirmation-dialog"]');
        
        const dialog = page.locator('[data-testid="confirmation-dialog"]');
        await expect(dialog).toHaveScreenshot(`confirmation-${theme}.png`);
      });

      test(`settings modal - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="user-menu"]');
        await page.click('[data-testid="settings-option"]');
        await page.waitForSelector('[data-testid="settings-modal"]');
        
        const modal = page.locator('[data-testid="settings-modal"]');
        await expect(modal).toHaveScreenshot(`settings-modal-${theme}.png`);
      });
    });
  });

  test.describe('Interactive Element Theme Variations', () => {
    themes.forEach(theme => {
      test(`button states - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        const buttonContainer = page.locator('[data-testid="action-buttons"]');
        await expect(buttonContainer).toHaveScreenshot(`buttons-${theme}.png`);
      });

      test(`button hover - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        const button = page.locator('[data-testid="add-dog-button"]');
        await button.hover();
        
        await expect(button).toHaveScreenshot(`button-hover-${theme}.png`);
      });

      test(`form field focus - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        
        const input = page.locator('[data-testid="dog-call-name"]');
        await input.focus();
        
        await expect(input).toHaveScreenshot(`input-focus-${theme}.png`);
      });

      test(`dropdown open - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="dog-breed-select"]');
        await page.waitForSelector('[data-testid="breed-options"]');
        
        const dropdown = page.locator('[data-testid="breed-select-container"]');
        await expect(dropdown).toHaveScreenshot(`dropdown-${theme}.png`);
      });
    });
  });

  test.describe('Search and Filter Theme Variations', () => {
    themes.forEach(theme => {
      test(`search interface - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockSearchSuggestions();
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        const searchContainer = page.locator('[data-testid="search-container"]');
        await expect(searchContainer).toHaveScreenshot(`search-${theme}.png`);
      });

      test(`search with suggestions - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockSearchSuggestions();
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        await page.fill('[data-testid="search-input"]', 'agil');
        await page.waitForSelector('[data-testid="search-suggestions"]');
        
        const searchContainer = page.locator('[data-testid="search-container"]');
        await expect(searchContainer).toHaveScreenshot(`search-suggestions-${theme}.png`);
      });

      test(`filter panel - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/shows');
        await visualHelper.waitForPageLoad();
        
        await page.click('[data-testid="filter-toggle"]');
        await page.waitForSelector('[data-testid="filter-panel"]');
        
        const filterPanel = page.locator('[data-testid="filter-panel"]');
        await expect(filterPanel).toHaveScreenshot(`filter-panel-${theme}.png`);
      });
    });
  });

  test.describe('Registration Workflow Theme Variations', () => {
    themes.forEach(theme => {
      test(`registration step 1 - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockRegistrationData();
        await page.goto('/shows/show-123/register');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`registration-step1-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`registration step 2 - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockRegistrationData();
        await page.goto('/shows/show-123/register');
        await visualHelper.completeRegistrationStep1();
        
        await expect(page).toHaveScreenshot(`registration-step2-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`registration step 3 - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockRegistrationData();
        await page.goto('/shows/show-123/register');
        await visualHelper.completeRegistrationStep1();
        await visualHelper.completeRegistrationStep2();
        
        await expect(page).toHaveScreenshot(`registration-step3-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`registration confirmation - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockRegistrationData();
        await page.goto('/shows/show-123/register');
        await visualHelper.completeFullRegistration();
        
        await expect(page).toHaveScreenshot(`registration-confirmation-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });

  test.describe('State and Notification Theme Variations', () => {
    themes.forEach(theme => {
      test(`loading state - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.simulateSlowNetwork();
        
        const navigationPromise = page.goto('/dogs');
        await page.waitForSelector('[data-testid="skeleton-loader"]');
        
        await expect(page).toHaveScreenshot(`loading-state-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
        
        await navigationPromise;
      });

      test(`empty state - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.mockEmptyDogList();
        await page.goto('/dogs');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`empty-state-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`error state - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await visualHelper.simulateNetworkError();
        await page.goto('/dogs');
        await page.waitForSelector('[data-testid="error-state"]', { timeout: 10000 });
        
        await expect(page).toHaveScreenshot(`error-state-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`success notification - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('user');
        await page.goto('/dogs/add');
        await visualHelper.fillDogForm();
        await page.click('[data-testid="save-dog-button"]');
        
        await page.waitForSelector('[data-testid="success-notification"]');
        
        const notification = page.locator('[data-testid="success-notification"]');
        await expect(notification).toHaveScreenshot(`success-notification-${theme}.png`);
      });
    });
  });

  test.describe('Template Management Theme Variations', () => {
    themes.forEach(theme => {
      test(`template list - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('admin');
        await visualHelper.mockTemplateListData();
        await page.goto('/admin/templates');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`template-list-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test(`template editor - ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
          await visualHelper.switchToDarkTheme();
        } else {
          await visualHelper.switchToLightTheme();
        }
        
        await testSetup.signIn('admin');
        await visualHelper.mockTemplateEditData();
        await page.goto('/admin/templates/template-123/edit');
        await visualHelper.waitForPageLoad();
        
        await expect(page).toHaveScreenshot(`template-editor-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    });
  });
});