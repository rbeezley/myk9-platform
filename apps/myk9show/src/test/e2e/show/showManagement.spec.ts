import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Show Management Workflow', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should create a new show with all required information', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows');
    
    // Click create new show button
    await page.click('[data-testid="create-new-show-button"]');
    
    // Fill out basic show information
    await page.fill('[data-testid="show-name-input"]', 'Annual Championship Dog Show');
    await page.fill('[data-testid="show-location-input"]', 'Springfield Convention Center');
    await page.fill('[data-testid="show-date-input"]', '2024-12-15');
    
    // Select organization
    await page.click('[data-testid="organization-select"]');
    await page.click('[data-testid="organization-option-akc"]');
    
    // Add show information
    await page.fill('[data-testid="show-description-textarea"]', 'Annual championship event featuring multiple breeds and competitions.');
    await page.fill('[data-testid="entry-deadline-input"]', '2024-11-15');
    
    // Set entry fees
    await page.fill('[data-testid="base-entry-fee-input"]', '35.00');
    await page.fill('[data-testid="additional-class-fee-input"]', '25.00');
    
    // Add judge information
    await page.click('[data-testid="add-judge-button"]');
    await page.fill('[data-testid="judge-name-input-0"]', 'Judge Sarah Wilson');
    await page.fill('[data-testid="judge-specialty-input-0"]', 'All Breeds');
    
    // Save the show
    await page.click('[data-testid="save-show-button"]');
    
    // Verify show was created
    await expect(page.locator('[data-testid="show-created-success-message"]')).toBeVisible();
    await expect(page.locator('text=Annual Championship Dog Show')).toBeVisible();
  });

  test('should edit existing show details', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows');
    
    // Find and edit an existing show
    await page.click('[data-testid="show-card-1"] [data-testid="edit-show-button"]');
    
    // Update show name
    await page.fill('[data-testid="show-name-input"]', 'Updated Championship Show');
    
    // Update location
    await page.fill('[data-testid="show-location-input"]', 'New Exhibition Hall');
    
    // Save changes
    await page.click('[data-testid="save-show-button"]');
    
    // Verify changes were saved
    await expect(page.locator('text=Updated Championship Show')).toBeVisible();
    await expect(page.locator('text=New Exhibition Hall')).toBeVisible();
  });

  test('should manage show trials and classes', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123');
    
    // Navigate to trials tab
    await page.click('[data-testid="show-trials-tab"]');
    
    // Add a new trial
    await page.click('[data-testid="add-trial-button"]');
    await page.fill('[data-testid="trial-name-input"]', 'Obedience Trial');
    await page.fill('[data-testid="trial-date-input"]', '2024-12-15');
    await page.fill('[data-testid="trial-start-time-input"]', '09:00');
    
    // Select trial type
    await page.click('[data-testid="trial-type-select"]');
    await page.click('[data-testid="trial-type-obedience"]');
    
    // Save trial
    await page.click('[data-testid="save-trial-button"]');
    
    // Verify trial was added
    await expect(page.locator('text=Obedience Trial')).toBeVisible();
    
    // Navigate to classes
    await page.click('[data-testid="trial-classes-tab"]');
    
    // Add classes to the trial
    await page.click('[data-testid="add-class-button"]');
    await page.fill('[data-testid="class-name-input"]', 'Novice A');
    await page.fill('[data-testid="class-height-input"]', '24');
    
    // Save class
    await page.click('[data-testid="save-class-button"]');
    
    // Verify class was added
    await expect(page.locator('text=Novice A')).toBeVisible();
  });

  test('should handle show status changes and publishing', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123');
    
    // Check current status
    await expect(page.locator('[data-testid="show-status-draft"]')).toBeVisible();
    
    // Publish the show
    await page.click('[data-testid="publish-show-button"]');
    
    // Confirm publication
    await page.click('[data-testid="confirm-publish-button"]');
    
    // Verify status changed
    await expect(page.locator('[data-testid="show-status-published"]')).toBeVisible();
    
    // Check that entries are now accepted
    await expect(page.locator('[data-testid="accepting-entries-indicator"]')).toBeVisible();
  });

  test('should manage judge assignments and scheduling', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/judges');
    
    // View judge schedule
    await expect(page.locator('[data-testid="judge-schedule-grid"]')).toBeVisible();
    
    // Assign judge to a class
    await page.click('[data-testid="class-novice-a"] [data-testid="assign-judge-button"]');
    
    // Select judge from dropdown
    await page.click('[data-testid="judge-select"]');
    await page.click('[data-testid="judge-option-sarah-wilson"]');
    
    // Set judging time
    await page.fill('[data-testid="judging-time-input"]', '10:30');
    
    // Save assignment
    await page.click('[data-testid="save-judge-assignment-button"]');
    
    // Verify assignment
    await expect(page.locator('[data-testid="class-novice-a"] text=Judge Sarah Wilson')).toBeVisible();
    await expect(page.locator('[data-testid="class-novice-a"] text=10:30')).toBeVisible();
  });

  test('should generate and export show documentation', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/reports');
    
    // Generate entry report
    await page.click('[data-testid="generate-entry-report-button"]');
    
    // Wait for report generation
    await expect(page.locator('[data-testid="report-generation-complete"]')).toBeVisible();
    
    // Check report preview
    await expect(page.locator('[data-testid="entry-report-preview"]')).toBeVisible();
    
    // Export as PDF
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-pdf-button"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('entry-report');
    
    // Generate judging schedule
    await page.click('[data-testid="generate-judging-schedule-button"]');
    await expect(page.locator('[data-testid="judging-schedule-preview"]')).toBeVisible();
  });

  test('should handle show cancellation and refund processing', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123');
    
    // Navigate to show settings
    await page.click('[data-testid="show-settings-tab"]');
    
    // Click cancel show button
    await page.click('[data-testid="cancel-show-button"]');
    
    // Fill cancellation reason
    await page.fill('[data-testid="cancellation-reason-textarea"]', 'Venue unavailable due to emergency');
    
    // Select refund policy
    await page.click('[data-testid="refund-policy-select"]');
    await page.click('[data-testid="refund-policy-full"]');
    
    // Confirm cancellation
    await page.click('[data-testid="confirm-cancellation-button"]');
    
    // Verify show status
    await expect(page.locator('[data-testid="show-status-cancelled"]')).toBeVisible();
    
    // Check refund processing
    await page.click('[data-testid="refund-processing-tab"]');
    await expect(page.locator('[data-testid="refund-queue"]')).toBeVisible();
  });

  test('should manage show capacity and entry limits', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/settings');
    
    // Set overall show capacity
    await page.fill('[data-testid="total-capacity-input"]', '500');
    
    // Set class-specific limits
    await page.click('[data-testid="class-limits-tab"]');
    await page.fill('[data-testid="novice-a-limit-input"]', '50');
    await page.fill('[data-testid="open-limit-input"]', '75');
    
    // Enable waitlists
    await page.check('[data-testid="enable-waitlists-checkbox"]');
    
    // Save settings
    await page.click('[data-testid="save-capacity-settings-button"]');
    
    // Verify settings saved
    await expect(page.locator('[data-testid="capacity-saved-message"]')).toBeVisible();
    
    // Check capacity display
    await page.goto('/shows/show-123');
    await expect(page.locator('[data-testid="show-capacity"] text=500')).toBeVisible();
  });

  test('should handle show communication and announcements', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/communications');
    
    // Create an announcement
    await page.click('[data-testid="create-announcement-button"]');
    await page.fill('[data-testid="announcement-title-input"]', 'Important Update: Schedule Change');
    await page.fill('[data-testid="announcement-content-textarea"]', 'The judging schedule has been updated. Please check the latest times.');
    
    // Set notification preferences
    await page.check('[data-testid="notify-email-checkbox"]');
    await page.check('[data-testid="notify-app-checkbox"]');
    
    // Publish announcement
    await page.click('[data-testid="publish-announcement-button"]');
    
    // Verify announcement is visible
    await expect(page.locator('text=Important Update: Schedule Change')).toBeVisible();
    
    // Send bulk email
    await page.click('[data-testid="bulk-email-tab"]');
    await page.fill('[data-testid="email-subject-input"]', 'Show Day Reminders');
    await page.fill('[data-testid="email-content-textarea"]', 'Please arrive 30 minutes before your first class.');
    
    // Select recipients
    await page.click('[data-testid="recipient-all-exhibitors"]');
    
    // Send email
    await page.click('[data-testid="send-bulk-email-button"]');
    await expect(page.locator('[data-testid="email-sent-confirmation"]')).toBeVisible();
  });

  test('should track show analytics and performance metrics', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/analytics');
    
    // View registration metrics
    await expect(page.locator('[data-testid="total-entries-metric"]')).toBeVisible();
    await expect(page.locator('[data-testid="revenue-metric"]')).toBeVisible();
    
    // Check registration timeline
    await expect(page.locator('[data-testid="registration-timeline-chart"]')).toBeVisible();
    
    // View class popularity
    await page.click('[data-testid="class-analytics-tab"]');
    await expect(page.locator('[data-testid="class-popularity-chart"]')).toBeVisible();
    
    // Export analytics report
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-analytics-button"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('analytics');
  });
});