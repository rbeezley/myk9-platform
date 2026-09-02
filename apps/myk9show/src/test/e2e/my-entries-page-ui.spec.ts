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

  test('shows the entry-fee strip, and only that', async ({ page }) => {
    // The four-card grid is gone. Current entries / Upcoming shows / Completed
    // shows were deleted: two deep-linked to filters rendered a few hundred
    // pixels below them, and "Completed Shows" counted SHOWS beside a filter
    // counting entries. Only the fee balance is left, because it is the one
    // fact here that lives off this page and can be acted on.
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    await expect(page.getByRole('button', { name: /^Entry fees:/ })).toBeVisible();

    for (const retired of [/^Current entries:/, /^Upcoming Shows?:/, /^Completed Shows?:/]) {
      await expect(page.getByRole('button', { name: retired })).toHaveCount(0);
    }
  });

  test('keeps the fee balance visible on a phone, with no disclosure to open', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'mobile projects only');

    // The old mobile summary line existed to collapse a four-card grid while
    // still surfacing this balance. With one strip there is nothing to hide,
    // so the balance is simply present — and there must be no toggle.
    await expect(page.getByRole('button', { name: /^Entry fees:/ })).toBeVisible();
    await expect(page.locator('[aria-controls="exhibitor-stat-cards"]')).toHaveCount(0);
  });

  test('states the fee balance in words, not just a figure', async ({ page }) => {
    await page.waitForSelector('[data-slot="icon"]', { timeout: 5000 });

    const feeStrip = page.getByRole('button', { name: /^Entry fees:/ });
    await expect(feeStrip).toHaveAccessibleName(/paid in full|due of/i);
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

  test('should link to dog management alongside Enter a Show', async ({ page }) => {
    await expect(page.getByRole('link', { name: /My Dogs/ })).toHaveAttribute('href', '/dogs');
  });
});

test.describe('My Shows Page - Filter Structure', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  const timeAxis = (page: Page) => page.getByRole('radiogroup', { name: /filter by time/i });
  const statusAxis = (page: Page) =>
    page.getByRole('radiogroup', { name: /filter by entry status/i });

  test('renders both filter axes with scoped counts', async ({ page }) => {
    // Time and status are BOTH filters now: they narrow the same list of the
    // same cards, so neither claims tab semantics. The one-axis-per-group
    // structure Phase A created is unchanged — as six flat tabs the two axes
    // overwrote each other and the counts summed to double the entry total.
    // See docs/plan-ia-exhibitor-surface.md, Phase A.
    await expect(timeAxis(page)).toBeVisible();
    await expect(statusAxis(page)).toBeVisible();
    await expect(page.locator('[role="tablist"]')).toHaveCount(0);

    for (const label of ['All', 'Upcoming', 'Completed']) {
      await expect(
        timeAxis(page).getByRole('radio', { name: new RegExp(`^${label}\\s*\\d+$`) })
      ).toBeVisible();
    }
    for (const retired of ['Pending', 'Waitlist']) {
      await expect(
        timeAxis(page).getByRole('radio', { name: new RegExp(`^${retired}`) })
      ).toHaveCount(0);
    }
  });

  test('wraps the filters instead of scrolling them sideways', async ({ page }) => {
    // The tab strip used to scroll horizontally, hiding options with no
    // indication they existed.
    for (const axis of [timeAxis(page), statusAxis(page)]) {
      await expect(axis).toHaveClass(/flex-wrap/);
      await expect(axis).not.toHaveClass(/overflow-x-auto/);
    }
  });

  test('the time filter switches content when clicked', async ({ page }) => {
    const completed = timeAxis(page).getByRole('radio', { name: /^Completed\s*\d+$/ });
    await completed.click();
    await expect(completed).toHaveAttribute('aria-checked', 'true');

    const upcoming = timeAxis(page).getByRole('radio', { name: /^Upcoming\s*\d+$/ });
    await upcoming.click();
    await expect(upcoming).toHaveAttribute('aria-checked', 'true');
  });

  // The combination the old six-tab strip could not express: picking a status
  // then a time replaced the filter instead of refining it.
  test('status filter composes with the time filter instead of replacing it', async ({ page }) => {
    await statusAxis(page).getByRole('radio', { name: /^Accepted/ }).click();
    await timeAxis(page).getByRole('radio', { name: /^Upcoming\s*\d+$/ }).click();

    // Both constraints still applied.
    await expect(
      timeAxis(page).getByRole('radio', { name: /^Upcoming\s*\d+$/ })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(statusAxis(page).getByRole('radio', { name: /^Accepted/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    // The URL contract is unchanged by the tabs-to-chips move.
    await expect(page).toHaveURL(/status=accepted/);
    await expect(page).toHaveURL(/tab=upcoming/);
  });

  // Upcoming + Completed must account for every entry exactly once. Two axes
  // rendered as siblings is what made the counts sum to 136 for 68 entries.
  test('Upcoming and Completed partition All', async ({ page }) => {
    const countOf = async (label: string) => {
      const name = await page
        .getByRole('radiogroup', { name: /filter by time/i })
        .getByRole('radio', { name: new RegExp(`^${label}\\s*\\d+$`) })
        .textContent();
      return Number((name ?? '').replace(/\D+/g, ''));
    };

    const [all, upcoming, completed] = await Promise.all([
      countOf('All'),
      countOf('Upcoming'),
      countOf('Completed'),
    ]);

    expect(upcoming + completed).toBe(all);
  });
});

test.describe('My Shows Page - Mobile Filter Usability', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToMyShows(page);
  });

  test('every filter is reachable on a phone without sideways scrolling', async ({ page }) => {
    // These used to be tabs in a horizontally scrolling strip, so an option
    // past the fold had no affordance saying it existed. Chips wrap.
    //
    // That intent is about the HORIZONTAL axis, and this test asserts it on the
    // horizontal axis only. It deliberately does not require the whole strip to
    // fit in the first 667px.
    //
    // It used to (`toBeInViewport()` with no scroll), and MYK9-337 is what that
    // cost: on staging the row needs ~401px for one line at 375px wide, so it
    // wraps — exactly as designed — and the second line sat a few pixels under
    // the fold. All three chips rendered, at a compliant 44px, correctly
    // wrapped, and the spec failed anyway. Worse, the margin is a function of
    // how many DIGITS the live counts have ("Completed 191" is wider than
    // "Completed 19"), so the assertion re-armed itself every time staging
    // accumulated entries, and it was coupled to the height of every element
    // above the strip. Neither is something this spec means to guarantee.
    //
    // What it does guarantee: the group never scrolls sideways, no chip is
    // clipped at either edge, and every chip can be reached. A regression to a
    // horizontally scrolling strip still fails this — a chip past the fold
    // would extend beyond the viewport's right edge.
    const viewportWidth = 375;
    const timeAxis = page.getByRole('radiogroup', { name: /filter by time/i });
    await expect(timeAxis).toBeVisible();

    const axisBox = await timeAxis.boundingBox();
    expect(axisBox, 'the time filter group should have a layout box').not.toBeNull();
    expect(axisBox!.width).toBeLessThanOrEqual(viewportWidth);

    for (const label of ['All', 'Upcoming', 'Completed']) {
      const chip = timeAxis.getByRole('radio', { name: new RegExp(`^${label}\\s*\\d+$`) });

      // Reachable by ordinary vertical scrolling, which is how a phone page works.
      await chip.scrollIntoViewIfNeeded();
      await expect(chip, `the ${label} filter should be reachable`).toBeInViewport();

      // ...and once reached, fully within the viewport horizontally.
      const chipBox = await chip.boundingBox();
      expect(chipBox, `the ${label} filter should have a layout box`).not.toBeNull();
      expect(chipBox!.x, `the ${label} filter is clipped at the left edge`).toBeGreaterThanOrEqual(
        0
      );
      expect(
        chipBox!.x + chipBox!.width,
        `the ${label} filter is clipped at the right edge`
      ).toBeLessThanOrEqual(viewportWidth);
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
      // Assert the card carries a status BADGE, not that its text is one of a
      // hand-listed set. The previous whitelist regex drifted from
      // `getEntryStatusBadge` twice over: it omitted "In Ring", which the page
      // plainly renders, and every label added since — and "Scored" never
      // covered "Partially scored" anyway, the capital S stops it matching. It
      // passed only while the first card happened to land in a listed state,
      // then failed on correct UI. Every EntryStatus resolves to a descriptor
      // label, so the durable check is that a badge is there and says
      // something, scoped to the badge row so contextual copy elsewhere on the
      // card ("1 class still to run") cannot stand in for it.
      const statusBadge = entryCards
        .first()
        .locator('.myk9-entries-badges')
        .locator(':scope > *')
        // The status badge is the one carrying the entry-family icon; the
        // payment badge sits beside it in the same row.
        .filter({ has: page.locator('[data-family="entry"]') })
        .first();
      await expect(statusBadge).toBeVisible();
      // Non-empty TEXT, not just a rendered badge: the icon alone would satisfy
      // a container-level emptiness check, leaving a badge whose label span had
      // vanished to pass a test whose whole subject is the label.
      await expect(statusBadge).toHaveText(/\S/);
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
