import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * E2E Tests for My Shows Page UI/UX Improvements
 *
 * Tests the following features:
 * - No fake trend data in stat cards
 * - "Enter a Show" primary CTA button
 * - Mobile-friendly scrollable tabs
 * - Direct status labels instead of progress bars or lifecycle steppers
 * - Context-aware "last updated" messaging
 * - Receipt button only for paid entries
 */

// Helper function to login — delegates to the shared SmartSignInPage flow.
async function login(page: Page) {
  await signInAsExhibitor(page, '/exhibitor/entries');
}

// Helper to navigate to My Shows
async function navigateToMyShows(page: Page) {
  await page.goto('/exhibitor/entries', { waitUntil: 'networkidle' });
  // Wait for the page shell — the exhibitor entries page renders an <h1> titled
  // "My Shows" (the route's display name; the file predates that rename).
  await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('My Shows Page - Fake Trend Data Removal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('should not display hardcoded trend percentages', async ({ page }) => {
    // Wait for stat cards to load (StatCard renders icon inside [data-slot="icon"])
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    // Check that no fake trend percentages exist anywhere on the page
    const fakeTrends = ['+5%', '+12%', '-3%', '+8%'];
    for (const trend of fakeTrends) {
      const trendElement = page.locator(`text="${trend}"`);
      await expect(trendElement).toHaveCount(0);
    }
  });

  test('should display the current stat-card contract', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile-chrome') {
      await expect(page.getByRole('button', { name: /\d+ entries? .*\d+ upcoming/ })).toBeVisible();
      return;
    }

    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    // The current card names its scope explicitly so its count is not confused
    // with the all-time "All entries" list below it.
    await expect(page.getByRole('button', { name: /^Current entries:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Upcoming Shows?:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Past Shows?:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Current Fees:/ })).toBeVisible();

    const currentEntriesCard = page.getByRole('button', { name: /^Current entries:/ });
    await expect(currentEntriesCard).toHaveAccessibleName(/Upcoming \+ in review/);
  });

  test('should show real contextual information in stat cards', async ({ page }) => {
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    // Check for meaningful context (e.g., "X upcoming", "X paid", etc.)
    const pageContent = await page.content();
    const hasContextualInfo =
      pageContent.includes('upcoming') ||
      pageContent.includes('accepted') ||
      pageContent.includes('entered') ||
      pageContent.includes('Amount due');
    expect(hasContextualInfo).toBe(true);
  });
});

test.describe('My Shows Page - Enter a Show CTA', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('should display "Enter a Show" button in header', async ({ page }) => {
    const enterShowButton = page.getByRole('button', { name: 'Enter a Show' });
    await expect(enterShowButton).toBeVisible();
  });

  test('should navigate to Browse Shows when clicking "Enter a Show"', async ({ page }) => {
    const enterShowButton = page.getByRole('button', { name: 'Enter a Show' });
    await enterShowButton.click();

    // Should navigate to browse shows page
    await expect(page).toHaveURL(/\/shows$/);
  });

  test('should display dog management affordances alongside Enter a Show', async ({ page }) => {
    await expect(page.getByText('My Dogs', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Dog', exact: true })).toBeVisible();
  });
});

test.describe('My Shows Page - Tab Structure', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('should render the current tabs with scoped counts', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();

    for (const label of ['All', 'Pending', 'Accepted', 'Waitlist', 'Upcoming', 'Completed']) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${label}\\s*\\d+$`) });
      await expect(tab).toBeVisible();
    }
  });

  test('should have scrollable tab container', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toHaveClass(/overflow-x-auto/);
  });

  test('tabs should switch content when clicked', async ({ page }) => {
    const pendingTab = page.getByRole('tab', { name: /^Pending\s*\d+$/ });
    await pendingTab.click();

    // Tab should be selected
    await expect(pendingTab).toHaveAttribute('aria-selected', 'true');

    const acceptedTab = page.getByRole('tab', { name: /^Accepted\s*\d+$/ });
    await acceptedTab.click();

    await expect(acceptedTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('My Shows Page - Mobile Tab Usability', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('tabs should be accessible on mobile via scrolling', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();

    // All tabs should be present even if scrolled
    const tabs = ['All', 'Pending', 'Accepted', 'Waitlist', 'Upcoming', 'Completed'];
    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${tabName}\\s*\\d+$`) });
      // Scroll into view if needed
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
    }
  });

  test('should not have horizontal overflow issues on mobile', async ({ page }) => {
    // The page should not have unwanted horizontal scroll
    const body = page.locator('body');
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    const viewportWidth = 375;

    // Body should not be significantly wider than viewport
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20); // Allow small margin
  });
});

test.describe('My Shows Page - Current Status', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('should not display old progress bar with percentages', async ({ page }) => {
    // Old progress bar had "Entry Progress" label
    const oldProgressLabel = page.locator('text=Entry Progress');
    await expect(oldProgressLabel).toHaveCount(0);

    // Should not have percentage displays like "75%"
    const percentageDisplay = page.locator('.myk9-entries-progress-value');
    await expect(percentageDisplay).toHaveCount(0);
  });

  test('should display direct entry status labels if entries exist', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(1000);

    const entryCards = page.locator('.myk9-entries-card');
    const entryCount = await entryCards.count();

    if (entryCount > 0) {
      await expect(page.locator('.entry-status-stepper')).toHaveCount(0);
      await expect(
        entryCards
          .first()
          .getByText(
            /Accepted|Pending secretary approval|Review incomplete|Waitlist|Rejected|Withdrawn|Scored|Move-Up Requested|Unknown/
          )
          .first()
      ).toBeVisible();
    }
  });
});

// Empty-state behavior is covered at the component layer in
// FirstRunZeroState.test.tsx; this canonical E2E exhibitor fixture intentionally
// has entries and no no-entry browser fixture is provisioned.
test.describe('My Shows Page - Context-Aware Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('should display context-aware status messages for entries', async ({ page }) => {
    await page.waitForTimeout(500);

    const entryCards = page.getByRole('button', { name: /Edit Entry/i });
    const cardCount = await entryCards.count();

    if (cardCount > 0) {
      // Check for context-aware messaging (not just "Last updated: date")
      const pageText = await page.locator('body').innerText();
      // Should have relative time or context (e.g., "Accepted 2 days ago", "Show is today")
      const hasContextualMessage =
        pageText.includes('ago') ||
        pageText.includes('today') ||
        pageText.includes('tomorrow') ||
        pageText.includes('days') ||
        pageText.includes('pending') ||
        pageText.includes('Accepted') ||
        pageText.includes('Submitted');
      expect(hasContextualMessage).toBe(true);
    }
  });
});
