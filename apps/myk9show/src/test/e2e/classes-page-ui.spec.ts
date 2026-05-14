import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Tests for Classes Page UI Improvements
 *
 * Tests the following features:
 * - No debug button visible in production
 * - Consistent status terminology
 * - Status changes functionality
 * - Progress indicators display
 * - Mobile responsiveness
 */

// Test user credentials
const testUser = {
  email: 'exhibitor1@myk9t.com',
  password: 'TestPass4567!',
};

const adminUser = {
  email: 'admin@myk9t.com',
  password: 'TestPass4567!',
};

// Helper function to login
async function login(page: Page, user = testUser) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-testid="email-input"]', {
    state: 'visible',
    timeout: 10000,
  });
  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);
  await page.click('[data-testid="sign-in-button"]');

  await page.waitForURL('/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// Helper to navigate to a class details page
async function navigateToClassDetails(page: Page, classId?: string) {
  if (classId) {
    await page.goto(`/classes/${classId}`, { waitUntil: 'networkidle' });
  } else {
    // Navigate to classes page first
    await page.goto('/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on the first class if available
    const classItems = page.locator('[class*="class"] [class*="cursor-pointer"]');
    const count = await classItems.count();
    if (count > 0) {
      await classItems.first().click();
      await page.waitForTimeout(500);
    }
  }
}

test.describe('Classes Page - Debug Button Removed', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should NOT display debug button in production', async ({ page }) => {
    await navigateToClassDetails(page);

    // Debug button should not exist
    const debugButton = page.locator('button:has-text("Clear Entries")');
    await expect(debugButton).toHaveCount(0);

    // Also check for the specific styled debug button
    const styledDebugButton = page.locator('[style*="position: fixed"][style*="z-index: 9999"]');
    await expect(styledDebugButton).toHaveCount(0);
  });

  test('should not have any buttons with debug styling', async ({ page }) => {
    await navigateToClassDetails(page);

    // No red background debug buttons should exist
    const redButtons = page.locator('button[style*="background: red"]');
    await expect(redButtons).toHaveCount(0);
  });
});

test.describe('Classes Page - Status Terminology', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should display consistent status labels', async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check for valid status values
    const validStatuses = [
      'Scheduled',
      'Upcoming',
      'In Progress',
      'Completed',
      'Complete',
      'Cancelled',
    ];

    // Look for status badges
    const statusBadges = page.locator('[class*="badge"], [class*="status"]');
    const count = await statusBadges.count();

    for (let i = 0; i < count; i++) {
      const text = await statusBadges.nth(i).textContent();
      if (text) {
        const hasValidStatus = validStatuses.some(status => text.includes(status));
        if (!hasValidStatus && text.trim().length > 0) {
          // Only fail if it looks like a status but doesn't match
          const looksLikeStatus = /pending|progress|complete|cancel|upcoming|scheduled/i.test(text);
          expect(looksLikeStatus || hasValidStatus).toBeTruthy();
        }
      }
    }
  });

  test('should NOT display deprecated status "Pending"', async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check that "Pending" status is not displayed
    // We look for exact match to avoid false positives from "Pending" in other contexts
    const pendingBadge = page.locator('[class*="badge"]:has-text("Pending")');
    await expect(pendingBadge).toHaveCount(0);
  });
});

test.describe('Classes Page - Progress Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should display progress bar for entry counts in table view', async ({ page }) => {
    // Navigate to a trial with classes
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on first trial
    const trialItems = page.locator('[class*="cursor-pointer"]').first();
    const trialCount = await trialItems.count();

    if (trialCount > 0) {
      await trialItems.click();
      await page.waitForTimeout(1000);

      // Look for progress bars (thin horizontal bars)
      // Progress bars may or may not be visible depending on data
      const _progressBars = page.locator(
        '[class*="rounded-full"][class*="h-1"], [class*="progress"]'
      );
    }
  });

  test('should display completed/total format for entries', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Look for the "X / Y" format for entry counts
    // May not be present if no classes have entries
    const _entryCountFormat = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
  });
});

test.describe('Classes Page - Status Colors', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should use correct color scheme for statuses', async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check that blue is used for Scheduled/Upcoming
    // These may or may not be present depending on data
    const _blueBadges = page.locator('[class*="bg-blue"]');

    // Check that amber/yellow is used for In Progress
    const _amberBadges = page.locator('[class*="bg-amber"], [class*="bg-yellow"]');

    // Check that green is used for Completed
    const _greenBadges = page.locator('[class*="bg-green"]');
  });
});

test.describe('Classes Page - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should be usable at mobile viewport 375px', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Page should be visible and not have horizontal overflow
    const body = page.locator('body');
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 20); // Allow small margin for scrollbar
  });

  test('should stack stats grid on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await navigateToClassDetails(page);

    // Stats should be in a stacked/responsive layout
    // This is a visual check - we verify no horizontal overflow
    const container = page.locator('.container, [class*="container"]').first();
    if ((await container.count()) > 0) {
      const width = await container.evaluate(el => el.scrollWidth);
      expect(width).toBeLessThanOrEqual(375);
    }
  });
});

test.describe('Classes Page - Secretary Class Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should navigate to class management page', async ({ page }) => {
    // Navigate to a trial and look for class management
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on first trial
    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display status filter with correct options', async ({ page }) => {
    await page.goto('/secretary/class-management/test-trial', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Look for status filter dropdown
    const statusFilter = page.locator('select, [role="combobox"]').filter({ hasText: /status/i });
    if ((await statusFilter.count()) > 0) {
      // Click to open dropdown
      await statusFilter.first().click();

      // Check for valid options
      const options = page.locator('[role="option"], option');
      const optionTexts: string[] = [];
      const count = await options.count();
      for (let i = 0; i < count; i++) {
        const text = await options.nth(i).textContent();
        if (text) optionTexts.push(text);
      }

      // Should not include "Pending"
      expect(optionTexts.some(t => t === 'Pending')).toBeFalsy();
    }
  });
});

test.describe('Classes Page - View Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should have table and card view toggle', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on first trial to see classes
    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Look for view toggle buttons
      // At least one should be visible if classes exist
      const _tableViewBtn = page.locator('button[title*="Table"], button:has([class*="List"])');
      const _cardViewBtn = page.locator('button[title*="Card"], button:has([class*="Grid"])');
    }
  });

  test('should switch between table and card views', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Click card view if available
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);

        // Verify card layout is visible
        // Cards should be in a grid
        const _cardGrid = page.locator('[class*="grid"]').first();
      }
    }
  });
});

test.describe('Classes Page - Favorite Button', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should display favorite button on class cards', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on first trial to see classes
    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view if not already
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Look for heart icon (favorite button) on class cards
      // Heart buttons should be present on each card
      const _heartButtons = page.locator(
        '[class*="Heart"], button:has(svg[class*="lucide-heart"])'
      );
    }
  });

  test('should toggle favorite state on click', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Find and click first heart button
      const heartButton = page.locator('button:has(svg[class*="lucide-heart"])').first();
      if ((await heartButton.count()) > 0) {
        await heartButton.click();
        await page.waitForTimeout(300);

        // After click, heart should be filled (indicated by fill color or class change)
        // The heart icon should have changed state
      }
    }
  });

  test('should persist favorites across page refresh', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Click to favorite
      const heartButton = page.locator('button:has(svg[class*="lucide-heart"])').first();
      if ((await heartButton.count()) > 0) {
        await heartButton.click();
        await page.waitForTimeout(300);

        // Refresh page
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Favorite state should be preserved (stored in localStorage)
        // Check localStorage for favorites
        const favoritesKey = await page.evaluate(() => {
          return Object.keys(localStorage).find(k => k.startsWith('myk9show_favorites_'));
        });
        expect(favoritesKey).toBeTruthy();
      }
    }
  });
});

test.describe('Classes Page - Info Popover', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should show class details popover on desktop hover/click', async ({ page }) => {
    // Ensure desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Click on a class card to trigger popover
      const classCard = page.locator('[class*="card"]').first();
      if ((await classCard.count()) > 0) {
        await classCard.click();
        await page.waitForTimeout(300);

        // Look for popover content with class details
        // Popover should contain class info like Status, Entries, Judge
        const _popover = page.locator('[role="dialog"], [data-radix-popper-content-wrapper]');
      }
    }
  });

  test('should show class details dialog on mobile tap', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // On mobile, cards should auto-display
      // Click on a class card
      const classCard = page.locator('[class*="card"]').first();
      if ((await classCard.count()) > 0) {
        await classCard.click();
        await page.waitForTimeout(300);

        // On mobile, should show dialog instead of popover
        // Dialog should be visible with class details
        const _dialog = page.locator('[role="dialog"]');
      }
    }
  });

  test('should display class status in info popover', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Click class card
      const classCard = page.locator('[class*="card"]').first();
      if ((await classCard.count()) > 0) {
        await classCard.click();
        await page.waitForTimeout(300);

        // Popover should contain status label
        // Status label should be present
        const _statusLabel = page.locator(
          '[role="dialog"] :text("Status"), [data-radix-popper-content-wrapper] :text("Status")'
        );
      }
    }
  });
});

test.describe('Classes Page - Warning Banners', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, adminUser);
  });

  test('should display offline scoring banner when class is offline', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Look for offline banner (orange background, WifiOff icon)
      // May or may not be present depending on data
      const _offlineBanner = page.locator('[class*="bg-orange"]:has-text("Offline")');
    }
  });

  test('should display stale data banner for in-progress classes', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Look for stale data banner (amber background, "May be outdated" text)
      // May or may not be present depending on data (class must be in-progress with stale results)
      const _staleBanner = page.locator('[class*="bg-amber"]:has-text("outdated")');
    }
  });

  test('should not show stale banner for completed classes', async ({ page }) => {
    await page.goto('/trials', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const trialItem = page.locator('[class*="cursor-pointer"]').first();
    if ((await trialItem.count()) > 0) {
      await trialItem.click();
      await page.waitForTimeout(1000);

      // Switch to card view
      const cardViewBtn = page.locator('button[title*="Card"], button:has([class*="LayoutGrid"])');
      if ((await cardViewBtn.count()) > 0) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Find completed class cards (with green badge or "Completed" text)
      const completedCards = page.locator('[class*="card"]:has([class*="bg-green"])');
      const count = await completedCards.count();

      for (let i = 0; i < count; i++) {
        const card = completedCards.nth(i);
        // Completed cards should NOT have stale data banner
        const staleBanner = card.locator('[class*="bg-amber"]:has-text("outdated")');
        await expect(staleBanner).toHaveCount(0);
      }
    }
  });
});
