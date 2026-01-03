import { test, expect } from '@playwright/test';
import { ShowTestHelper } from './helpers/showTestHelper';
import { ShowTestDataFactory } from './helpers/showTestDataFactory';

/**
 * Phase 2: Show Management Workflow Tests
 * 
 * Comprehensive testing of the show creation and management system including:
 * - Show creation with different types and configurations
 * - Trial management using the Show Creation Wizard
 * - Class creation using templates
 * - Judge assignments and scheduling
 * - Show publication and entry management
 * 
 * This builds upon Phase 1 (Foundation Entity Creation) which has been completed.
 */
test.describe('Phase 2: Show Management Workflow', () => {
  let showTestHelper: ShowTestHelper;

  test.beforeEach(async ({ page }) => {
    showTestHelper = new ShowTestHelper(page);
    await showTestHelper.clearTestData();
    await showTestHelper.mockShowApiResponses();
    await showTestHelper.signIn('secretary');
  });

  test.describe('Test 2.1: Create Show with Basic Information', () => {
    
    test('should create an all-breed conformation show with complete details', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      
      // Verify form validation
      await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(showData.name);
      await expect(showTestHelper.page.locator('[data-testid="show-type-select"]')).toHaveValue(showData.type);
      await expect(showTestHelper.page.locator('[data-testid="location-input"]')).toHaveValue(showData.location);
      
      // Verify fees are correctly set
      await expect(showTestHelper.page.locator('[data-testid="pre-entry-fee-input"]')).toHaveValue(showData.preEntryFee.toString());
      await expect(showTestHelper.page.locator('[data-testid="day-of-show-fee-input"]')).toHaveValue(showData.dayOfShowFee.toString());
      
      // Verify staff assignments
      await expect(showTestHelper.page.locator('[data-testid="chairman-input"]')).toHaveValue(showData.chairman);
      await expect(showTestHelper.page.locator('[data-testid="secretary-input"]')).toHaveValue(showData.secretary);
      
      // Verify date validation
      const startDate = new Date(showData.startDate);
      const endDate = new Date(showData.endDate);
      const entryCloseDate = new Date(showData.entryCloseDate);
      
      expect(startDate <= endDate).toBeTruthy();
      expect(entryCloseDate < startDate).toBeTruthy();
    });

    test('should create a specialty breed show with specific requirements', async () => {
      const showData = ShowTestDataFactory.createSpecialtyShow();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      
      // Specialty shows should have specific validations
      await expect(showTestHelper.page.locator('[data-testid="show-name-input"]')).toHaveValue(/Specialty/);
      
      // Verify breed-specific settings are available
      await expect(showTestHelper.page.locator('[data-testid="breed-specific-options"]')).toBeVisible();
    });

    test('should create a fun match show with relaxed requirements', async () => {
      const showData = ShowTestDataFactory.createMatchShow();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      
      // Match shows should have lower fees
      expect(showData.preEntryFee).toBeLessThan(25);
      expect(showData.dayOfShowFee).toBeLessThan(30);
      
      // Verify match-specific options
      await expect(showTestHelper.page.locator('[data-testid="match-options"]')).toBeVisible();
    });

    test('should validate required fields and show appropriate error messages', async () => {
      await showTestHelper.goToShowCreationWizard();
      
      // Try to proceed without filling required fields
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Verify validation messages appear
      await expect(showTestHelper.page.locator('[data-testid="error-show-name"]')).toContainText('required');
      await expect(showTestHelper.page.locator('[data-testid="error-show-type"]')).toContainText('required');
      await expect(showTestHelper.page.locator('[data-testid="error-location"]')).toContainText('required');
      await expect(showTestHelper.page.locator('[data-testid="error-club"]')).toContainText('required');
      
      // Fill one field and verify error disappears
      await showTestHelper.page.fill('[data-testid="show-name-input"]', 'Test Show');
      await expect(showTestHelper.page.locator('[data-testid="error-show-name"]')).not.toBeVisible();
    });

    test('should validate date logic and prevent invalid date combinations', async () => {
      await showTestHelper.goToShowCreationWizard();
      
      // Set end date before start date
      await showTestHelper.page.fill('[data-testid="start-date-input"]', '2024-12-15');
      await showTestHelper.page.fill('[data-testid="end-date-input"]', '2024-12-10');
      
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Should show date validation error
      await expect(showTestHelper.page.locator('[data-testid="error-date-range"]')).toContainText('End date must be after start date');
      
      // Set entry close date after show start date
      await showTestHelper.page.fill('[data-testid="end-date-input"]', '2024-12-20');
      await showTestHelper.page.fill('[data-testid="entry-close-date-input"]', '2024-12-16');
      
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Should show entry date validation error
      await expect(showTestHelper.page.locator('[data-testid="error-entry-dates"]')).toContainText('Entry close date must be before show start date');
    });
  });

  test.describe('Test 2.2: Add Trials Using Show Creation Wizard', () => {
    
    test('should add conformation trial with breed classes', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const conformationTrial = ShowTestDataFactory.createConformationTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Add conformation trial
      await showTestHelper.addTrial(conformationTrial);
      
      // Verify trial appears in list
      await expect(showTestHelper.page.locator(`[data-testid="trial-item-${conformationTrial.id}"]`)).toBeVisible();
      await expect(showTestHelper.page.locator(`[data-testid="trial-name-${conformationTrial.id}"]`)).toContainText('Conformation');
      
      // Verify breed classes are available for selection
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="conformation-classes-section"]')).toBeVisible();
    });

    test('should add obedience trial with all levels', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const obedienceTrial = ShowTestDataFactory.createObedienceTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(obedienceTrial);
      
      // Verify obedience-specific settings
      await expect(showTestHelper.page.locator(`[data-testid="trial-type-${obedienceTrial.id}"]`)).toContainText('Obedience');
      
      // Check that all obedience levels are available
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="class-Novice-A"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Open-A"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Utility-A"]')).toBeVisible();
    });

    test('should add agility trial with height divisions', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const agilityTrial = ShowTestDataFactory.createAgilityTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(agilityTrial);
      
      // Verify height divisions are available
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="height-division-12"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="height-division-16"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="height-division-20"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="height-division-24"]')).toBeVisible();
    });

    test('should add scent work trial with all elements', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const scentWorkTrial = ShowTestDataFactory.createScentWorkTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(scentWorkTrial);
      
      // Verify scent work elements are available
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="element-Container"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="element-Interior"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="element-Exterior"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="element-Buried"]')).toBeVisible();
    });

    test('should add rally trial with all levels', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const rallyTrial = ShowTestDataFactory.createRallyTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(rallyTrial);
      
      // Verify rally levels are available
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      await expect(showTestHelper.page.locator('[data-testid="rally-novice"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="rally-advanced"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="rally-excellent"]')).toBeVisible();
    });

    test('should detect and warn about trial scheduling conflicts', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const trial1 = ShowTestDataFactory.createTrialData({
        name: 'Morning Trial',
        dateTime: '2024-12-15T09:00:00.000Z',
        type: 'Obedience'
      });
      const trial2 = ShowTestDataFactory.createTrialData({
        name: 'Conflicting Trial',
        dateTime: '2024-12-15T09:30:00.000Z', // Overlapping time
        type: 'Agility'
      });
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(trial1);
      await showTestHelper.addTrial(trial2);
      
      // Should show conflict warning
      await expect(showTestHelper.page.locator('[data-testid="schedule-conflict-warning"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="conflict-details"]')).toContainText('overlapping');
    });

    test('should allow editing and removing trials', async () => {
      const showData = ShowTestDataFactory.createAllBreedShow();
      const trial = ShowTestDataFactory.createObedienceTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(trial);
      
      // Edit trial
      await showTestHelper.page.click(`[data-testid="edit-trial-${trial.id}"]`);
      await showTestHelper.page.fill('[data-testid="trial-name-input"]', 'Updated Obedience Trial');
      await showTestHelper.page.click('[data-testid="save-trial-button"]');
      
      // Verify trial was updated
      await expect(showTestHelper.page.locator(`[data-testid="trial-name-${trial.id}"]`)).toContainText('Updated');
      
      // Remove trial
      await showTestHelper.page.click(`[data-testid="remove-trial-${trial.id}"]`);
      await showTestHelper.page.click('[data-testid="confirm-remove-button"]');
      
      // Verify trial was removed
      await expect(showTestHelper.page.locator(`[data-testid="trial-item-${trial.id}"]`)).not.toBeVisible();
    });
  });

  test.describe('Test 2.3: Class Creation Using Templates', () => {
    
    test('should use AKC Conformation template to create classes', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      const conformationTrial = workflowData.trials.find(t => t.type === 'Conformation')!;
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(workflowData.show);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(conformationTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Select AKC Conformation template
      await showTestHelper.page.click('[data-testid="template-akc-conformation"]');
      
      // Verify template classes are available
      await expect(showTestHelper.page.locator('[data-testid="class-Puppy-Dog"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Open-Dog"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Puppy-Bitch"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Open-Bitch"]')).toBeVisible();
      
      // Select classes
      await showTestHelper.selectClassesFromTemplate('akc-conformation', ['Puppy Dog', 'Open Dog']);
      
      // Verify selection count
      await expect(showTestHelper.page.locator('[data-testid="selected-classes-count"]')).toContainText('2 selected');
    });

    test('should use UKC template system with breed-specific classes', async () => {
      const showData = ShowTestDataFactory.createShowData({ type: 'UKC' });
      const conformationTrial = ShowTestDataFactory.createConformationTrial();
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(showData);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(conformationTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Select UKC template
      await showTestHelper.page.click('[data-testid="template-ukc-conformation"]');
      
      // Verify UKC-specific classes
      await expect(showTestHelper.page.locator('[data-testid="class-Baby-Puppy"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Junior-Puppy"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Senior-Puppy"]')).toBeVisible();
    });

    test('should use Scent Work class templates with element variations', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      const scentWorkTrial = workflowData.trials.find(t => t.type === 'Scent Work')!;
      
      await showTestHelper.goToShowCreationWizard();
      await showTestHelper.fillShowDetails(workflowData.show);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      await showTestHelper.addTrial(scentWorkTrial);
      await showTestHelper.page.click('[data-testid="next-step-button"]');
      
      // Select Scent Work template
      await showTestHelper.page.click('[data-testid="template-akc-scent-work"]');
      
      // Verify element-specific classes
      await expect(showTestHelper.page.locator('[data-testid="class-Container-Novice-A"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Interior-Advanced-A"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Buried-Excellent-A"]')).toBeVisible();
      
      // Test element filtering
      await showTestHelper.page.selectOption('[data-testid="element-filter"]', 'Container');
      await expect(showTestHelper.page.locator('[data-testid="class-Container-Novice-A"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="class-Interior-Advanced-A"]')).not.toBeVisible();
    });

    test('should customize class parameters and validate constraints', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: [workflowData.trials[0]], // Just one trial for simplicity
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Navigate to class customization
      await showTestHelper.page.click('[data-testid="show-trials-tab"]');
      await showTestHelper.page.click('[data-testid="edit-classes-button"]');
      
      // Customize class parameters
      await showTestHelper.page.fill('[data-testid="max-entries-input"]', '25');
      await showTestHelper.page.fill('[data-testid="pre-entry-fee-input"]', '28');
      await showTestHelper.page.fill('[data-testid="day-of-show-fee-input"]', '35');
      
      // Test invalid values
      await showTestHelper.page.fill('[data-testid="max-entries-input"]', '-5');
      await showTestHelper.page.click('[data-testid="save-class-button"]');
      
      // Should show validation error
      await expect(showTestHelper.page.locator('[data-testid="error-max-entries"]')).toContainText('must be positive');
      
      // Fix and save
      await showTestHelper.page.fill('[data-testid="max-entries-input"]', '30');
      await showTestHelper.page.click('[data-testid="save-class-button"]');
      
      // Verify changes were saved
      await expect(showTestHelper.page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should set entry limits and validate capacity constraints', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: [workflowData.trials[0]],
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Set show-wide capacity
      await showTestHelper.page.click('[data-testid="show-settings-tab"]');
      await showTestHelper.page.fill('[data-testid="total-capacity-input"]', '100');
      
      // Set class-specific limits that exceed total capacity
      await showTestHelper.page.click('[data-testid="class-limits-tab"]');
      await showTestHelper.page.fill('[data-testid="class-1-limit-input"]', '60');
      await showTestHelper.page.fill('[data-testid="class-2-limit-input"]', '60');
      
      await showTestHelper.page.click('[data-testid="save-limits-button"]');
      
      // Should warn about capacity conflict
      await expect(showTestHelper.page.locator('[data-testid="capacity-warning"]')).toContainText('exceeds total show capacity');
    });

    test('should configure age and eligibility requirements', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      const conformationTrial = workflowData.trials.find(t => t.type === 'Conformation')!;
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: [conformationTrial],
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Navigate to class eligibility settings
      await showTestHelper.page.click('[data-testid="show-trials-tab"]');
      await showTestHelper.page.click('[data-testid="class-eligibility-button"]');
      
      // Set puppy class age requirements
      await showTestHelper.page.click('[data-testid="class-Puppy-Dog"]');
      await showTestHelper.page.fill('[data-testid="min-age-months"]', '6');
      await showTestHelper.page.fill('[data-testid="max-age-months"]', '12');
      
      // Set additional eligibility rules
      await showTestHelper.page.check('[data-testid="require-akc-registration"]');
      await showTestHelper.page.check('[data-testid="require-health-clearances"]');
      
      await showTestHelper.page.click('[data-testid="save-eligibility-button"]');
      
      // Verify rules were saved
      await expect(showTestHelper.page.locator('[data-testid="eligibility-saved-message"]')).toBeVisible();
    });
  });

  test.describe('Test 2.4: Judging Assignments and Scheduling', () => {
    
    test('should assign judges to classes based on specialties', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Navigate to judge assignments
      await showTestHelper.page.click('[data-testid="judges-tab"]');
      
      // Assign judges to specific classes
      const assignments = [
        { className: 'Puppy Dog', judgeId: workflowData.judges[0].id, time: '09:00' },
        { className: 'Open Dog', judgeId: workflowData.judges[0].id, time: '10:30' },
        { className: 'Novice A', judgeId: workflowData.judges[1].id, time: '13:00' },
      ];
      
      await showTestHelper.assignJudgesToClasses(assignments);
      
      // Verify assignments
      for (const assignment of assignments) {
        const judge = workflowData.judges.find(j => j.id === assignment.judgeId)!;
        await expect(showTestHelper.page.locator(`[data-testid="class-${assignment.className}"] [data-testid="assigned-judge"]`))
          .toContainText(judge.name);
        await expect(showTestHelper.page.locator(`[data-testid="class-${assignment.className}"] [data-testid="judging-time"]`))
          .toContainText(assignment.time);
      }
    });

    test('should create and optimize judging schedule', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Navigate to schedule optimization
      await showTestHelper.page.click('[data-testid="judges-tab"]');
      await showTestHelper.page.click('[data-testid="optimize-schedule-button"]');
      
      // Configure optimization preferences
      await showTestHelper.page.selectOption('[data-testid="optimization-priority"]', 'minimize-gaps');
      await showTestHelper.page.fill('[data-testid="break-duration"]', '30');
      await showTestHelper.page.fill('[data-testid="lunch-break-start"]', '12:00');
      
      await showTestHelper.page.click('[data-testid="run-optimization-button"]');
      
      // Verify schedule was generated
      await expect(showTestHelper.page.locator('[data-testid="optimized-schedule"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="schedule-metrics"]')).toContainText('Total judging time');
      
      // Apply optimized schedule
      await showTestHelper.page.click('[data-testid="apply-schedule-button"]');
      await expect(showTestHelper.page.locator('[data-testid="schedule-applied-message"]')).toBeVisible();
    });

    test('should handle judge conflicts and provide alternatives', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Try to assign same judge to overlapping times
      await showTestHelper.page.click('[data-testid="judges-tab"]');
      
      const conflictingAssignments = [
        { className: 'Puppy Dog', judgeId: workflowData.judges[0].id, time: '09:00' },
        { className: 'Open Dog', judgeId: workflowData.judges[0].id, time: '09:15' }, // Conflict
      ];
      
      await showTestHelper.assignJudgesToClasses([conflictingAssignments[0]]);
      
      // Try to assign conflicting time
      await showTestHelper.page.click(`[data-testid="class-Open-Dog"] [data-testid="assign-judge-button"]`);
      await showTestHelper.page.selectOption('[data-testid="judge-select"]', workflowData.judges[0].id);
      await showTestHelper.page.fill('[data-testid="judging-time-input"]', '09:15');
      await showTestHelper.page.click('[data-testid="save-judge-assignment-button"]');
      
      // Should show conflict warning
      await expect(showTestHelper.page.locator('[data-testid="judge-conflict-warning"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="alternative-judges"]')).toBeVisible();
      
      // Select alternative judge
      await showTestHelper.page.selectOption('[data-testid="judge-select"]', workflowData.judges[1].id);
      await showTestHelper.page.click('[data-testid="save-judge-assignment-button"]');
      
      // Verify conflict resolved
      await expect(showTestHelper.page.locator('[data-testid="judge-conflict-warning"]')).not.toBeVisible();
    });

    test('should generate judge contracts and agreements', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Assign judges first
      await showTestHelper.page.click('[data-testid="judges-tab"]');
      const assignments = [
        { className: 'Puppy Dog', judgeId: workflowData.judges[0].id, time: '09:00' },
      ];
      await showTestHelper.assignJudgesToClasses(assignments);
      
      // Generate contracts
      await showTestHelper.page.click('[data-testid="generate-contracts-button"]');
      
      // Configure contract terms
      await showTestHelper.page.fill('[data-testid="judge-fee"]', '300');
      await showTestHelper.page.fill('[data-testid="travel-allowance"]', '150');
      await showTestHelper.page.check('[data-testid="include-hotel"]');
      
      await showTestHelper.page.click('[data-testid="generate-all-contracts-button"]');
      
      // Verify contracts generated
      await expect(showTestHelper.page.locator('[data-testid="contracts-generated"]')).toBeVisible();
      
      // Download contract
      const downloadPromise = showTestHelper.page.waitForEvent('download');
      await showTestHelper.page.click(`[data-testid="download-contract-${workflowData.judges[0].id}"]`);
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('judge-contract');
    });

    test('should handle last-minute judge changes and notifications', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'create' // Create as unpublished show
      });
      
      // Assign initial judge
      await showTestHelper.page.click('[data-testid="judges-tab"]');
      const originalAssignment = { className: 'Puppy Dog', judgeId: workflowData.judges[0].id, time: '09:00' };
      await showTestHelper.assignJudgesToClasses([originalAssignment]);
      
      // Simulate judge change
      await showTestHelper.page.click(`[data-testid="class-Puppy-Dog"] [data-testid="change-judge-button"]`);
      await showTestHelper.page.selectOption('[data-testid="replacement-judge-select"]', workflowData.judges[1].id);
      await showTestHelper.page.fill('[data-testid="change-reason"]', 'Original judge had emergency');
      await showTestHelper.page.check('[data-testid="notify-exhibitors"]');
      
      await showTestHelper.page.click('[data-testid="confirm-judge-change-button"]');
      
      // Verify change was applied
      const newJudge = workflowData.judges[1];
      await expect(showTestHelper.page.locator(`[data-testid="class-Puppy-Dog"] [data-testid="assigned-judge"]`))
        .toContainText(newJudge.name);
      
      // Verify notification was sent
      await expect(showTestHelper.page.locator('[data-testid="change-notification-sent"]')).toBeVisible();
    });
  });

  test.describe('Test 2.5: Show Publication and Entry Opening', () => {
    
    test('should publish show and make entries accessible', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      // Create complete show as draft first
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'draft'
      });
      
      // Get the show ID from URL
      const showId = showTestHelper.page.url().split('/shows/')[1];
      
      // Publish the show
      await showTestHelper.publishShow(showId);
      
      // Verify show is now published
      await expect(showTestHelper.page.locator('[data-testid="show-status"]')).toContainText('Published');
      await expect(showTestHelper.page.locator('[data-testid="accepting-entries-indicator"]')).toBeVisible();
      
      // Test entry form accessibility
      await showTestHelper.page.click('[data-testid="enter-show-button"]');
      await expect(showTestHelper.page.locator('[data-testid="entry-form"]')).toBeVisible();
    });

    test('should enforce entry deadlines and prevent late entries', async () => {
      // Create show with entry deadline in the past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      const showData = ShowTestDataFactory.createShowData({
        entryCloseDate: pastDate.toISOString().split('T')[0]
      });
      
      const workflowData = { ...ShowTestDataFactory.createCompleteShowWorkflow(), show: showData };
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'publish'
      });
      
      // Verify entries are closed
      await expect(showTestHelper.page.locator('[data-testid="entry-status"]')).toContainText('Closed');
      await expect(showTestHelper.page.locator('[data-testid="enter-show-button"]')).toBeDisabled();
      await expect(showTestHelper.page.locator('[data-testid="entry-closed-message"]')).toContainText('Entry deadline has passed');
    });

    test('should handle show modifications after publication with restrictions', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      const showId = 'published-show-123';
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'publish'
      });
      
      // Test modification restrictions
      await showTestHelper.testShowModificationLimitations(showId);
      
      // Test allowed modifications
      await showTestHelper.page.click('[data-testid="edit-classes-button"]');
      await expect(showTestHelper.page.locator('[data-testid="class-modification-form"]')).toBeVisible();
      
      // Test entry management
      await showTestHelper.page.click('[data-testid="manage-entries-button"]');
      await expect(showTestHelper.page.locator('[data-testid="entry-management-interface"]')).toBeVisible();
    });

    test('should handle entry withdrawals and deadline enforcement', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'publish'
      });
      
      // Navigate to entry management
      await showTestHelper.page.click('[data-testid="manage-entries-button"]');
      
      // Test withdrawal within deadline
      await showTestHelper.page.click('[data-testid="entry-123"] [data-testid="withdraw-entry-button"]');
      await showTestHelper.page.fill('[data-testid="withdrawal-reason"]', 'Dog is injured');
      await showTestHelper.page.selectOption('[data-testid="refund-amount"]', 'full');
      await showTestHelper.page.click('[data-testid="confirm-withdrawal-button"]');
      
      // Verify withdrawal processed
      await expect(showTestHelper.page.locator('[data-testid="withdrawal-processed"]')).toBeVisible();
      
      // Test withdrawal past deadline (should have restrictions)
      // Simulate past withdrawal deadline
      await showTestHelper.page.evaluate(() => {
        localStorage.setItem('test_withdrawal_deadline_passed', 'true');
      });
      
      await showTestHelper.page.click('[data-testid="entry-456"] [data-testid="withdraw-entry-button"]');
      
      // Should show deadline warning
      await expect(showTestHelper.page.locator('[data-testid="withdrawal-deadline-warning"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="refund-amount"]')).toHaveValue('none'); // No refund past deadline
    });

    test('should generate and distribute show documentation', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'publish'
      });
      
      const showId = showTestHelper.page.url().split('/shows/')[1];
      await showTestHelper.generateShowReports(showId);
      
      // Test premium list generation
      await showTestHelper.page.click('[data-testid="generate-premium-list-button"]');
      await expect(showTestHelper.page.locator('[data-testid="premium-list-preview"]')).toBeVisible();
      
      // Test show confirmation generation
      await showTestHelper.page.click('[data-testid="generate-confirmation-button"]');
      await expect(showTestHelper.page.locator('[data-testid="confirmation-preview"]')).toBeVisible();
      
      // Test distribution
      await showTestHelper.page.click('[data-testid="distribute-documents-button"]');
      await showTestHelper.page.check('[data-testid="send-to-exhibitors"]');
      await showTestHelper.page.check('[data-testid="send-to-judges"]');
      await showTestHelper.page.click('[data-testid="send-documents-button"]');
      
      await expect(showTestHelper.page.locator('[data-testid="documents-sent"]')).toBeVisible();
    });

    test('should cancel show and process refunds appropriately', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'publish'
      });
      
      const showId = showTestHelper.page.url().split('/shows/')[1];
      
      // Test show cancellation
      await showTestHelper.cancelShow(showId, 'Venue unavailable due to emergency', 'full');
      
      // Verify cancellation was processed correctly
      await expect(showTestHelper.page.locator('[data-testid="show-status"]')).toContainText('Cancelled');
      await expect(showTestHelper.page.locator('[data-testid="cancellation-reason"]')).toContainText('Venue unavailable');
      
      // Check refund processing
      await showTestHelper.page.click('[data-testid="refund-processing-tab"]');
      await expect(showTestHelper.page.locator('[data-testid="refund-queue"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="total-refunds"]')).toBeVisible();
      
      // Test notification to exhibitors
      await expect(showTestHelper.page.locator('[data-testid="cancellation-notifications-sent"]')).toBeVisible();
    });
  });

  test.describe('Integration Tests: Complete Show Management Workflow', () => {
    
    test('should complete entire show creation workflow from start to publication', async () => {
      const workflowData = ShowTestDataFactory.createCompleteShowWorkflow();
      
      // Create complete show with all components
      await showTestHelper.createCompleteShow({
        showData: workflowData.show,
        trials: workflowData.trials,
        judges: workflowData.judges,
        action: 'create'
      });
      
      const showId = showTestHelper.page.url().split('/shows/')[1];
      
      // Verify all components were created correctly
      await showTestHelper.verifyShowCreation(workflowData.show, 'Unpublished');
      await showTestHelper.verifyTrialsCreation(workflowData.trials);
      await showTestHelper.verifyClassesCreation(workflowData.trials);
      
      // Publish the show
      await showTestHelper.publishShow(showId);
      
      // Test entry accessibility
      await showTestHelper.testEntryDeadlineEnforcement(showId);
      
      // Generate reports
      await showTestHelper.generateShowReports(showId);
      
      // Verify complete workflow
      await expect(showTestHelper.page.locator('[data-testid="show-status"]')).toContainText('Published');
      await expect(showTestHelper.page.locator('[data-testid="total-trials"]')).toContainText(workflowData.trials.length.toString());
      
      const totalClasses = workflowData.trials.reduce((sum, trial) => sum + trial.classes.length, 0);
      await expect(showTestHelper.page.locator('[data-testid="total-classes"]')).toContainText(totalClasses.toString());
    });

    test('should handle complex multi-day show with multiple trials per day', async () => {
      const showData = ShowTestDataFactory.createShowData({
        startDate: '2024-12-15',
        endDate: '2024-12-17' // 3-day show
      });
      
      const trials = [
        // Day 1
        ShowTestDataFactory.createTrialData({ name: 'Day 1 Morning Obedience', dateTime: '2024-12-15T09:00:00.000Z', type: 'Obedience' }),
        ShowTestDataFactory.createTrialData({ name: 'Day 1 Afternoon Agility', dateTime: '2024-12-15T13:00:00.000Z', type: 'Agility' }),
        // Day 2
        ShowTestDataFactory.createTrialData({ name: 'Day 2 Morning Conformation', dateTime: '2024-12-16T09:00:00.000Z', type: 'Conformation' }),
        ShowTestDataFactory.createTrialData({ name: 'Day 2 Afternoon Scent Work', dateTime: '2024-12-16T13:00:00.000Z', type: 'Scent Work' }),
        // Day 3
        ShowTestDataFactory.createTrialData({ name: 'Day 3 Rally', dateTime: '2024-12-17T09:00:00.000Z', type: 'Rally' }),
      ];
      
      const judges = [
        ShowTestDataFactory.createJudgeData({ specialties: ['All Breeds', 'Conformation'] }),
        ShowTestDataFactory.createJudgeData({ specialties: ['Obedience', 'Rally'] }),
        ShowTestDataFactory.createJudgeData({ specialties: ['Agility'] }),
        ShowTestDataFactory.createJudgeData({ specialties: ['Scent Work'] }),
      ];
      
      await showTestHelper.createCompleteShow({
        showData,
        trials,
        judges,
        action: 'publish'
      });
      
      // Verify multi-day scheduling
      await showTestHelper.page.click('[data-testid="show-schedule-tab"]');
      await expect(showTestHelper.page.locator('[data-testid="day-1-schedule"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="day-2-schedule"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="day-3-schedule"]')).toBeVisible();
      
      // Verify no scheduling conflicts
      await expect(showTestHelper.page.locator('[data-testid="schedule-conflicts"]')).not.toBeVisible();
      
      // Test entry workflow for multi-day show
      await showTestHelper.page.click('[data-testid="enter-show-button"]');
      await expect(showTestHelper.page.locator('[data-testid="multi-day-entry-form"]')).toBeVisible();
      await expect(showTestHelper.page.locator('[data-testid="day-selector"]')).toBeVisible();
    });
  });
});