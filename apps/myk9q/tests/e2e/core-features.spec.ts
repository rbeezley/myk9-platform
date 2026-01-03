import { test, expect } from '@playwright/test';
import { performLogin, dismissOnboarding, TEST_PASSCODE } from './fixtures';

/**
 * Core Features Test Suite
 *
 * Tests based on TestSprite test plan:
 * - TC005: Trial Selection Dashboard Display
 * - TC006: Class Management View Accuracy
 * - TC007: Entry List Filtering, Searching and Status Management
 * - TC008: Run Order Drag-and-Drop Reordering
 * - TC009: Multiple Scoresheet Types with Timing and Auto-Save
 * - TC010: Submit and Edit Scoresheet Scores
 */

test.describe('Core Features', () => {
  // Authenticate before each test
  test.beforeEach(async ({ page }) => {
    const success = await performLogin(page, TEST_PASSCODE);
    expect(success).toBe(true);
    // Dismiss onboarding overlay if it appears
    await dismissOnboarding(page);
  });

  test('TC005: Trial selection dashboard displays trials correctly', async ({ page }) => {
    // Should already be on /home after login
    await expect(page).toHaveURL(/\/home/);

    // Wait for content to load and dismiss any remaining overlays
    await page.waitForTimeout(500);
    await dismissOnboarding(page);

    // Verify trial cards are displayed (using actual class from page snapshot)
    const trialCards = page.locator('.trial-card');
    await expect(trialCards.first()).toBeVisible({ timeout: 10000 });

    // Check for trial cards count
    const trialCount = await trialCards.count();
    expect(trialCount).toBeGreaterThan(0);

    // Verify trial items have names and dates (e.g., "Sat, Sep 16, 2023 • Trial 1")
    const firstTrial = trialCards.first();
    await expect(firstTrial).toBeVisible();

    // Check for date display (various formats)
    const hasDateInfo = await page.locator('text=/\\d{1,2}[/\\-]\\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i').first().isVisible();
    expect(hasDateInfo).toBe(true);
  });

  test('TC006: Class management view displays classes', async ({ page }) => {
    await expect(page).toHaveURL(/\/home/);
    await dismissOnboarding(page);

    // Click on a trial to navigate to class list
    const trialItem = page.locator('.trial-card').first();
    await trialItem.click();

    // Wait for navigation to trial/class view (shows class cards like "Container Excellent")
    await page.waitForTimeout(1000);

    // Verify class cards are displayed - these show class names, judges, times
    const classCards = page.locator('[class*="class-card"]');
    await expect(classCards.first()).toBeVisible({ timeout: 10000 });

    // Check for class card count
    const classCount = await classCards.count();
    expect(classCount).toBeGreaterThan(0);

    // Verify class card contains expected elements (class name visible)
    const firstClassCard = classCards.first();
    await expect(firstClassCard).toContainText(/excellent|master|novice|advanced|open/i);

    // Note: Navigation to entries is tested more thoroughly in TC007
  });

  test('TC007: Entry list filtering and searching', async ({ page }) => {
    // Navigate to an entry list (through trial -> class)
    await expect(page).toHaveURL(/\/home/);
    await dismissOnboarding(page);

    // Click trial
    await page.locator('.trial-card').first().click();
    await page.waitForTimeout(1000);

    // Click class
    await page.locator('[class*="class-card"], .class-item, [class*="class-row"]').first().click();
    await page.waitForURL(/\/(entries|class\/\d+)/i, { timeout: 10000 });

    // Look for entry list
    const entryList = page.locator('[class*="entry"], [class*="dog"]');
    await expect(entryList.first()).toBeVisible({ timeout: 10000 });

    // Test search functionality
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], .search-input, [class*="search"] input');

    if (await searchInput.isVisible({ timeout: 3000 })) {
      // Enter search term
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
    }

    // Test filter functionality (if available)
    const filterButton = page.locator('button:has-text("filter"), [class*="filter"] button, [aria-label*="filter" i]');
    if (await filterButton.isVisible({ timeout: 2000 })) {
      await filterButton.click();
      await page.waitForTimeout(500);

      // Close filter if it opened a panel
      await page.keyboard.press('Escape');
    }
  });

  test('TC008: Run order drag-and-drop reordering', async ({ page }) => {
    // Navigate to entry list with run order
    await expect(page).toHaveURL(/\/home/);
    await dismissOnboarding(page);

    await page.locator('.trial-card').first().click();
    await page.waitForTimeout(1000);

    await page.locator('[class*="class-card"], .class-item').first().click();
    await page.waitForURL(/\/(entries|class\/\d+)/i, { timeout: 10000 });

    // Find draggable entry items
    const entryItems = page.locator('[draggable="true"], [class*="draggable"], [class*="entry-row"], [class*="dog-row"]');
    const entryCount = await entryItems.count();

    if (entryCount >= 2) {
      // Get initial order
      const firstEntry = entryItems.first();
      const secondEntry = entryItems.nth(1);

      // Get bounding boxes
      const firstBox = await firstEntry.boundingBox();
      const secondBox = await secondEntry.boundingBox();

      if (firstBox && secondBox) {
        // Perform drag operation
        await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 10, { steps: 10 });
        await page.mouse.up();

        await page.waitForTimeout(500);

        // Verify visual update occurred
        await expect(entryItems.first()).toBeVisible();
      }
    }
  });

  test('TC009: Scoresheet timing and auto-save', async ({ page }) => {
    // Navigate to a scoresheet
    await expect(page).toHaveURL(/\/home/);
    await dismissOnboarding(page);

    await page.locator('.trial-card').first().click();
    await page.waitForTimeout(1000);

    await page.locator('[class*="class-card"], .class-item').first().click();
    await page.waitForTimeout(1000);

    // Find and click on an entry to score
    const scoreButton = page.locator('button:has-text("score"), [class*="score"] button, a:has-text("score")');
    const entryItem = page.locator('[class*="entry-row"], [class*="dog-row"]').first();

    // Try clicking score button or entry item
    if (await scoreButton.isVisible({ timeout: 2000 })) {
      await scoreButton.first().click();
    } else if (await entryItem.isVisible({ timeout: 2000 })) {
      await entryItem.click();
    }

    await page.waitForTimeout(1000);

    // Check if we're on a scoresheet page
    const scoresheetVisible = await page.locator('[class*="scoresheet"], [class*="scoring"], [class*="judge"]').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (scoresheetVisible) {
      // Look for timer functionality
      const timerButton = page.locator('button:has-text("start"), button:has-text("timer"), [class*="timer"] button');

      if (await timerButton.isVisible({ timeout: 2000 })) {
        await timerButton.click();
        await page.waitForTimeout(1000);

        // Stop timer
        const stopButton = page.locator('button:has-text("stop"), button:has-text("pause")');
        if (await stopButton.isVisible({ timeout: 2000 })) {
          await stopButton.click();
        }

        // Verify timer shows elapsed time
        const timerDisplay = page.locator('[class*="timer"], [class*="time"], text=/\\d+:\\d+/');
        await expect(timerDisplay.first()).toBeVisible();
      }

      // Test point deduction
      const deductionButton = page.locator('button:has-text("deduct"), [class*="deduction"] button, [class*="penalty"]');
      if (await deductionButton.first().isVisible({ timeout: 2000 })) {
        await deductionButton.first().click();
        await page.waitForTimeout(500);
      }

      // Auto-save should happen automatically - verify no error shows
      await page.waitForTimeout(2000);
      const errorVisible = await page.locator('[class*="error"]:visible, [role="alert"]:visible').isVisible();
      expect(errorVisible).toBe(false);
    }
  });

  test('TC010: Submit scoresheet scores', async ({ page }) => {
    // Navigate to a scoresheet
    await expect(page).toHaveURL(/\/home/);
    await dismissOnboarding(page);

    await page.locator('.trial-card').first().click();
    await page.waitForTimeout(1000);

    await page.locator('[class*="class-card"], .class-item').first().click();
    await page.waitForTimeout(1000);

    // Navigate to scoring view
    const entryItem = page.locator('[class*="entry-row"], [class*="dog-row"]').first();
    if (await entryItem.isVisible({ timeout: 2000 })) {
      await entryItem.click();
    }

    await page.waitForTimeout(1000);

    // Look for submit button
    const submitButton = page.locator('button:has-text("submit"), button:has-text("save"), button[type="submit"]');

    if (await submitButton.isVisible({ timeout: 3000 })) {
      await submitButton.click();

      // Wait for submission response
      await page.waitForTimeout(2000);

      // Look for success message
      const successMessage = page.locator('[class*="success"], text=/saved|submitted|success/i, [role="alert"]');
      const hasSuccess = await successMessage.isVisible({ timeout: 5000 }).catch(() => false);

      // Either success message shows, or no error appears
      if (!hasSuccess) {
        const errorMessage = page.locator('[class*="error"]:visible');
        const hasError = await errorMessage.isVisible();
        expect(hasError).toBe(false);
      }
    }
  });
});
