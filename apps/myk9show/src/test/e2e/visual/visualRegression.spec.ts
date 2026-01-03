import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Visual Regression Tests', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Homepage Visual Tests', () => {
    test('should match homepage layout for exhibitor', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      
      // Wait for data to load
      await expect(page.locator('[data-testid="upcoming-shows"]')).toBeVisible();
      
      // Take full page screenshot
      await expect(page).toHaveScreenshot('homepage-exhibitor.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match homepage layout for secretary', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/');
      
      await expect(page.locator('[data-testid="secretary-dashboard"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('homepage-secretary.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match homepage layout for judge', async ({ page }) => {
      await testSetup.signIn('judge');
      await page.goto('/');
      
      await expect(page.locator('[data-testid="judge-dashboard"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('homepage-judge.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Registration Workflow Visual Tests', () => {
    test('should match dog selection step layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/show-123/register');
      
      await expect(page.locator('[data-testid="dog-selection-step"]')).toBeVisible();
      await expect(page.locator('[data-testid="dog-card"]')).toHaveCount(3);
      
      await expect(page).toHaveScreenshot('registration-dog-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match class selection step layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/show-123/register');
      
      // Complete dog selection
      await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
      await page.click('[data-testid="next-step-button"]');
      
      await expect(page.locator('[data-testid="class-selection-step"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('registration-class-selection.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match payment step layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/show-123/register');
      
      // Complete previous steps
      await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
      await page.click('[data-testid="next-step-button"]');
      await page.click('[data-testid="class-option-novice-standard"]');
      await page.click('[data-testid="next-step-button"]');
      
      await expect(page.locator('[data-testid="payment-step"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('registration-payment-step.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match confirmation step layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/show-123/register');
      
      // Complete full workflow
      await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
      await page.click('[data-testid="next-step-button"]');
      await page.click('[data-testid="class-option-novice-standard"]');
      await page.click('[data-testid="next-step-button"]');
      await page.click('[data-testid="payment-method-check"]');
      await page.fill('[data-testid="check-number-input"]', '1001');
      await page.click('[data-testid="next-step-button"]');
      
      await expect(page.locator('[data-testid="confirmation-step"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('registration-confirmation.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Show Management Visual Tests', () => {
    test('should match show details page layout', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/shows/show-123');
      
      await expect(page.locator('[data-testid="show-details-header"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('show-details-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match show list page layout', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/shows');
      
      await expect(page.locator('[data-testid="show-list"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('show-list-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match class creation page layout', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/class-creation');
      
      await expect(page.locator('[data-testid="class-creation-page"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('class-creation-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Scoring Interface Visual Tests', () => {
    test('should match judge scoring interface', async ({ page }) => {
      await testSetup.signIn('judge');
      await page.goto('/judge/class-123/scoring');
      
      await page.click('[data-testid="start-scoring-button"]');
      await expect(page.locator('[data-testid="scoring-interface"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('judge-scoring-interface.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match individual scoring dialog', async ({ page }) => {
      await testSetup.signIn('judge');
      await page.goto('/judge/class-123/scoring');
      
      await page.click('[data-testid="start-scoring-button"]');
      await page.click('[data-testid="entry-card-1"] [data-testid="score-dog-button"]');
      
      await expect(page.locator('[data-testid="individual-scoring-dialog"]')).toBeVisible();
      
      await expect(page.locator('[data-testid="individual-scoring-dialog"]')).toHaveScreenshot('individual-scoring-dialog.png');
    });
  });

  test.describe('Form Visual Tests', () => {
    test('should match dog profile form layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs/add');
      
      await expect(page.locator('[data-testid="dog-profile-form"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('dog-profile-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match show creation form layout', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/shows/create');
      
      await expect(page.locator('[data-testid="show-creation-form"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('show-creation-form.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Component Visual Tests', () => {
    test('should match navigation sidebar', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      
      await expect(page.locator('[data-testid="navigation-sidebar"]')).toBeVisible();
      
      await expect(page.locator('[data-testid="navigation-sidebar"]')).toHaveScreenshot('navigation-sidebar.png');
    });

    test('should match data table layout', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/entries');
      
      await expect(page.locator('[data-testid="entries-table"]')).toBeVisible();
      
      await expect(page.locator('[data-testid="entries-table"]')).toHaveScreenshot('entries-data-table.png');
    });

    test('should match modal dialogs', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs');
      
      await page.click('[data-testid="add-dog-button"]');
      await expect(page.locator('[data-testid="add-dog-dialog"]')).toBeVisible();
      
      await expect(page.locator('[data-testid="add-dog-dialog"]')).toHaveScreenshot('add-dog-modal.png');
    });
  });

  test.describe('Responsive Layout Tests', () => {
    test('should match mobile homepage layout', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await testSetup.signIn('user');
      await page.goto('/');
      
      await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('homepage-mobile.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match tablet registration layout', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad
      await testSetup.signIn('user');
      await page.goto('/shows/show-123/register');
      
      await expect(page.locator('[data-testid="registration-workflow"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('registration-tablet.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match desktop show management layout', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
      await testSetup.signIn('secretary');
      await page.goto('/shows/show-123');
      
      await expect(page.locator('[data-testid="show-management-desktop"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('show-management-desktop.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Theme Tests', () => {
    test('should match dark theme layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      
      // Switch to dark theme
      await page.click('[data-testid="theme-toggle"]');
      await expect(page.locator('html[data-theme="dark"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('homepage-dark-theme.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match light theme layout', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      
      // Ensure light theme
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'light');
      });
      
      await expect(page).toHaveScreenshot('homepage-light-theme.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Print Layout Tests', () => {
    test('should match print layout for show summary', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/shows/show-123/reports');
      
      // Switch to print media
      await page.emulateMedia({ media: 'print' });
      
      await expect(page.locator('[data-testid="show-summary-report"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('show-summary-print.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match print layout for entry confirmations', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/my-entries/entry-123/confirmation');
      
      await page.emulateMedia({ media: 'print' });
      
      await expect(page).toHaveScreenshot('entry-confirmation-print.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Error State Visual Tests', () => {
    test('should match 404 error page layout', async ({ page }) => {
      await page.goto('/nonexistent-page');
      
      await expect(page.locator('[data-testid="404-error-page"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('404-error-page.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match network error state', async ({ page }) => {
      await page.route('**/api/**', route => route.abort());
      await testSetup.signIn('user');
      await page.goto('/shows');
      
      await expect(page.locator('[data-testid="network-error-state"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('network-error-state.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('should match empty state layouts', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/dogs');
      
      // Mock empty response
      await page.route('**/api/dogs', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      }));
      
      await page.reload();
      await expect(page.locator('[data-testid="empty-dogs-state"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('empty-dogs-state.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });

  test.describe('Loading State Visual Tests', () => {
    test('should match loading spinner layouts', async ({ page }) => {
      await page.route('**/api/shows', route => {
        // Delay response to capture loading state
        setTimeout(() => route.continue(), 2000);
      });
      
      await testSetup.signIn('user');
      const navigationPromise = page.goto('/shows');
      
      // Capture loading state
      await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('loading-state.png', {
        animations: 'disabled',
      });
      
      await navigationPromise;
    });

    test('should match skeleton loader layouts', async ({ page }) => {
      await page.route('**/api/dogs', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      await testSetup.signIn('user');
      const navigationPromise = page.goto('/dogs');
      
      await expect(page.locator('[data-testid="skeleton-loader"]')).toBeVisible();
      
      await expect(page).toHaveScreenshot('skeleton-loader.png', {
        animations: 'disabled',
      });
      
      await navigationPromise;
    });
  });
});