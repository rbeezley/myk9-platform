import { test, expect } from '@playwright/test';
import { ShowTestHelper } from './helpers/showTestHelper';
import { ShowTestDataFactory } from './helpers/showTestDataFactory';

/**
 * Detailed Show Creation Wizard Tests
 *
 * Focused testing of the ShowCreationWizard component and its step-by-step workflow.
 * This complements the broader Phase 2 tests with deep wizard-specific functionality.
 */
test.describe('Show Creation Wizard - Detailed Testing', () => {
  let showTestHelper: ShowTestHelper;

  test.beforeEach(async ({ page }) => {
    showTestHelper = new ShowTestHelper(page);
    await showTestHelper.clearTestData();
    await showTestHelper.mockShowApiResponses();
    await showTestHelper.signIn('secretary');
  });

  test.describe('Wizard Navigation and State Management', () => {
    test('should navigate through all wizard steps correctly', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Verify initial state
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Show Details'
      );
      await expect(showTestHelper.page.locator('[data-testid="progress-bar"]')).toHaveAttribute(
        'aria-valuenow',
        '0'
      );

      // Fill step 1 and proceed
      const showData = ShowTestDataFactory.createAllBreedShow();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Verify step 2
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Trials'
      );
      await expect(showTestHelper.page.locator('[data-testid="progress-bar"]')).toHaveAttribute(
        'aria-valuenow',
        '25'
      );

      // Add trial and proceed
      const trial = ShowTestDataFactory.createObedienceTrial();
      await showTestHelper.addTrial(trial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Verify step 3
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Classes'
      );
      await expect(showTestHelper.page.locator('[data-testid="progress-bar"]')).toHaveAttribute(
        'aria-valuenow',
        '50'
      );

      // Select classes and proceed
      await showTestHelper.selectClassesFromTemplate('akc-obedience', ['Novice A', 'Open A']);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Verify step 4
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Review'
      );
      await expect(showTestHelper.page.locator('[data-testid="progress-bar"]')).toHaveAttribute(
        'aria-valuenow',
        '75'
      );
    });

    test('should support backward navigation and preserve state', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const trial = ShowTestDataFactory.createObedienceTrial();

      await showTestHelper.goToShowCreationWizard();

      // Complete first three steps
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(trial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.selectClassesFromTemplate('akc-obedience', ['Novice A']);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Now go back and verify state is preserved
      await showTestHelper.page.click('[data-testid="previous-step-button"]');
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Novice-A"]')
      ).toBeChecked();

      await showTestHelper.page.click('[data-testid="previous-step-button"]');
      await expect(
        showTestHelper.page.locator(`[data-testid="trial-item-${trial.id}"]`)
      ).toBeVisible();

      await showTestHelper.page.click('[data-testid="previous-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(
        showData.name
      );
    });

    test('should allow direct step navigation via progress indicator', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const trial = ShowTestDataFactory.createObedienceTrial();

      await showTestHelper.goToShowCreationWizard();

      // Complete first two steps
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(trial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Click on step 1 in progress indicator
      await showTestHelper.page.click('[data-testid="step-indicator-0"]');
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Show Details'
      );

      // Verify data is still there
      await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(
        showData.name
      );

      // Jump to step 2
      await showTestHelper.page.click('[data-testid="step-indicator-1"]');
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Trials'
      );
      await expect(
        showTestHelper.page.locator(`[data-testid="trial-item-${trial.id}"]`)
      ).toBeVisible();
    });

    test('should save and restore draft progress', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);

      // Save draft
      await showTestHelper.page.click('[data-testid="save-draft-button"]');
      await expect(
        showTestHelper.page.locator('[data-testid="draft-saved-message"]')
      ).toBeVisible();

      // Close wizard
      await showTestHelper.page.click('[data-testid="close-wizard-button"]');

      // Reopen wizard
      await showTestHelper.goToShowCreationWizard();

      // Verify draft was restored
      await expect(
        showTestHelper.page.locator('[data-testid="draft-restored-message"]')
      ).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(
        showData.name
      );
    });

    test('should warn about unsaved changes before closing', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Make some changes
      await showTestHelper.page.fill('[data-testid="show-name-input"]', 'Unsaved Show');

      // Try to close
      await showTestHelper.page.click('[data-testid="close-wizard-button"]');

      // Should show confirmation dialog
      await expect(
        showTestHelper.page.locator('[data-testid="unsaved-changes-dialog"]')
      ).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="dialog-title"]')).toContainText(
        'Unsaved Changes'
      );

      // Cancel close
      await showTestHelper.page.click('[data-testid="keep-editing-button"]');
      await expect(showTestHelper.page.locator('[data-testid="wizard-dialog"]')).toBeVisible();

      // Try again and confirm close
      await showTestHelper.page.click('[data-testid="close-wizard-button"]');
      await showTestHelper.page.click('[data-testid="close-wizard-confirm-button"]');
      await expect(showTestHelper.page.locator('[data-testid="wizard-dialog"]')).not.toBeVisible();
    });
  });

  test.describe('Step Validation and Error Handling', () => {
    test('should prevent progression with invalid step data', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Try to proceed without filling required fields
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Should still be on step 1
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Show Details'
      );

      // Should show validation banner
      await expect(showTestHelper.page.locator('[data-testid="validation-banner"]')).toBeVisible();
      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).toContainText('Show name is required');

      // Fill one field and check validation updates
      await showTestHelper.page.fill('[data-testid="show-name-input"]', 'Test Show');

      // Validation banner should update
      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).not.toContainText('Show name is required');
      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).toContainText('Show type is required');
    });

    test('should validate complex business rules', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Set up invalid date combination
      await showTestHelper.page.fill('[data-testid="show-name-input"]', 'Test Show');
      await showTestHelper.page.selectOption('[data-testid="show-type-select"]', 'AKC');
      await showTestHelper.page.fill('[data-testid="location-input"]', 'Test Location');
      await showTestHelper.page.fill('[data-testid="chairman-input"]', 'Test Chairman');
      await showTestHelper.page.fill('[data-testid="secretary-input"]', 'Test Secretary');

      // Set invalid date range (end before start)
      await showTestHelper.page.fill('[data-testid="start-date-input"]', '2024-12-15');
      await showTestHelper.page.fill('[data-testid="end-date-input"]', '2024-12-10');

      // Set valid entry dates initially
      await showTestHelper.page.fill('[data-testid="entry-open-date-input"]', '2024-11-01');
      await showTestHelper.page.fill('[data-testid="entry-close-date-input"]', '2024-12-01');

      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Should show business rule validation
      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).toContainText('End date must be after start date');

      // Fix date range but create entry date issue
      await showTestHelper.page.fill('[data-testid="end-date-input"]', '2024-12-20');
      await showTestHelper.page.fill('[data-testid="entry-close-date-input"]', '2024-12-16'); // After start date

      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).toContainText('Entry close date must be before show start date');
    });

    test('should validate fee constraints', async () => {
      await showTestHelper.goToShowCreationWizard();

      const showData = ShowTestDataFactory.createAllBreedShow();
      await showTestHelper.fillShowDetails(showData);

      // Set invalid fee combination (day-of-show fee less than pre-entry)
      await showTestHelper.page.fill('[data-testid="pre-entry-fee-input"]', '40');
      await showTestHelper.page.fill('[data-testid="day-of-show-fee-input"]', '35');

      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Should show fee validation warning
      await expect(
        showTestHelper.page.locator('[data-testid="validation-messages"]')
      ).toContainText('Day-of-show fee should typically be higher than pre-entry fee');
    });

    test('should handle network errors gracefully', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Mock network failure for club data
      await showTestHelper.page.route('**/api/clubs/**', async route => {
        await route.abort('failed');
      });

      // Try to load club data
      await showTestHelper.page.click('[data-testid="club-select"]');

      // Should show error message
      await expect(showTestHelper.page.locator('[data-testid="club-load-error"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="retry-button"]')).toBeVisible();

      // Restore network and retry
      await showTestHelper.page.unroute('**/api/clubs/**');
      await showTestHelper.mockShowApiResponses();

      await showTestHelper.page.click('[data-testid="retry-button"]');

      // Should load successfully
      await expect(showTestHelper.page.locator('[data-testid="club-select"] option')).toHaveCount(
        2
      ); // Default + test club
    });
  });

  test.describe('Trial Management Within Wizard', () => {
    test('should support adding multiple trials of different types', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Add multiple trials
      const trials = [
        ShowTestDataFactory.createObedienceTrial(),
        ShowTestDataFactory.createAgilityTrial(),
        ShowTestDataFactory.createScentWorkTrial(),
      ];

      for (const trial of trials) {
        await showTestHelper.addTrial(trial);
      }

      // Verify all trials are listed
      for (const trial of trials) {
        await expect(
          showTestHelper.page.locator(`[data-testid="trial-item-${trial.id}"]`)
        ).toBeVisible();
      }

      // Verify trial count
      await expect(showTestHelper.page.locator('[data-testid="trial-count"]')).toContainText(
        '3 trials'
      );
    });

    test('should validate trial scheduling and prevent conflicts', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Add first trial
      const trial1 = ShowTestDataFactory.createTrialData({
        name: 'Morning Trial',
        dateTime: '2024-12-15T09:00:00.000Z',
        type: 'Obedience',
      });
      await showTestHelper.addTrial(trial1);

      // Try to add overlapping trial
      await showTestHelper.page.click('[data-testid="add-trial-button"]');
      await showTestHelper.page.fill('[data-testid="trial-name-input"]', 'Conflicting Trial');
      await showTestHelper.page.fill('[data-testid="trial-date-input"]', '2024-12-15');
      await showTestHelper.page.fill('[data-testid="trial-time-input"]', '09:15'); // Overlaps
      await showTestHelper.page.selectOption('[data-testid="trial-type-select"]', 'Agility');

      await showTestHelper.page.click('[data-testid="save-trial-button"]');

      // Should show conflict warning
      await expect(
        showTestHelper.page.locator('[data-testid="scheduling-conflict-warning"]')
      ).toBeVisible();
      await expect(
        showTestHelper.page.locator('[data-testid="conflict-suggestion"]')
      ).toContainText('Consider scheduling at');

      // Accept suggestion
      await showTestHelper.page.click('[data-testid="accept-suggestion-button"]');

      // Should update time automatically
      await expect(showTestHelper.page.locator('[data-testid="trial-time-input"]')).not.toHaveValue(
        '09:15'
      );
    });

    test('should support trial reordering and time optimization', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Add trials in suboptimal order
      const trials = [
        ShowTestDataFactory.createTrialData({
          name: 'Afternoon Trial',
          dateTime: '2024-12-15T14:00:00.000Z',
          type: 'Agility',
        }),
        ShowTestDataFactory.createTrialData({
          name: 'Morning Trial',
          dateTime: '2024-12-15T09:00:00.000Z',
          type: 'Obedience',
        }),
        ShowTestDataFactory.createTrialData({
          name: 'Evening Trial',
          dateTime: '2024-12-15T17:00:00.000Z',
          type: 'Rally',
        }),
      ];

      for (const trial of trials) {
        await showTestHelper.addTrial(trial);
      }

      // Use auto-optimization
      await showTestHelper.page.click('[data-testid="optimize-schedule-button"]');

      // Should reorder trials chronologically
      const trialElements = await showTestHelper.page.locator('[data-testid^="trial-item-"]').all();
      const firstTrialName = await trialElements[0]
        .locator('[data-testid="trial-name"]')
        .textContent();
      expect(firstTrialName).toContain('Morning');

      const lastTrialName = await trialElements[2]
        .locator('[data-testid="trial-name"]')
        .textContent();
      expect(lastTrialName).toContain('Evening');
    });

    test('should support bulk trial operations', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Add multiple trials
      const trials = [
        ShowTestDataFactory.createObedienceTrial(),
        ShowTestDataFactory.createAgilityTrial(),
        ShowTestDataFactory.createScentWorkTrial(),
      ];

      for (const trial of trials) {
        await showTestHelper.addTrial(trial);
      }

      // Select multiple trials
      await showTestHelper.page.check(`[data-testid="trial-checkbox-${trials[0].id}"]`);
      await showTestHelper.page.check(`[data-testid="trial-checkbox-${trials[1].id}"]`);

      // Bulk operation: change date
      await showTestHelper.page.click('[data-testid="bulk-edit-button"]');
      await showTestHelper.page.fill('[data-testid="bulk-date-input"]', '2024-12-16');
      await showTestHelper.page.click('[data-testid="apply-bulk-changes-button"]');

      // Verify changes applied to selected trials
      await expect(
        showTestHelper.page.locator(`[data-testid="trial-date-${trials[0].id}"]`)
      ).toContainText('2024-12-16');
      await expect(
        showTestHelper.page.locator(`[data-testid="trial-date-${trials[1].id}"]`)
      ).toContainText('2024-12-16');

      // Third trial should be unchanged
      await expect(
        showTestHelper.page.locator(`[data-testid="trial-date-${trials[2].id}"]`)
      ).not.toContainText('2024-12-16');
    });
  });

  test.describe('Class Selection and Template Integration', () => {
    test('should filter classes by multiple criteria', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const scentWorkTrial = ShowTestDataFactory.createScentWorkTrial();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(scentWorkTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Select Scent Work template
      await showTestHelper.page.click('[data-testid="template-akc-scent-work"]');

      // Test element filter
      await showTestHelper.page.selectOption('[data-testid="element-filter"]', 'Container');

      // Count visible classes
      const containerClasses = await showTestHelper.page
        .locator('[data-testid^="class-card-Container"]')
        .count();
      expect(containerClasses).toBeGreaterThan(0);

      // Verify non-container classes are hidden
      await expect(
        showTestHelper.page.locator('[data-testid^="class-card-Interior"]')
      ).not.toBeVisible();

      // Test level filter combination
      await showTestHelper.page.selectOption('[data-testid="level-filter"]', 'Novice');

      const containerNoviceClasses = await showTestHelper.page
        .locator('[data-testid*="Container"][data-testid*="Novice"]')
        .count();
      expect(containerNoviceClasses).toBeGreaterThan(0);
      expect(containerNoviceClasses).toBeLessThanOrEqual(containerClasses);

      // Clear filters
      await showTestHelper.page.click('[data-testid="clear-filters-button"]');

      const allClasses = await showTestHelper.page.locator('[data-testid^="class-card-"]').count();
      expect(allClasses).toBeGreaterThan(containerClasses);
    });

    test('should support class customization before adding', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const scentWorkTrial = ShowTestDataFactory.createScentWorkTrial();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(scentWorkTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.page.click('[data-testid="template-akc-scent-work"]');

      // Customize a class before selecting
      await showTestHelper.page.click(
        '[data-testid="class-card-Container-Novice-A"] [data-testid="customize-button"]'
      );

      // Modify class parameters
      await showTestHelper.page.fill('[data-testid="max-entries-input"]', '25');
      await showTestHelper.page.fill('[data-testid="time-limit-input"]', '2:30');
      await showTestHelper.page.fill('[data-testid="pre-entry-fee-input"]', '28');

      await showTestHelper.page.click('[data-testid="save-customization-button"]');

      // Select the customized class
      await showTestHelper.page.check('[data-testid="class-checkbox-Container-Novice-A"]');

      // Verify customizations are shown
      await expect(
        showTestHelper.page.locator(
          '[data-testid="class-card-Container-Novice-A"] [data-testid="customized-indicator"]'
        )
      ).toBeVisible();
      await expect(
        showTestHelper.page.locator(
          '[data-testid="class-card-Container-Novice-A"] [data-testid="max-entries-display"]'
        )
      ).toContainText('25');
    });

    test('should validate class combinations and show warnings', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const agilityTrial = ShowTestDataFactory.createAgilityTrial();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(agilityTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.page.click('[data-testid="template-akc-agility"]');

      // Select conflicting height classes
      await showTestHelper.page.check('[data-testid="class-checkbox-Standard-Novice-16"]');
      await showTestHelper.page.check('[data-testid="class-checkbox-Standard-Novice-20"]');
      await showTestHelper.page.check('[data-testid="class-checkbox-Jumpers-Novice-16"]');

      // Should show scheduling suggestion
      await expect(
        showTestHelper.page.locator('[data-testid="scheduling-suggestion"]')
      ).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="suggestion-text"]')).toContainText(
        'running order'
      );

      // Accept automatic running order
      await showTestHelper.page.click('[data-testid="accept-running-order-button"]');

      // Verify running order was applied
      await expect(
        showTestHelper.page.locator('[data-testid="running-order-display"]')
      ).toBeVisible();
    });

    test('should support preset class packages', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const obedienceTrial = ShowTestDataFactory.createObedienceTrial();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(obedienceTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.page.click('[data-testid="template-akc-obedience"]');

      // Use preset package
      await showTestHelper.page.click('[data-testid="preset-package-full-trial"]');

      // Should auto-select all standard classes
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Novice-A"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Novice-B"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Open-A"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Open-B"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Utility-A"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Utility-B"]')
      ).toBeChecked();

      // Try different preset
      await showTestHelper.page.click('[data-testid="preset-package-novice-only"]');

      // Should deselect advanced classes
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Novice-A"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Novice-B"]')
      ).toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Open-A"]')
      ).not.toBeChecked();
      await expect(
        showTestHelper.page.locator('[data-testid="class-checkbox-Utility-A"]')
      ).not.toBeChecked();
    });
  });

  test.describe('Review Step and Show Creation', () => {
    test('should display comprehensive show summary', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(workflowData.show);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Add multiple trials
      for (const trial of workflowData.trials.slice(0, 2)) {
        // Just first 2 for test speed
        await showTestHelper.addTrial(trial);
      }
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Select some classes
      await showTestHelper.selectClassesFromTemplate('akc-conformation', ['Puppy Dog', 'Open Dog']);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Verify review summary
      await expect(showTestHelper.page.locator('[data-testid="review-show-name"]')).toContainText(
        workflowData.show.name
      );
      await expect(showTestHelper.page.locator('[data-testid="review-show-type"]')).toContainText(
        workflowData.show.organization
      );
      await expect(showTestHelper.page.locator('[data-testid="review-location"]')).toContainText(
        workflowData.show.location
      );

      // Trial summary
      await expect(showTestHelper.page.locator('[data-testid="review-trial-count"]')).toContainText(
        '2 trials'
      );

      // Class summary
      await expect(showTestHelper.page.locator('[data-testid="review-class-count"]')).toContainText(
        '2 classes'
      );

      // Fee summary
      await expect(
        showTestHelper.page.locator('[data-testid="review-pre-entry-fee"]')
      ).toContainText(workflowData.show.preEntryFee.toString());

      // Judge summary
      await expect(showTestHelper.page.locator('[data-testid="review-judge-count"]')).toContainText(
        workflowData.show.judgeIds.length.toString()
      );
    });

    test('should support different creation options', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(workflowData.show);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(workflowData.trials[0]);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.selectClassesFromTemplate('akc-conformation', ['Puppy Dog']);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Verify all creation options are available
      await expect(showTestHelper.page.locator('[data-testid="save-draft-button"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="create-show-button"]')).toBeVisible();
      await expect(
        showTestHelper.page.locator('[data-testid="create-and-publish-button"]')
      ).toBeVisible();

      // Test draft creation
      await showTestHelper.page.click('[data-testid="save-draft-button"]');

      // Should navigate to show details page
      await showTestHelper.page.waitForURL(/\/shows\/.*/, { timeout: 10000 });

      // Verify show status
      await expect(showTestHelper.page.locator('[data-testid="show-status"]')).toContainText(
        'Draft'
      );
    });

    test('should validate required data before creation', async () => {
      await showTestHelper.goToShowCreationWizard();

      // Fill minimal show details (missing required fields)
      await showTestHelper.page.fill('[data-testid="show-name-input"]', 'Incomplete Show');
      await showTestHelper.page.selectOption('[data-testid="show-type-select"]', 'AKC');
      // Skip other required fields

      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Should show validation errors and stay on step 1
      await expect(showTestHelper.page.locator('[data-testid="validation-banner"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="step-indicator"]')).toContainText(
        'Show Details'
      );

      // Cannot proceed to review without trials
      const showData = ShowTestDataFactory.createAllBreedShow();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Skip adding trials
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Should show trial requirement error
      await expect(showTestHelper.page.locator('[data-testid="validation-banner"]')).toContainText(
        'At least one trial is required'
      );
    });

    test('should handle creation errors gracefully', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();

      // Mock creation failure
      await showTestHelper.page.route('**/api/shows/**', async route => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Database connection failed' }),
          });
        }
      });

      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(workflowData.show);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.addTrial(workflowData.trials[0]);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      await showTestHelper.selectClassesFromTemplate('akc-conformation', ['Puppy Dog']);
      await showTestHelper.page.click('[data-testid="next-step-button"]');

      // Try to create show
      await showTestHelper.page.click('[data-testid="create-show-button"]');

      // Should show error message
      await expect(showTestHelper.page.locator('[data-testid="creation-error"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="error-message"]')).toContainText(
        'Database connection failed'
      );

      // Should offer retry option
      await expect(
        showTestHelper.page.locator('[data-testid="retry-creation-button"]')
      ).toBeVisible();

      // Should still be in wizard (not closed)
      await expect(showTestHelper.page.locator('[data-testid="wizard-dialog"]')).toBeVisible();
    });
  });
});
