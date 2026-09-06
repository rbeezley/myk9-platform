import { test, expect } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';

/**
 * UI-driven e2e tests for the Shows section — secretary role.
 *
 * Strategy:
 *   - Read-only walk against the seed data shown in the secretary fixture
 *     (at least one show + one trial with classes).
 *   - The Run Order suite is the regression guard for the
 *     classCreationStore → Supabase fix: the page used to render "0 classes"
 *     against any trial not created in the same browser session.
 *
 * Auth: env-backed canonical secretary (see helpers/testUsers signInAsSecretary).
 */

test.describe.configure({ mode: 'serial' });

const QA_PREMIUM_MONOGRAM_SHOW_ID = '5d8bfe56-a48d-48dd-ae75-7f90c2e02c4f';

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

test.describe('Shows UI — Browse (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('browse loads with toolbar, view toggle, tabs', async ({ page }) => {
    await page.goto('/shows');
    await expect(page.getByRole('heading', { name: 'Find Shows', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Show' })).toBeVisible();
    await expect(page.getByPlaceholder('Search shows by name, location, or club...')).toBeVisible();

    // Filter chips — scope to the FilterChips region so a chip label (e.g.
    // "Club") doesn't collide with a table column-header button ("Host Club").
    const filterChips = page.getByTestId('filter-chips');
    for (const label of ['Discipline', 'Entry Status', 'Date Range', 'Club']) {
      await expect(filterChips.getByRole('button', { name: label })).toBeVisible();
    }

    // View toggles — target the exact aria-label ("<Mode> view") so "Table"
    // doesn't also match the "Reset table view" button.
    for (const view of ['Cards', 'Table', 'Calendar']) {
      await expect(page.getByRole('button', { name: `${view} view`, exact: true })).toBeVisible();
    }

    // Tabs — Past Shows is gone; its months live in the scrubber (MYK9-427)
    for (const tab of ['Managing', 'Browse All']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: /^Past Shows/ })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Filter shows by month' })).toBeVisible();
  });

  test('Browse All tab shows seeded shows', async ({ page }) => {
    await page.goto('/shows');
    await page.getByRole('tab', { name: /^Browse All/ }).click();
    // The seeded fixture must have at least one show with a date label.
    await expect(page.getByText(/2 days|1 day/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test.describe('Shows UI — Create wizard (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('New Show button opens the wizard at step 1', async ({ page }) => {
    await page.goto('/shows');
    await Promise.all([
      page.waitForURL(/\/secretary\/create-show\/wizard/),
      page.getByRole('button', { name: 'New Show' }).click(),
    ]);
    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible();
    // Clone is owned by the wizard, not a second Calendar-page dialog.
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
    // Required fields are surfaced inline.
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
  });

  test('add-classes mode preserves existing class counts while selecting new classes', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Runs against the local desktop Chromium QA fixture.');

    await page.goto(
      `/secretary/create-show/wizard?showId=${QA_PREMIUM_MONOGRAM_SHOW_ID}&mode=add-classes`
    );

    await expect(page.getByRole('heading', { name: 'Classes (32)' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('tab', { name: /Friday Trial 1 8/ })).toBeVisible();

    await page.getByRole('checkbox', { name: 'Novice B' }).first().click();

    await expect(page.getByRole('heading', { name: 'Classes (33)' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('tab', { name: /Friday Trial 1 9/ })).toBeVisible();
    await expect(page.getByText('33 total classes configured across 4 trials')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Novice B' }).first().click();

    await expect(page.getByRole('heading', { name: 'Classes (32)' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Friday Trial 1 8/ })).toBeVisible();
    await expect(page.getByText('32 total classes configured across 4 trials')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

test.describe('Shows UI — Detail (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('show detail tabs render', async ({ page }) => {
    await page.goto('/shows');
    // Open the first show card from Browse All — works regardless of which
    // seed show is most recent.
    await page.getByRole('tab', { name: /^Browse All/ }).click();
    await page.locator('h3').first().click();
    await page.waitForURL(/\/shows\/[a-f0-9-]{36}/);

    for (const tab of ['Overview', 'Trials', 'Classes', 'Entries', 'Results']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }

    // Show access codes block is visible in the overview (Phase 1 polish).
    await expect(page.getByRole('heading', { name: 'Show Access Codes', level: 3 })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Run Order — legacy /secretary/run-order page deleted in PR #754.
// The route now redirects into the workbench; redirect behavior is covered
// deterministically by src/test/routes/secretaryShowPhaseRedirects.test.tsx,
// so the former picker/Run Order Management e2e guards were removed here.
// ---------------------------------------------------------------------------
