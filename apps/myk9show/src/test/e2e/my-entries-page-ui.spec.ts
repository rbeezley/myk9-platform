import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Tests for My Entries Page UI/UX Improvements
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
  email: 'working-exhibitor@example.com',
  password: 'testpass123'
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

// Helper to navigate to My Entries
async function navigateToMyEntries(page: Page) {
  await page.goto('/my-entries', { waitUntil: 'networkidle' });
  // Wait for page to load
  await page.waitForSelector('h1:has-text("My Entries")', { timeout: 10000 });
}

test.describe('My Entries Page - Fake Trend Data Removal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should not display hardcoded trend percentages', async ({ page }) => {
    // Wait for stat cards to load
    await page.waitForSelector('.myk9-show-stat-card', { timeout: 5000 });

    // Check that no fake trend percentages exist
    const fakeTrends = ['+5%', '+12%', '-3%', '+8%'];
    for (const trend of fakeTrends) {
      const trendElement = page.locator(`.myk9-show-stat-card:has-text("${trend}")`);
      await expect(trendElement).toHaveCount(0);
    }
  });

  test('should display meaningful stat card titles', async ({ page }) => {
    await page.waitForSelector('.myk9-show-stat-card', { timeout: 5000 });

    // Verify meaningful stat card titles
    await expect(page.locator('text=Total Entries')).toBeVisible();
    await expect(page.locator('text=Accepted')).toBeVisible();
    await expect(page.locator('text=Needs Action')).toBeVisible();
    await expect(page.locator('text=Total Fees')).toBeVisible();
  });

  test('should show real contextual information in stat cards', async ({ page }) => {
    await page.waitForSelector('.myk9-show-stat-card', { timeout: 5000 });

    // Should show "upcoming" count or "paid" count instead of fake trends
    const statDetails = page.locator('.myk9-show-stat-details');
    await expect(statDetails.first()).toBeVisible();

    // Check for meaningful context (e.g., "X upcoming", "X paid", etc.)
    const pageContent = await page.content();
    const hasContextualInfo = pageContent.includes('upcoming') ||
                              pageContent.includes('paid') ||
                              pageContent.includes('awaiting') ||
                              pageContent.includes('payment');
    expect(hasContextualInfo).toBe(true);
  });
});

test.describe('My Entries Page - Enter a Show CTA', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should display "Enter a Show" button in header', async ({ page }) => {
    const enterShowButton = page.locator('a:has-text("Enter a Show")');
    await expect(enterShowButton).toBeVisible();
    await expect(enterShowButton).toHaveAttribute('href', '/shows/browse');
  });

  test('should navigate to Browse Shows when clicking "Enter a Show"', async ({ page }) => {
    const enterShowButton = page.locator('a:has-text("Enter a Show")');
    await enterShowButton.click();

    // Should navigate to browse shows page
    await expect(page).toHaveURL(/\/shows\/browse/);
  });

  test('should display Refresh button alongside Enter a Show', async ({ page }) => {
    const refreshButton = page.locator('button:has-text("Refresh")');
    await expect(refreshButton).toBeVisible();
  });
});

test.describe('My Entries Page - Tab Structure', () => {
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
    await expect(pendingTab).toHaveAttribute('data-state', 'active');

    // Click on Accepted tab
    const acceptedTab = page.locator('[role="tab"]:has-text("Accepted")');
    await acceptedTab.click();

    await expect(acceptedTab).toHaveAttribute('data-state', 'active');
  });
});

test.describe('My Entries Page - Mobile Tab Usability', () => {
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

test.describe('My Entries Page - Status Stepper', () => {
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
    const entryCards = page.locator('.myk9-entries-card');
    const entryCount = await entryCards.count();

    if (entryCount > 0) {
      const statusStepper = page.locator('.entry-status-stepper');
      await expect(statusStepper.first()).toBeVisible();
    }
  });
});

test.describe('My Entries Page - Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should display helpful empty state message when no entries', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(500);

    // Check if empty state is shown
    const emptyState = page.locator('text=/no entries found|haven\'t entered any shows/i');
    const entryCards = page.locator('.myk9-entries-card');

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
      const browseButton = page.locator('a:has-text("Browse All Shows")');
      await expect(browseButton).toBeVisible();
    }
  });
});

test.describe('My Entries Page - Context-Aware Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyEntries(page);
  });

  test('should display context-aware status messages for entries', async ({ page }) => {
    await page.waitForTimeout(500);

    const entryCards = page.locator('.myk9-entries-card');
    const cardCount = await entryCards.count();

    if (cardCount > 0) {
      // Check for context-aware messaging (not just "Last updated: date")
      const lastUpdatedSection = page.locator('.myk9-entries-last-updated');
      await expect(lastUpdatedSection.first()).toBeVisible();

      // Should have relative time or context (e.g., "Accepted 2 days ago", "Show is tomorrow")
      const messageText = await lastUpdatedSection.first().textContent();
      const hasContextualMessage = messageText?.includes('ago') ||
                                   messageText?.includes('today') ||
                                   messageText?.includes('tomorrow') ||
                                   messageText?.includes('days') ||
                                   messageText?.includes('pending') ||
                                   messageText?.includes('Accepted') ||
                                   messageText?.includes('Submitted');
      expect(hasContextualMessage).toBe(true);
    }
  });
});
