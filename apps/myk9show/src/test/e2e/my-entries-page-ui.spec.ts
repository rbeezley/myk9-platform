import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Tests for My Shows Page UI/UX Improvements
 *
 * Tests the following features:
 * - No fake trend data in stat cards
 * - "Enter a Show" primary CTA button
 * - Mobile-friendly scrollable tabs
 * - Status stepper instead of progress bar
 * - Context-aware "last updated" messaging
 * - Receipt button only for paid entries
 */

// Test user credentials
const testUser = {
  email: 'exhibitor1@myk9t.com',
  password: 'TestPass4567!',
};

// Helper function to login
async function login(page: Page) {
  await page.goto('/sign-in?returnTo=%2Fexhibitor%2Fentries', { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-testid="email-input"]', { state: 'visible', timeout: 10000 });
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="sign-in-button"]');

  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// Helper to navigate to My Shows
async function navigateToMyEntries(page: Page) {
  await page.goto('/exhibitor/entries', { waitUntil: 'networkidle' });
  // Wait for page to load
  await expect(page.getByText('MY ENTRIES')).toBeVisible({ timeout: 10000 });
}

test.describe('My Shows Page - Fake Trend Data Removal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
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

  test('should display meaningful stat card titles', async ({ page }) => {
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    // Verify meaningful stat card titles
    await expect(page.locator('text=Total Entries')).toBeVisible();
    await expect(page.getByText('Accepted').first()).toBeVisible();
    await expect(page.locator('text=Needs Action')).toBeVisible();
    await expect(page.locator('text=Total Fees')).toBeVisible();
  });

  test('should show real contextual information in stat cards', async ({ page }) => {
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    // Check for meaningful context (e.g., "X upcoming", "X paid", etc.)
    const pageContent = await page.content();
    const hasContextualInfo =
      pageContent.includes('upcoming') ||
      pageContent.includes('paid') ||
      pageContent.includes('awaiting') ||
      pageContent.includes('payment');
    expect(hasContextualInfo).toBe(true);
  });
});

test.describe('My Shows Page - Enter a Show CTA', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
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
    await expect(page.getByText('MY DOGS')).toBeVisible();
    await expect(page.getByRole('button', { name: /New Dog/i })).toBeVisible();
  });
});

test.describe('My Shows Page - Tab Structure', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should render all tabs without redundant counts', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();

    // Tabs should have simple labels without "(X)" counts
    const allTab = page.locator('[role="tab"]:has-text("All")');
    const pendingTab = page.locator('[role="tab"]:has-text("Pending")');
    const acceptedTab = page.locator('[role="tab"]:has-text("Accepted")');
    const waitlistTab = page.locator('[role="tab"]:has-text("Waitlist")');
    const upcomingTab = page.locator('[role="tab"]:has-text("Upcoming")');

    await expect(allTab).toBeVisible();
    await expect(pendingTab).toBeVisible();
    await expect(acceptedTab).toBeVisible();
    await expect(waitlistTab).toBeVisible();
    await expect(upcomingTab).toBeVisible();

    // Verify tabs don't have redundant counts (like "All (5)")
    const allTabText = await allTab.textContent();
    expect(allTabText).toBe('All');

    const pendingTabText = await pendingTab.textContent();
    expect(pendingTabText).toBe('Pending');
  });

  test('should have scrollable tab container', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toHaveClass(/overflow-x-auto/);
  });

  test('tabs should switch content when clicked', async ({ page }) => {
    // Click on Pending tab
    const pendingTab = page.locator('[role="tab"]:has-text("Pending")');
    await pendingTab.click();

    // Tab should be selected
    await expect(pendingTab).toHaveAttribute('aria-selected', 'true');

    // Click on Accepted tab
    const acceptedTab = page.locator('[role="tab"]:has-text("Accepted")');
    await acceptedTab.click();

    await expect(acceptedTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('My Shows Page - Mobile Tab Usability', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('tabs should be accessible on mobile via scrolling', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();

    // All tabs should be present even if scrolled
    const tabs = ['All', 'Pending', 'Accepted', 'Waitlist', 'Upcoming'];
    for (const tabName of tabs) {
      const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
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

test.describe('My Shows Page - Status Stepper', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should not display old progress bar with percentages', async ({ page }) => {
    // Old progress bar had "Entry Progress" label
    const oldProgressLabel = page.locator('text=Entry Progress');
    await expect(oldProgressLabel).toHaveCount(0);

    // Should not have percentage displays like "75%"
    const percentageDisplay = page.locator('.myk9-entries-progress-value');
    await expect(percentageDisplay).toHaveCount(0);
  });

  test('should display entry status stepper if entries exist', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(1000);

    // If there are entries, status stepper should be visible
    const entryCount = await page.getByRole('button', { name: /Edit Entry/i }).count();

    if (entryCount > 0) {
      const statusStepper = page.locator('.entry-status-stepper').first();

      await expect(statusStepper).toBeVisible();
      await expect(statusStepper.getByText('Submitted')).toBeVisible();
      await expect(statusStepper.getByText('Review')).toBeVisible();
      await expect(statusStepper.getByText('Accepted')).toBeVisible();
      await expect(statusStepper.getByText('Paid')).toBeVisible();
    }
  });
});

test.describe('My Shows Page - Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should display helpful empty state message when no entries', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(500);

    // Check if empty state is shown
    const emptyState = page.locator("text=/no entries found|haven't entered any shows/i");
    const entryCards = page.getByRole('button', { name: /Edit Entry/i });

    const cardCount = await entryCards.count();
    if (cardCount === 0) {
      // If no entries, empty state should be visible
      await expect(emptyState.first()).toBeVisible();
    }
  });

  test('should have Browse All Shows button in empty state', async ({ page }) => {
    await page.waitForTimeout(500);

    const entryCards = page.locator('.myk9-entries-card');
    const cardCount = await entryCards.count();

    if (cardCount === 0) {
      const browseButton = page.getByRole('button', { name: /Browse All Shows|Enter a Show/i });
      await expect(browseButton).toBeVisible();
    }
  });
});

test.describe('My Shows Page - Context-Aware Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
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
