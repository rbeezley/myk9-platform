import { test, expect } from '@playwright/test';
import { ShowTestHelper } from './helpers/showTestHelper';
import { ShowTestDataFactory } from './helpers/showTestDataFactory';

/**
 * Phase 2 Validation Smoke Tests
 *
 * Quick validation tests to ensure the Phase 2 test infrastructure is working correctly.
 * These tests validate our helper classes and data factories before running the full suite.
 */
test.describe('Phase 2: Validation Smoke Tests', () => {
  let showTestHelper: ShowTestHelper;

  test.beforeEach(async ({ page }) => {
    showTestHelper = new ShowTestHelper(page);
    await showTestHelper.clearTestData();
    await showTestHelper.mockShowApiResponses();
  });

  test('should access show management page directly (bypassing auth for now)', async () => {
    // Go directly to shows page - bypass auth like working tests
    await showTestHelper.page.goto('/shows');

    // Verify we can access the shows page
    await expect(showTestHelper.page).toHaveURL(/.*\/shows/);

    // Check that some key elements exist (flexible selectors)
    const headings = showTestHelper.page.locator('h1, h2, [role="heading"]');
    await expect(headings.first()).toBeVisible();
  });

  test('should generate valid test data using factories', async () => {
    // Test show data factory
    const showData = ShowTestDataFactory.createAllBreedShow();

    expect(showData.name).toBeTruthy();
    expect(showData.organization).toMatch(/^(AKC|UKC|Other)$/);
    expect(showData.preEntryFee).toBeGreaterThan(0);
    expect(showData.dayOfShowFee).toBeGreaterThan(showData.preEntryFee);

    // Validate date logic
    const startDate = new Date(showData.startDate);
    const endDate = new Date(showData.endDate);
    const entryCloseDate = new Date(showData.entryCloseDate);

    expect(startDate <= endDate).toBeTruthy();
    expect(entryCloseDate < startDate).toBeTruthy();

    // Test trial data factory
    const trial = ShowTestDataFactory.createObedienceTrial();

    expect(trial.name).toBeTruthy();
    expect(trial.type).toBe('Obedience');
    expect(trial.classes.length).toBeGreaterThan(0);

    // Test complete workflow data
    const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();

    expect(workflowData.show).toBeTruthy();
    expect(workflowData.trials.length).toBeGreaterThan(0);
    expect(workflowData.judges.length).toBeGreaterThan(0);
    expect(workflowData.club).toBeTruthy();
  });

  test('should successfully mock API responses', async () => {
    // Test that our API mocking is working by making a request (no auth needed)
    const response = await showTestHelper.page.request.get('/api/clubs');
    expect(response.status()).toBe(200);

    const clubs = await response.json();
    expect(Array.isArray(clubs)).toBeTruthy();
    expect(clubs.length).toBeGreaterThan(0);
  });

  test('should open show creation wizard dialog', async () => {
    // Go directly to shows page and try to open wizard
    await showTestHelper.page.goto('/shows');
    await showTestHelper.page.click('[data-testid="create-new-show-button"]').catch(() => {
      // If button doesn't exist, that's fine for this smoke test
    });

    // Verify wizard dialog opened
    await expect(showTestHelper.page.locator('[data-testid="wizard-dialog"]')).toBeVisible();
    await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
      'Show Details'
    );
  });

  test('should fill show details form without errors', async () => {
    const showData = ShowTestDataFactory.createAllBreedShow();

    // Go directly to shows page
    await showTestHelper.page.goto('/shows');

    // This will test our form filling helper
    await showTestHelper.fillShowDetails(showData);

    // Verify fields were filled
    await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(
      showData.name
    );
    await expect(showTestHelper.page.locator('[data-testid="show-type-select"]')).toHaveValue(
      showData.type
    );
    await expect(showTestHelper.page.locator('[data-testid="location-input"]')).toHaveValue(
      showData.location
    );
  });

  test('should handle console errors and validate clean test environment', async () => {
    // Go to shows page to test environment
    await showTestHelper.page.goto('/shows');

    const errors = await showTestHelper.checkConsoleErrors();

    // We should start with no console errors
    expect(errors.length).toBe(0);
  });

  test('should validate test data relationships and constraints', async () => {
    const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();

    // Verify show-trial relationships
    workflowData.trials.forEach(trial => {
      expect(trial.classes.length).toBeGreaterThan(0);

      // Verify each class has a valid judge assignment
      trial.classes.forEach(cls => {
        const assignedJudge = workflowData.judges.find(j => j.id === cls.judgeId);
        expect(assignedJudge).toBeTruthy();

        // Verify judge has appropriate specialties for the trial type
        if (trial.type === 'Conformation') {
          expect(assignedJudge!.specialties.some(s => s.includes('Breed'))).toBeTruthy();
        } else if (trial.type === 'Obedience') {
          expect(assignedJudge!.specialties.includes('Obedience')).toBeTruthy();
        }
      });
    });

    // Verify club data structure
    expect(workflowData.club.address).toBeTruthy();
    expect(workflowData.club.address.street).toBeTruthy();
    expect(workflowData.club.address.city).toBeTruthy();
    expect(workflowData.club.address.state).toBeTruthy();
  });
});
