import { Page, expect } from '@playwright/test';
import { TestSetup } from './testSetup';
import { ShowTestDataFactory, type ShowTestData, type TrialTestData, type JudgeTestData } from './showTestDataFactory';
import { logger } from '@/services/LoggingService';

/* eslint-disable @typescript-eslint/no-unused-vars */

export class ShowTestHelper extends TestSetup {
  public page: Page;
  private testData: Record<string, unknown> = {};

  constructor(page: Page) {
    super(page);
    this.page = page;
    this.testData = {};
  }

  /**
   * Navigate to show management page
   */
  async goToShowManagement() {
    await this.page.goto('/shows');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to show creation wizard (full-page)
   */
  async goToShowCreationWizard() {
    await this.page.goto('/secretary/create-show/wizard');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to specific show details page
   */
  async goToShowDetails(showId: string) {
    await this.page.goto(`/shows/${showId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Complete show details step in wizard
   */
  async fillShowDetails(showData: ShowTestData) {
    // Wait for step to be active
    await expect(this.page.locator('[data-testid="step-indicator"]')).toContainText('Show Details');
    
    // Fill basic information
    await this.page.fill('[data-testid="show-name-input"]', showData.name);
    
    // Select show type
    await this.page.selectOption('[data-testid="show-type-select"]', showData.type);
    
    // Fill dates
    await this.page.fill('[data-testid="start-date-input"]', showData.startDate);
    await this.page.fill('[data-testid="end-date-input"]', showData.endDate);
    
    // Fill location
    await this.page.fill('[data-testid="location-input"]', showData.location);
    
    // Select club (assuming club exists)
    await this.page.selectOption('[data-testid="club-select"]', showData.clubId);
    
    // Fill entry dates
    await this.page.fill('[data-testid="entry-open-date-input"]', showData.entryOpenDate);
    await this.page.fill('[data-testid="entry-close-date-input"]', showData.entryCloseDate);
    
    // Fill fees
    await this.page.fill('[data-testid="pre-entry-fee-input"]', showData.preEntryFee.toString());
    await this.page.fill('[data-testid="day-of-show-fee-input"]', showData.dayOfShowFee.toString());
    
    // Fill staff
    await this.page.fill('[data-testid="chairman-input"]', showData.chairman);
    await this.page.fill('[data-testid="secretary-input"]', showData.secretary);
    
    // Select judges (multi-select)
    for (const judgeId of showData.judgeIds) {
      await this.page.selectOption('[data-testid="judges-multi-select"]', judgeId);
    }
  }

  /**
   * Add a trial in the wizard
   */
  async addTrial(trialData: TrialTestData) {
    // Ensure we're on trials step
    await this.page.click('[data-testid="add-trial-button"]');
    
    // Fill trial details
    await this.page.fill('[data-testid="trial-name-input"]', trialData.name);
    
    // Handle date/time input - split the dateTime into date and time components
    const date = trialData.dateTime.split('T')[0];
    const time = trialData.dateTime.split('T')[1].substring(0, 5); // Get HH:MM format
    
    await this.page.fill('[data-testid="trial-date-input"]', date);
    await this.page.fill('[data-testid="trial-time-input"]', time);
    
    await this.page.fill('[data-testid="event-number-input"]', trialData.eventNumber);
    
    // Select trial type
    await this.page.selectOption('[data-testid="trial-type-select"]', trialData.type);
    
    // Save trial
    await this.page.click('[data-testid="save-trial-button"]');
    
    // Wait for trial to be added to the list
    await expect(this.page.locator(`[data-testid="trial-item-${trialData.id}"]`)).toBeVisible();
  }

  /**
   * Select classes from templates in wizard
   */
  async selectClassesFromTemplate(templateId: string, classNames: string[]) {
    // Ensure we're on class selection step
    await expect(this.page.locator('[data-testid="step-indicator"]')).toContainText('Classes');
    
    // Select template if not already selected
    await this.page.click(`[data-testid="template-${templateId}"]`);
    
    // Select individual classes
    for (const className of classNames) {
      const checkboxSelector = `[data-testid="class-checkbox-${className.replace(/\s+/g, '-')}"]`;
      await this.page.check(checkboxSelector);
    }
    
    // Verify selection count
    const expectedCount = classNames.length;
    await expect(this.page.locator('[data-testid="selected-classes-count"]')).toContainText(`${expectedCount} selected`);
  }

  /**
   * Assign judges to classes
   */
  async assignJudgesToClasses(assignments: Array<{ className: string; judgeId: string; time?: string }>) {
    for (const assignment of assignments) {
      const classSelector = `[data-testid="class-${assignment.className.replace(/\s+/g, '-')}"]`;
      
      // Open judge assignment dialog
      await this.page.click(`${classSelector} [data-testid="assign-judge-button"]`);
      
      // Select judge
      await this.page.selectOption('[data-testid="judge-select"]', assignment.judgeId);
      
      // Set judging time if provided
      if (assignment.time) {
        await this.page.fill('[data-testid="judging-time-input"]', assignment.time);
      }
      
      // Save assignment
      await this.page.click('[data-testid="save-judge-assignment-button"]');
      
      // Verify assignment
      await expect(this.page.locator(`${classSelector} [data-testid="assigned-judge"]`)).toBeVisible();
    }
  }

  /**
   * Complete the entire show creation wizard
   */
  async createCompleteShow(options: {
    showData: ShowTestData;
    trials: TrialTestData[];
    judges: JudgeTestData[];
    action: 'draft' | 'create' | 'publish';
  }) {
    const { showData, trials, judges, action } = options;
    
    // Step 1: Show Details
    await this.fillShowDetails(showData);
    await this.page.click('[data-testid="next-step-button"]');
    
    // Step 2: Trials
    for (const trial of trials) {
      await this.addTrial(trial);
    }
    await this.page.click('[data-testid="next-step-button"]');
    
    // Step 3: Classes (assuming trials have classes defined)
    const allClasses = trials.flatMap(trial => trial.classes);
    if (allClasses.length > 0) {
      // For each unique template, select its classes
      const templateGroups = new Map<string, string[]>();
      allClasses.forEach(cls => {
        const className = cls.customizations.className;
        if (!templateGroups.has(cls.templateId)) {
          templateGroups.set(cls.templateId, []);
        }
        templateGroups.get(cls.templateId)!.push(className);
      });
      
      for (const [templateId, classNames] of Array.from(templateGroups.entries())) {
        await this.selectClassesFromTemplate(templateId, classNames);
      }
    }
    await this.page.click('[data-testid="next-step-button"]');
    
    // Step 4: Review and Create
    await expect(this.page.locator('[data-testid="step-indicator"]')).toContainText('Review');
    
    // Execute the selected action
    switch (action) {
      case 'draft':
        await this.page.click('[data-testid="save-draft-button"]');
        break;
      case 'create':
        await this.page.click('[data-testid="create-show-button"]');
        break;
      case 'publish':
        await this.page.click('[data-testid="create-and-publish-button"]');
        break;
    }
    
    // Wait for success and navigation
    await this.page.waitForURL(/\/shows\/.*/, { timeout: 10000 });
  }

  /**
   * Verify show was created correctly
   */
  async verifyShowCreation(showData: ShowTestData, expectedStatus: string) {
    // Check show details
    await expect(this.page.locator('[data-testid="show-name"]')).toContainText(showData.name);
    await expect(this.page.locator('[data-testid="show-type"]')).toContainText(showData.type);
    await expect(this.page.locator('[data-testid="show-location"]')).toContainText(showData.location);
    await expect(this.page.locator('[data-testid="show-status"]')).toContainText(expectedStatus);
    
    // Check dates
    await expect(this.page.locator('[data-testid="start-date"]')).toContainText(showData.startDate);
    await expect(this.page.locator('[data-testid="end-date"]')).toContainText(showData.endDate);
    
    // Check fees
    await expect(this.page.locator('[data-testid="pre-entry-fee"]')).toContainText(showData.preEntryFee.toString());
    await expect(this.page.locator('[data-testid="day-of-show-fee"]')).toContainText(showData.dayOfShowFee.toString());
    
    // Check staff
    await expect(this.page.locator('[data-testid="chairman"]')).toContainText(showData.chairman);
    await expect(this.page.locator('[data-testid="secretary"]')).toContainText(showData.secretary);
  }

  /**
   * Verify trials were created correctly
   */
  async verifyTrialsCreation(trials: TrialTestData[]) {
    // Navigate to trials tab
    await this.page.click('[data-testid="show-trials-tab"]');
    
    for (const trial of trials) {
      const trialSelector = `[data-testid="trial-${trial.id}"]`;
      await expect(this.page.locator(trialSelector)).toBeVisible();
      await expect(this.page.locator(`${trialSelector} [data-testid="trial-name"]`)).toContainText(trial.name);
      await expect(this.page.locator(`${trialSelector} [data-testid="trial-type"]`)).toContainText(trial.type);
      await expect(this.page.locator(`${trialSelector} [data-testid="event-number"]`)).toContainText(trial.eventNumber);
    }
  }

  /**
   * Verify classes were created correctly
   */
  async verifyClassesCreation(trials: TrialTestData[]) {
    for (const trial of trials) {
      // Navigate to trial classes
      await this.page.click(`[data-testid="trial-${trial.id}"] [data-testid="view-classes-button"]`);
      
      for (const cls of trial.classes) {
        const className = cls.customizations.className;
        const classSelector = `[data-testid="class-${className.replace(/\s+/g, '-')}"]`;
        
        await expect(this.page.locator(classSelector)).toBeVisible();
        await expect(this.page.locator(`${classSelector} [data-testid="class-name"]`)).toContainText(className);
        
        if (cls.customizations.element) {
          await expect(this.page.locator(`${classSelector} [data-testid="class-element"]`)).toContainText(cls.customizations.element);
        }
        
        if (cls.customizations.level) {
          await expect(this.page.locator(`${classSelector} [data-testid="class-level"]`)).toContainText(cls.customizations.level);
        }
      }
      
      // Go back to show details
      await this.page.click('[data-testid="back-to-show-button"]');
    }
  }

  /**
   * Publish a show
   */
  async publishShow(showId: string) {
    await this.goToShowDetails(showId);
    
    // Check current status
    await expect(this.page.locator('[data-testid="show-status"]')).not.toContainText('Published');
    
    // Click publish button
    await this.page.click('[data-testid="publish-show-button"]');
    
    // Confirm publication in dialog
    await this.page.click('[data-testid="confirm-publish-button"]');
    
    // Verify status changed
    await expect(this.page.locator('[data-testid="show-status"]')).toContainText('Published');
    
    // Check that entries are now accepted
    await expect(this.page.locator('[data-testid="accepting-entries-indicator"]')).toBeVisible();
  }

  /**
   * Test show modification after publication
   */
  async testShowModificationLimitations(showId: string) {
    await this.goToShowDetails(showId);
    
    // Published shows should have limited editing capabilities
    await expect(this.page.locator('[data-testid="edit-show-button"]')).toBeDisabled();
    
    // But should allow some modifications
    await expect(this.page.locator('[data-testid="edit-classes-button"]')).toBeEnabled();
    await expect(this.page.locator('[data-testid="manage-entries-button"]')).toBeEnabled();
  }

  /**
   * Cancel a show and process refunds
   */
  async cancelShow(showId: string, reason: string, refundPolicy: 'full' | 'partial' | 'none') {
    await this.goToShowDetails(showId);
    
    // Navigate to show settings
    await this.page.click('[data-testid="show-settings-tab"]');
    
    // Click cancel show button
    await this.page.click('[data-testid="cancel-show-button"]');
    
    // Fill cancellation form
    await this.page.fill('[data-testid="cancellation-reason-textarea"]', reason);
    await this.page.selectOption('[data-testid="refund-policy-select"]', refundPolicy);
    
    // Confirm cancellation
    await this.page.click('[data-testid="confirm-cancellation-button"]');
    
    // Verify show status
    await expect(this.page.locator('[data-testid="show-status"]')).toContainText('Cancelled');
    
    // Check refund processing if applicable
    if (refundPolicy !== 'none') {
      await this.page.click('[data-testid="refund-processing-tab"]');
      await expect(this.page.locator('[data-testid="refund-queue"]')).toBeVisible();
    }
  }

  /**
   * Test entry deadline enforcement
   */
  async testEntryDeadlineEnforcement(showId: string) {
    await this.goToShowDetails(showId);
    
    // Check if entry period is active/closed based on dates
    const entryStatus = await this.page.locator('[data-testid="entry-status"]');
    
    // Test entry form accessibility
    if (await entryStatus.textContent() === 'Open') {
      await expect(this.page.locator('[data-testid="enter-show-button"]')).toBeEnabled();
    } else {
      await expect(this.page.locator('[data-testid="enter-show-button"]')).toBeDisabled();
      await expect(this.page.locator('[data-testid="entry-closed-message"]')).toBeVisible();
    }
  }

  /**
   * Generate show reports
   */
  async generateShowReports(showId: string) {
    await this.goToShowDetails(showId);
    await this.page.click('[data-testid="reports-tab"]');
    
    // Generate entry report
    await this.page.click('[data-testid="generate-entry-report-button"]');
    await expect(this.page.locator('[data-testid="report-generation-complete"]')).toBeVisible();
    
    // Export as PDF
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.click('[data-testid="export-pdf-button"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('entry-report');
    
    // Generate judging schedule
    await this.page.click('[data-testid="generate-judging-schedule-button"]');
    await expect(this.page.locator('[data-testid="judging-schedule-preview"]')).toBeVisible();
  }

  /**
   * Enhanced helper methods for Phase 5 comprehensive testing
   */
  
  /**
   * Create test club with enhanced data
   */
  async createTestClub(clubData: Record<string, unknown>) {
    // Mock the club creation
    const clubId = `club-${Date.now()}`;
    this.testData = this.testData || {};
    this.testData.clubs = this.testData.clubs || [];
    this.testData.clubs.push({ ...clubData, id: clubId });
    return clubId;
  }

  /**
   * Create test judges with certification data
   */
  async createTestJudges(judges: Record<string, unknown>[]) {
    this.testData = this.testData || {};
    this.testData.judges = this.testData.judges || [];
    
    for (const judge of judges) {
      const judgeId = `judge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.testData.judges.push({ ...judge, id: judgeId });
    }
    
    return this.testData.judges;
  }

  /**
   * Create test exhibitors
   */
  async createTestExhibitors(exhibitors: Record<string, unknown>[]) {
    this.testData = this.testData || {};
    this.testData.exhibitors = this.testData.exhibitors || [];
    
    for (const exhibitor of exhibitors) {
      this.testData.exhibitors.push(exhibitor);
    }
  }

  /**
   * Create test dogs with owner relationships
   */
  async createTestDogs(dogs: Record<string, unknown>[]) {
    this.testData = this.testData || {};
    this.testData.dogs = this.testData.dogs || [];
    
    for (const dog of dogs) {
      this.testData.dogs.push(dog);
    }
  }

  /**
   * Get show class IDs from test data
   */
  async getShowClassIds(showId: string) {
    // Return mock class IDs for testing
    return ['class-1', 'class-2', 'class-3'];
  }

  /**
   * Create test entry with payment processing
   */
  async createTestEntry(entryData: Record<string, unknown>) {
    this.testData = this.testData || {};
    this.testData.entries = this.testData.entries || [];
    
    const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.testData.entries.push({ ...entryData, id: entryId });
    
    return entryId;
  }

  /**
   * Get show entries for verification
   */
  async getShowEntries(showId: string) {
    return this.testData?.entries || [];
  }

  /**
   * Judge a class with results
   */
  async judgeClass(classId: string, results: Record<string, unknown>[]) {
    this.testData = this.testData || {};
    this.testData.results = this.testData.results || {};
    this.testData.results[classId] = results;
    
    // Simulate judging interface interaction
    logger.debug(`Judging class ${classId} with ${results.length} results`, 'app', {});
  }

  /**
   * Get class results for verification
   */
  async getClassResults(classId: string) {
    return this.testData?.results?.[classId] || [];
  }

  /**
   * Process trial awards
   */
  async processTrialAwards(trialId: string) {
    // Mock awards processing
    const awards = [
      {
        type: 'High_In_Trial',
        dogId: 'dog-2',
        awardName: 'High In Trial',
        points: 200
      },
      {
        type: 'Class_Winner',
        dogId: 'dog-1',
        awardName: 'First Place - Novice A',
        points: 15
      }
    ];
    
    this.testData = this.testData || {};
    this.testData.awards = this.testData.awards || {};
    this.testData.awards[trialId] = awards;
    
    return awards;
  }

  /**
   * Publish show results
   */
  async publishShowResults(showId: string) {
    logger.debug(`Publishing results for show ${showId}`, 'app', {});
    // Mock results publication
  }

  /**
   * Complete show workflow
   */
  async completeShowWorkflow(showId: string) {
    logger.debug(`Completing workflow for show ${showId}`, 'app', {});
    // Mock show completion workflow
  }

  /**
   * Mock show-related API responses
   */
  async mockShowApiResponses() {
    // Initialize test data storage
    this.testData = {};
    
    // Mock show management APIs
    await this.page.route('**/api/shows/**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      
      if (method === 'POST') {
        // Create show
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            id: `show-${Date.now()}`,
            ...JSON.parse(route.request().postData() || '{}')
          })
        });
      } else if (method === 'PUT') {
        // Update show
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        // Get shows
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });

    // Mock trial APIs
    await this.page.route('**/api/trials/**', async (route) => {
      const method = route.request().method();
      
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            id: `trial-${Date.now()}`,
            ...JSON.parse(route.request().postData() || '{}')
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });

    // Mock class APIs
    await this.page.route('**/api/classes/**', async (route) => {
      const method = route.request().method();
      
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            id: `class-${Date.now()}`,
            ...JSON.parse(route.request().postData() || '{}')
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });

    // Mock club APIs
    await this.page.route('**/api/clubs/**', async (route) => {
      const testClub = ShowTestDataFactory.createClubData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([testClub])
      });
    });

    // Mock judge APIs
    await this.page.route('**/api/judges/**', async (route) => {
      const testJudges = [
        ShowTestDataFactory.createJudgeData(),
        ShowTestDataFactory.createJudgeData(),
        ShowTestDataFactory.createJudgeData(),
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testJudges)
      });
    });
  }
}