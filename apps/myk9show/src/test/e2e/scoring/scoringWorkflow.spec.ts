import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Scoring Workflow', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete basic conformation scoring workflow', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/class-123/scoring');
    
    // Verify class information is displayed
    await expect(page.locator('[data-testid="class-name"]')).toContainText('Novice A');
    await expect(page.locator('[data-testid="judge-name"]')).toContainText('Judge Wilson');
    
    // Start scoring session
    await page.click('[data-testid="start-scoring-button"]');
    
    // Verify entries are loaded
    await expect(page.locator('[data-testid="entry-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="entry-card"]')).toHaveCount(5);
    
    // Score first dog
    await page.click('[data-testid="entry-card-1"] [data-testid="score-dog-button"]');
    
    // Individual examination scores
    await page.click('[data-testid="head-score-excellent"]');
    await page.click('[data-testid="body-score-very-good"]');
    await page.click('[data-testid="movement-score-excellent"]');
    await page.click('[data-testid="temperament-score-excellent"]');
    
    // Add judge notes
    await page.fill('[data-testid="judge-notes-textarea"]', 'Beautiful head type, strong movement, excellent temperament.');
    
    // Save individual scores
    await page.click('[data-testid="save-individual-scores-button"]');
    
    // Continue with remaining dogs
    for (let i = 2; i <= 5; i++) {
      await page.click(`[data-testid="entry-card-${i}"] [data-testid="score-dog-button"]`);
      await page.click('[data-testid="head-score-good"]');
      await page.click('[data-testid="body-score-good"]');
      await page.click('[data-testid="movement-score-good"]');
      await page.click('[data-testid="temperament-score-good"]');
      await page.click('[data-testid="save-individual-scores-button"]');
    }
    
    // Final ranking
    await page.click('[data-testid="final-ranking-tab"]');
    
    // Drag and drop to set placements
    await page.dragAndDrop('[data-testid="entry-1"]', '[data-testid="placement-1"]');
    await page.dragAndDrop('[data-testid="entry-3"]', '[data-testid="placement-2"]');
    await page.dragAndDrop('[data-testid="entry-2"]', '[data-testid="placement-3"]');
    await page.dragAndDrop('[data-testid="entry-5"]', '[data-testid="placement-4"]');
    
    // Add final comments
    await page.fill('[data-testid="final-comments-textarea"]', 'Excellent quality class with strong competition.');
    
    // Submit scores
    await page.click('[data-testid="submit-scores-button"]');
    
    // Verify submission confirmation
    await expect(page.locator('[data-testid="scores-submitted-message"]')).toBeVisible();
  });

  test('should handle obedience trial scoring', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/trial-456/scoring');
    
    // Select scoring type
    await page.click('[data-testid="scoring-type-obedience"]');
    
    // Start judging first exercise
    await page.click('[data-testid="exercise-heel-free"]');
    
    // Score each dog for the exercise
    await page.click('[data-testid="dog-1-score-button"]');
    await page.fill('[data-testid="points-input"]', '38');
    await page.selectOption('[data-testid="qualifying-select"]', 'yes');
    await page.fill('[data-testid="exercise-notes"]', 'Excellent attention, minor lagging on about turn.');
    await page.click('[data-testid="save-exercise-score"]');
    
    // Continue with remaining dogs
    await page.click('[data-testid="dog-2-score-button"]');
    await page.fill('[data-testid="points-input"]', '35');
    await page.selectOption('[data-testid="qualifying-select"]', 'yes');
    await page.click('[data-testid="save-exercise-score"]');
    
    // Move to next exercise
    await page.click('[data-testid="next-exercise-button"]');
    await expect(page.locator('[data-testid="current-exercise"]')).toContainText('Stand for Examination');
    
    // Complete all exercises
    const exercises = ['Stand for Examination', 'Recall', 'Sit Stay', 'Down Stay'];
    for (const exercise of exercises) {
      await page.click('[data-testid="dog-1-score-button"]');
      await page.fill('[data-testid="points-input"]', '38');
      await page.selectOption('[data-testid="qualifying-select"]', 'yes');
      await page.click('[data-testid="save-exercise-score"]');
      
      if (exercise !== 'Down Stay') {
        await page.click('[data-testid="next-exercise-button"]');
      }
    }
    
    // Calculate final scores
    await page.click('[data-testid="calculate-totals-button"]');
    
    // Verify final scores
    await expect(page.locator('[data-testid="dog-1-total-score"]')).toContainText('190');
    await expect(page.locator('[data-testid="dog-1-final-qualifying"]')).toContainText('Yes');
    
    // Submit trial results
    await page.click('[data-testid="submit-trial-results-button"]');
    await expect(page.locator('[data-testid="trial-results-submitted"]')).toBeVisible();
  });

  test('should handle agility scoring with faults and time', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/agility-789/scoring');
    
    // Set course parameters
    await page.fill('[data-testid="standard-course-time"]', '45');
    await page.fill('[data-testid="course-length"]', '150');
    
    // Start timing first dog
    await page.click('[data-testid="dog-1-run-button"]');
    await page.click('[data-testid="start-timer-button"]');
    
    // Record faults during run
    await page.click('[data-testid="knocked-bar-button"]'); // 5 faults
    await page.click('[data-testid="wrong-course-button"]'); // Elimination
    
    // Stop timer
    await page.click('[data-testid="stop-timer-button"]');
    
    // Verify automatic calculation
    await expect(page.locator('[data-testid="dog-1-status"]')).toContainText('Eliminated');
    
    // Score next dog - clean run
    await page.click('[data-testid="dog-2-run-button"]');
    await page.click('[data-testid="start-timer-button"]');
    
    // Simulate clean run - wait then stop
    await page.waitForTimeout(2000);
    await page.click('[data-testid="stop-timer-button"]');
    
    // Verify time recorded
    await expect(page.locator('[data-testid="dog-2-time"]')).toContainText('42.5');
    await expect(page.locator('[data-testid="dog-2-faults"]')).toContainText('0');
    await expect(page.locator('[data-testid="dog-2-status"]')).toContainText('Qualifying');
    
    // Score dog with time fault
    await page.click('[data-testid="dog-3-run-button"]');
    await page.click('[data-testid="start-timer-button"]');
    await page.waitForTimeout(3000);
    await page.click('[data-testid="stop-timer-button"]');
    
    // Should show time fault
    await expect(page.locator('[data-testid="dog-3-time"]')).toContainText('48.2');
    await expect(page.locator('[data-testid="dog-3-faults"]')).toContainText('3.2'); // Time faults
    
    // Generate final results
    await page.click('[data-testid="generate-results-button"]');
    
    // Verify results ranking
    await expect(page.locator('[data-testid="placement-1"]')).toContainText('Dog 2');
    await expect(page.locator('[data-testid="placement-2"]')).toContainText('Dog 3');
    
    // Submit results
    await page.click('[data-testid="submit-agility-results-button"]');
    await expect(page.locator('[data-testid="results-submitted-confirmation"]')).toBeVisible();
  });

  test('should handle rally scoring with course map', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/rally-101/scoring');
    
    // Load course map
    await expect(page.locator('[data-testid="rally-course-map"]')).toBeVisible();
    await expect(page.locator('[data-testid="station-count"]')).toContainText('12 stations');
    
    // Start first team
    await page.click('[data-testid="team-1-start-button"]');
    
    // Score each station
    for (let station = 1; station <= 12; station++) {
      await page.click(`[data-testid="station-${station}-button"]`);
      
      if (station === 3) {
        // Deduct points at station 3
        await page.click('[data-testid="deduction-1-point"]');
        await page.fill('[data-testid="deduction-reason"]', 'Slow response to sit command');
      } else if (station === 8) {
        // Major deduction at station 8
        await page.click('[data-testid="deduction-3-points"]');
        await page.fill('[data-testid="deduction-reason"]', 'Handler guided dog');
      }
      
      await page.click('[data-testid="station-complete-button"]');
    }
    
    // Final score calculation
    await page.click('[data-testid="calculate-final-score-button"]');
    
    // Verify score calculation (100 - 4 deductions = 96)
    await expect(page.locator('[data-testid="team-1-final-score"]')).toContainText('96');
    await expect(page.locator('[data-testid="team-1-qualifying"]')).toContainText('Yes');
    
    // Continue with remaining teams
    await page.click('[data-testid="next-team-button"]');
    
    // Complete scoring session
    await page.click('[data-testid="complete-rally-scoring-button"]');
    await expect(page.locator('[data-testid="rally-scoring-complete"]')).toBeVisible();
  });

  test('should handle scoring corrections and revisions', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/class-123/scoring');
    
    // Complete initial scoring
    await page.click('[data-testid="start-scoring-button"]');
    
    // Score a dog initially
    await page.click('[data-testid="entry-card-1"] [data-testid="score-dog-button"]');
    await page.click('[data-testid="head-score-good"]');
    await page.click('[data-testid="save-individual-scores-button"]');
    
    // Realize mistake and need to correct
    await page.click('[data-testid="entry-card-1"] [data-testid="edit-scores-button"]');
    
    // Update the score
    await page.click('[data-testid="head-score-excellent"]');
    await page.fill('[data-testid="correction-reason"]', 'Initial assessment was too conservative');
    
    // Save correction
    await page.click('[data-testid="save-correction-button"]');
    
    // Verify correction is tracked
    await expect(page.locator('[data-testid="score-history-button"]')).toBeVisible();
    await page.click('[data-testid="score-history-button"]');
    
    // Check audit trail
    await expect(page.locator('[data-testid="score-change-log"]')).toContainText('Head: Good → Excellent');
    await expect(page.locator('[data-testid="correction-timestamp"]')).toBeVisible();
  });

  test('should support offline scoring with sync', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/class-123/scoring');
    
    // Enable offline mode
    await page.click('[data-testid="offline-mode-toggle"]');
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Score dogs while offline
    await page.click('[data-testid="start-scoring-button"]');
    await page.click('[data-testid="entry-card-1"] [data-testid="score-dog-button"]');
    await page.click('[data-testid="head-score-excellent"]');
    await page.click('[data-testid="save-individual-scores-button"]');
    
    // Verify data saved locally
    await expect(page.locator('[data-testid="offline-data-indicator"]')).toBeVisible();
    
    // Go back online
    await page.click('[data-testid="offline-mode-toggle"]');
    
    // Wait for sync
    await expect(page.locator('[data-testid="sync-in-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible();
    
    // Verify data synced
    await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();
  });

  test('should generate detailed scoring reports', async ({ page }) => {
    await testSetup.signIn('judge');
    await page.goto('/judge/class-123/reports');
    
    // Access completed scoring session
    await page.click('[data-testid="completed-class-123"]');
    
    // Generate individual score report
    await page.click('[data-testid="generate-individual-report-button"]');
    await expect(page.locator('[data-testid="individual-scores-report"]')).toBeVisible();
    
    // Check report contains all required elements
    await expect(page.locator('[data-testid="judge-signature-line"]')).toBeVisible();
    await expect(page.locator('[data-testid="class-details-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="placement-results-section"]')).toBeVisible();
    
    // Export as PDF
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-scoring-report-pdf"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('scoring-report');
    
    // Generate summary report for show
    await page.click('[data-testid="show-summary-report-button"]');
    await expect(page.locator('[data-testid="show-summary-content"]')).toBeVisible();
    
    // Export summary
    const summaryDownloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-summary-pdf"]');
    const summaryDownload = await summaryDownloadPromise;
    expect(summaryDownload.suggestedFilename()).toContain('show-summary');
  });

  test('should handle scoring disputes and appeals', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/secretary/scoring-disputes');
    
    // View submitted dispute
    await expect(page.locator('[data-testid="dispute-list"]')).toBeVisible();
    await page.click('[data-testid="dispute-case-1"]');
    
    // Review dispute details
    await expect(page.locator('[data-testid="dispute-class"]')).toContainText('Novice A');
    await expect(page.locator('[data-testid="dispute-reason"]')).toBeVisible();
    await expect(page.locator('[data-testid="original-scores"]')).toBeVisible();
    
    // Add superintendent notes
    await page.fill('[data-testid="superintendent-notes"]', 'Reviewing scoring sheets and video footage.');
    
    // Request judge review
    await page.click('[data-testid="request-judge-review-button"]');
    
    // Switch to judge perspective
    await testSetup.signIn('judge');
    await page.goto('/judge/dispute-reviews');
    
    // Review the dispute
    await page.click('[data-testid="dispute-case-1"]');
    await expect(page.locator('[data-testid="original-scoring-notes"]')).toBeVisible();
    
    // Provide judge response
    await page.fill('[data-testid="judge-response"]', 'After review, original placement stands. Detailed reasoning attached.');
    await page.click('[data-testid="submit-judge-response-button"]');
    
    // Verify dispute resolution
    await expect(page.locator('[data-testid="dispute-resolved-indicator"]')).toBeVisible();
  });
});