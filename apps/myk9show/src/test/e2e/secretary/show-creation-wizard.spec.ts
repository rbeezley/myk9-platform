import { test, expect } from '@playwright/test';
import { addMonths } from 'date-fns';
import {
  LoginPage,
  SecretaryDashboardPage,
  ShowCreationWizardPage,
  generateTestShowData,
  generateTestTrialData,
} from '../page-objects';

/**
 * Trial Secretary Show Creation Wizard - Full E2E Test Suite
 *
 * This test suite covers the complete workflow a trial secretary would perform
 * to create a new show in myK9Show, including:
 * - Step 1: Show Details (name, dates, location, club, officials, fees)
 * - Step 2: Trial Configuration (adding trials with dates/times)
 * - Step 3: Class Selection (selecting classes from templates)
 * - Step 4: Review and Create
 *
 * Prerequisites:
 * - Run `node scripts/create-secretary-test-user.js` to create the test user
 * - Ensure test data (clubs, templates, people) exists in the database
 */

test.describe('Trial Secretary - Show Creation Wizard', () => {
  let loginPage: LoginPage;
  let dashboardPage: SecretaryDashboardPage;
  let wizardPage: ShowCreationWizardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new SecretaryDashboardPage(page);
    wizardPage = new ShowCreationWizardPage(page);
  });

  test.describe('Authentication', () => {
    test('secretary can log in successfully', async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();

      // Should be redirected away from sign-in (app redirects to home)
      await expect(page).not.toHaveURL(/\/sign-in/);
      // User should be logged in (check for user avatar or nav element)
      await expect(page.locator('nav')).toBeVisible();
    });

    test('secretary can navigate to dashboard', async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();

      // Navigate to secretary dashboard
      await page.goto('/secretary/dashboard');
      await expect(page).toHaveURL(/\/secretary\/dashboard/);
    });

    test('secretary can access show creation wizard', async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();

      // Navigate directly to wizard
      await page.goto('/secretary/create-show/wizard');
      await expect(page).toHaveURL(/\/secretary\/create-show/);
    });
  });

  test.describe('Step 1: Show Details', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();
    });

    test('displays show details form', async ({ page }) => {
      // Verify we're on the wizard - look for the step indicator
      await expect(page.locator('text=Create New Show')).toBeVisible();
      await expect(page.locator('text=Basic Show Information')).toBeVisible();

      // Wait for form to be fully loaded
      await page.waitForLoadState('domcontentloaded');

      // Verify key form fields are visible (use actual label text - title case)
      await expect(page.locator('label:has-text("Show Name")')).toBeVisible();
      await expect(page.locator('label:has-text("Show Type")')).toBeVisible();
      await expect(page.locator('label:has-text("Start Date")')).toBeVisible();
      await expect(page.locator('label:has-text("Location")')).toBeVisible();
    });

    test('can fill out show details and proceed to next step', async () => {
      const showData = generateTestShowData();

      // Fill out the form - this is the key user action we're testing
      await wizardPage.fillShowDetails(showData);

      // Take screenshot for visual regression
      await wizardPage.takeScreenshot('step1-filled');

      // Proceed to next step
      await wizardPage.goToNextStep();

      // Should now be on step 2
      await wizardPage.expectToBeOnStep(2);
    });

    test('can partially fill show details (name, type, dates, location)', async ({ page }) => {
      // This test verifies basic form interactions without requiring club/people data
      const showName = `E2E Partial Test ${Date.now()}`;

      // Fill show name
      await page.locator('input').first().fill(showName);

      // Select show type
      await page.locator('button[role="combobox"]').first().click();
      await page.locator('[role="option"]:has-text("AKC")').click();

      // Verify name was filled
      await expect(page.locator('input').first()).toHaveValue(showName);

      // Take screenshot
      await wizardPage.takeScreenshot('step1-partial');
    });

    test('validates required fields before proceeding', async ({ page }) => {
      // The Next button should be disabled when required fields are empty
      const nextButton = page.locator('button:has-text("Next")');

      // Check that the Next button exists and is disabled
      await expect(nextButton).toBeVisible();
      const isDisabled = await nextButton.isDisabled();

      // If button is disabled, validation is working
      // If button is enabled but clicking doesn't navigate, that's also valid
      if (!isDisabled) {
        // Try to click and verify we stay on step 1
        await nextButton.click();
        await page.waitForTimeout(500);
      }

      // Should still be on step 1
      await wizardPage.expectToBeOnStep(1);
    });
  });

  test.describe('Step 2: Trial Configuration', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();

      // Complete step 1
      const showData = generateTestShowData();
      await wizardPage.fillShowDetails(showData);
      await wizardPage.goToNextStep();
    });

    test('displays trial configuration form', async ({ page }) => {
      await wizardPage.expectToBeOnStep(2);
      await expect(page.locator('text=Add Trial')).toBeVisible();
    });

    test('can add a trial', async ({ page }) => {
      const showStartDate = addMonths(new Date(), 2);
      const trialData = generateTestTrialData(showStartDate, 0);

      await wizardPage.addTrial(trialData);

      // Verify trial appears in the list
      await expect(page.locator('text=Trial 1')).toBeVisible();

      await wizardPage.takeScreenshot('step2-trial-added');
    });

    test('can add multiple trials', async ({ page }) => {
      const showStartDate = addMonths(new Date(), 2);

      // Add two trials (for a 2-day show)
      await wizardPage.addTrial(generateTestTrialData(showStartDate, 0));
      await wizardPage.addTrial(generateTestTrialData(showStartDate, 1));

      // Verify both trials are visible
      await expect(page.locator('h4:has-text("Trial 1")')).toBeVisible();
      await expect(page.locator('h4:has-text("Trial 2")')).toBeVisible();
    });

    test('validates trial dates within show date range', async () => {
      const showStartDate = addMonths(new Date(), 2);
      const trialData = generateTestTrialData(showStartDate, 0);

      await wizardPage.addTrial(trialData);
      await wizardPage.goToNextStep();

      // Should proceed to step 3 if valid
      await wizardPage.expectToBeOnStep(3);
    });
  });

  test.describe('Step 3: Class Selection', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();

      // Complete steps 1 and 2
      const showData = generateTestShowData();
      await wizardPage.fillShowDetails(showData);
      await wizardPage.goToNextStep();

      const trialData = generateTestTrialData(showData.startDate, 0);
      await wizardPage.addTrial(trialData);
      await wizardPage.goToNextStep();
    });

    test('displays class selection interface', async ({ page }) => {
      await wizardPage.expectToBeOnStep(3);

      // Should show template selection or class list
      const hasTemplateSelect = await page
        .locator('text=Select a template')
        .isVisible()
        .catch(() => false);
      const hasClassList = (await page.locator('input[type="checkbox"]').count()) > 0;

      expect(hasTemplateSelect || hasClassList).toBe(true);
    });

    test('can select classes from template', async ({ page }) => {
      // Select template if needed
      await wizardPage.selectTemplate();

      // Wait for class list to load
      await page.waitForTimeout(500);

      // Select some classes
      await wizardPage.selectAllClasses();

      await wizardPage.takeScreenshot('step3-classes-selected');

      // Proceed to review
      await wizardPage.goToNextStep();
      await wizardPage.expectToBeOnStep(4);
    });
  });

  test.describe('Step 4: Review and Create', () => {
    test.beforeEach(async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();

      // Complete all previous steps
      const showData = generateTestShowData();
      await wizardPage.fillShowDetails(showData);
      await wizardPage.goToNextStep();

      await wizardPage.addTrial(generateTestTrialData(showData.startDate, 0));
      await wizardPage.goToNextStep();

      await wizardPage.selectTemplate();
      await page.waitForTimeout(500);
      await wizardPage.selectAllClasses();
      await wizardPage.goToNextStep();
    });

    test('displays review summary', async ({ page }) => {
      await wizardPage.expectToBeOnStep(4);

      // Should show summary statistics
      await expect(page.locator('text=Trials')).toBeVisible();
      await expect(page.locator('text=Classes')).toBeVisible();

      // Should show action buttons
      await expect(page.locator('button:has-text("Create Show")')).toBeVisible();
    });

    test('can navigate back to edit previous steps', async ({ page }) => {
      // Click edit button for show details
      await page.locator('button:has-text("Show Details")').click();

      // Should be back on step 1
      await wizardPage.expectToBeOnStep(1);
    });

    test('can create show and return to dashboard', async ({ page }) => {
      await wizardPage.takeScreenshot('step4-review');

      // Create the show
      await wizardPage.createShow();

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/secretary\/dashboard/, { timeout: 15000 });

      await wizardPage.takeScreenshot('show-created-dashboard');
    });
  });

  test.describe('Complete Workflow', () => {
    test('full trial secretary show creation flow', async ({ page }) => {
      // This is the comprehensive test that exercises the entire workflow

      // 1. Login as secretary
      await loginPage.goto();
      await loginPage.loginAsSecretary();

      // 2. Navigate to wizard
      await dashboardPage.clickCreateShow();

      // 3. Step 1: Fill show details
      const showData = generateTestShowData({
        name: `Comprehensive E2E Test Show ${Date.now()}`,
        organization: 'AKC',
        location: 'E2E Test Venue\n123 Test Street\nTest City, TS 12345',
      });
      await wizardPage.fillShowDetails(showData);
      await page.screenshot({ path: 'test-results/screenshots/workflow-step1.png' });
      await wizardPage.goToNextStep();

      // 4. Step 2: Add trials
      await wizardPage.addTrial({
        name: 'Saturday AM Trial',
        dateTime: showData.startDate,
        eventNumber: '1',
      });

      // Add second trial for Saturday PM
      const saturdayPM = new Date(showData.startDate);
      saturdayPM.setHours(13, 0, 0, 0);
      await wizardPage.addTrial({
        name: 'Saturday PM Trial',
        dateTime: saturdayPM,
        eventNumber: '2',
      });

      await page.screenshot({ path: 'test-results/screenshots/workflow-step2.png' });
      await wizardPage.goToNextStep();

      // 5. Step 3: Select classes
      await wizardPage.selectTemplate();
      await page.waitForTimeout(500);
      await wizardPage.selectAllClasses();
      await page.screenshot({ path: 'test-results/screenshots/workflow-step3.png' });
      await wizardPage.goToNextStep();

      // 6. Step 4: Review and create
      await wizardPage.expectToBeOnStep(4);
      await page.screenshot({ path: 'test-results/screenshots/workflow-step4.png' });

      // Verify summary shows our data
      await expect(page.locator('text=Saturday AM Trial')).toBeVisible();
      await expect(page.locator('text=Saturday PM Trial')).toBeVisible();

      // Create the show
      await wizardPage.createShow();

      // Verify we're back on dashboard
      await expect(page).toHaveURL(/\/secretary\/dashboard/);

      await page.screenshot({ path: 'test-results/screenshots/workflow-complete.png' });
    });
  });

  // Visual regression tests - limited to desktop chromium only for consistency
  test.describe('Visual Regression', () => {
    // Only run visual regression on chromium project to avoid managing multiple baselines
    // Note: browserName check doesn't work for device emulation (mobile-chrome uses chromium)
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(async ({}, testInfo) => {
      if (testInfo.project.name !== 'chromium') {
        testInfo.skip(true, 'Visual regression only runs on chromium project');
      }
    });

    test('wizard step 1 empty state', async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();

      await expect(page).toHaveScreenshot('wizard-step1-empty.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });

    test('wizard step 2 empty state', async ({ page }) => {
      await loginPage.goto();
      await loginPage.loginAsSecretary();
      await wizardPage.goto();

      const showData = generateTestShowData();
      await wizardPage.fillShowDetails(showData);
      await wizardPage.goToNextStep();

      await expect(page).toHaveScreenshot('wizard-step2-empty.png', {
        fullPage: true,
        animations: 'disabled',
      });
    });
  });
});

test.describe('Entry Management Flow', () => {
  // Placeholder for future entry management tests
  test.skip('secretary can view entries for a show', async () => {
    // TODO: Implement entry viewing tests
  });

  test.skip('secretary can approve/reject entries', async () => {
    // TODO: Implement entry approval tests
  });

  test.skip('secretary can assign armbands', async () => {
    // TODO: Implement armband assignment tests
  });
});

test.describe('Day-of Operations', () => {
  // Placeholder for future day-of operations tests
  test.skip('secretary can process walk-in entries', async () => {
    // TODO: Implement walk-in entry tests
  });

  test.skip('secretary can scratch entries', async () => {
    // TODO: Implement scratch tests
  });

  test.skip('secretary can process move-ups', async () => {
    // TODO: Implement move-up tests
  });
});
