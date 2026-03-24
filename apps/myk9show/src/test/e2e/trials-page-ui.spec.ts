import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Tests for Trials Page UI/UX Improvements
 *
 * Tests the following features:
 * - Statistics cards show contextual information (not misleading percent changes)
 * - Trial info card does not show Order field
 * - Edit button is visible (not hidden in dropdown)
 * - Trial navigation (prev/next) when multiple trials exist
 * - Empty state shows icon and improved messaging
 * - Search has shortened placeholder
 * - In Progress status badge has animation
 */

// Test user credentials
const testUser = {
  email: 'working-exhibitor@example.com',
  password: 'testpass123',
};

// Helper function to login
async function login(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-testid="email-input"]', { state: 'visible', timeout: 10000 });
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="sign-in-button"]');

  await page.waitForURL('/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// Helper to navigate to a trial page
async function navigateToTrialPage(page: Page) {
  // Navigate to shows first
  await page.goto('/shows', { waitUntil: 'networkidle' });

  // Click on the first show to view its details
  const showCard = page.locator('.myk9-show-sidebar-item').first();
  if (await showCard.isVisible()) {
    await showCard.click();
    await page.waitForLoadState('networkidle');
  }

  // Navigate to a trial if available
  const trialLink = page.locator('a[href*="/trials/"]').first();
  if (await trialLink.isVisible()) {
    await trialLink.click();
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Trials Page - Statistics Cards', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('statistics cards should not show misleading percent changes', async ({ page }) => {
    await navigateToTrialPage(page);

    // StatCard renders icon in [data-slot="icon"]; subtitles are plain text beneath the value
    const statIcons = page.locator('[data-slot="icon"]');

    // If we have stat cards, they should have contextual subtitles, not percent changes
    if (
      await statIcons
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      // Stat cards should not contain hardcoded misleading trend percentages
      const fakeTrends = ['+5%', '+12%', '-3%', '+8%'];
      for (const trend of fakeTrends) {
        const trendElement = page.locator(`text="${trend}"`);
        await expect(trendElement).toHaveCount(0);
      }
    }
  });

  test('Qualified Rate card should only show when classes are completed', async ({ page }) => {
    await navigateToTrialPage(page);

    // StatCard icons are rendered in [data-slot="icon"]
    const statIcons = page.locator('[data-slot="icon"]');

    if (
      await statIcons
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      // If there's a Qualified Rate card, it should have qualified data in its subtitle
      const qualifiedCard = page.locator('text=Qualified Rate');

      if (await qualifiedCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        // The subtitle text "qualified" should be present near the card
        const qualifiedText = page.locator('text=/qualified/i');
        await expect(qualifiedText.first()).toBeVisible();
      }
    }
  });
});

test.describe('Trials Page - Trial Info Card', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('trial info card should not display Order field', async ({ page }) => {
    await navigateToTrialPage(page);

    const infoCard = page.locator('.myk9-show-info-card');

    if (await infoCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Look for "Order" label - it should NOT exist
      const orderLabel = infoCard.locator('.myk9-show-info-label:has-text("Order")');
      await expect(orderLabel).not.toBeVisible();
    }
  });

  test('trial info card should display Total Classes field', async ({ page }) => {
    await navigateToTrialPage(page);

    const infoCard = page.locator('.myk9-show-info-card');

    if (await infoCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Look for "Total Classes" label
      const totalClassesLabel = infoCard.locator('.myk9-show-info-label:has-text("Total Classes")');
      await expect(totalClassesLabel).toBeVisible();
    }
  });
});

test.describe('Trials Page - Action Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Edit button should be visible without opening dropdown', async ({ page }) => {
    await navigateToTrialPage(page);

    const infoCard = page.locator('.myk9-show-info-card');

    if (await infoCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Look for visible Edit button with title
      const editButton = page.locator('button[title="Edit Trial"]');
      await expect(editButton).toBeVisible();
    }
  });

  test('Delete action should be in dropdown menu', async ({ page }) => {
    await navigateToTrialPage(page);

    const infoCard = page.locator('.myk9-show-info-card');

    if (await infoCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Delete should not be immediately visible
      const deleteButton = page.locator('button:has-text("Delete Trial")');
      await expect(deleteButton).not.toBeVisible();

      // Open the dropdown menu
      const moreButton = infoCard
        .locator('button')
        .filter({ has: page.locator('svg.lucide-more-vertical') });
      if (await moreButton.isVisible()) {
        await moreButton.click();

        // Now Delete should be visible in dropdown
        await expect(page.locator('[role="menuitem"]:has-text("Delete Trial")')).toBeVisible();
      }
    }
  });
});

test.describe('Trials Page - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show trial navigation when multiple trials exist', async ({ page }) => {
    await navigateToTrialPage(page);

    // Check for navigation controls
    const prevButton = page.locator('button[title="Previous Trial"]');
    const nextButton = page.locator('button[title="Next Trial"]');

    // If navigation exists (multiple trials), verify it's functional
    if (await prevButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(nextButton).toBeVisible();

      // Should show current position (e.g., "1 of 3")
      const positionText = page.locator('text=/\\d+ of \\d+/');
      await expect(positionText).toBeVisible();
    }
  });

  test('navigation buttons should be disabled appropriately at boundaries', async ({ page }) => {
    await navigateToTrialPage(page);

    const prevButton = page.locator('button[title="Previous Trial"]');

    if (await prevButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // At first trial, prev should be disabled
      const positionText = await page.locator('text=/\\d+ of \\d+/').textContent();
      if (positionText?.startsWith('1 of')) {
        await expect(prevButton).toBeDisabled();
      }

      // At last trial, next should be disabled
      const nextButton = page.locator('button[title="Next Trial"]');
      const totalMatch = positionText?.match(/of (\d+)/);
      const currentMatch = positionText?.match(/^(\d+) of/);
      if (totalMatch && currentMatch && currentMatch[1] === totalMatch[1]) {
        await expect(nextButton).toBeDisabled();
      }
    }
  });
});

test.describe('Trials Page - Classes Table', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('empty state should show icon', async ({ page }) => {
    await navigateToTrialPage(page);

    // Check for empty state icon (if no classes)
    const emptyStateIcon = page.locator('[data-testid="empty-state-icon"]');

    // This test passes if either:
    // 1. Classes exist (no empty state shown), or
    // 2. Empty state shows with icon
    const classesTable = page.locator('table');
    const hasClasses = await classesTable.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasClasses) {
      // Should show empty state with icon
      await expect(emptyStateIcon).toBeVisible();
      await expect(page.locator('text=No classes yet')).toBeVisible();
    }
  });

  test('search should have concise placeholder', async ({ page }) => {
    await navigateToTrialPage(page);

    const searchInput = page.locator('input[placeholder="Search classes..."]');

    // If classes table is visible, search should have short placeholder
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();

      // Should NOT have the long placeholder
      const longPlaceholder = page.locator('input[placeholder*="element, level, section"]');
      await expect(longPlaceholder).not.toBeVisible();
    }
  });
});

test.describe('Trials Page - Status Badge Animation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('In Progress status badge should have animation', async ({ page }) => {
    await navigateToTrialPage(page);

    const inProgressBadge = page.locator('.myk9-show-status-in-progress');

    if (await inProgressBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check that animation is applied
      const animation = await inProgressBadge.evaluate(el => window.getComputedStyle(el).animation);
      expect(animation).toContain('status-pulse');
    }
  });
});
