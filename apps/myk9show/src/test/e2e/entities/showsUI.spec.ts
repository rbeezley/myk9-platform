import { test, expect, Page } from '@playwright/test';

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
 * Auth: secretary@myk9t.com / testpass123 (matches clubsUI / dogsUI / peopleUI).
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), {
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

test.describe('Shows UI — Browse (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('browse loads with toolbar, view toggle, tabs', async ({ page }) => {
    await page.goto('/shows');
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Show' })).toBeVisible();
    await expect(page.getByPlaceholder('Search shows by name, location, or club...')).toBeVisible();

    // Filter chips
    for (const label of ['Discipline', 'Entry Status', 'Date Range', 'Club']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }

    // View toggles
    for (const view of ['Cards', 'Table', 'Calendar']) {
      await expect(page.getByRole('button', { name: view, exact: true })).toBeVisible();
    }

    // Tabs
    for (const tab of ['Managing', 'Browse All', 'Past Shows', 'My Entries']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
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
    // Clone affordance is present (Phase 1 — Quiet the Noise: Clone Show ported).
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
    // Required fields are surfaced inline.
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
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

    // myK9Q access codes block is visible in the overview (Phase 1 polish).
    await expect(page.getByRole('heading', { name: 'myK9Q Access Codes', level: 3 })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Run Order — regression guard for the classCreationStore → Supabase fix
// ---------------------------------------------------------------------------

test.describe('Shows UI — Run Order (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Run Order with no trial in URL shows the trial picker', async ({ page }) => {
    await page.goto('/secretary/run-order');
    // INTENT: Page used to render "Run Order Management — No trial selected"
    // (a dead end) when reached via the sidebar. With the picker, the
    // secretary can pick a show + trial and continue.
    await expect(page.getByRole('heading', { name: 'Select a trial', level: 3 })).toBeVisible();
    await expect(page.getByText('Show', { exact: true })).toBeVisible();
    await expect(page.getByText('Trial', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('picker → continue navigates to ?trialId=… and loads classes from DB', async ({ page }) => {
    await page.goto('/secretary/run-order');

    // Show picker.
    await page.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();

    // Trial picker (now enabled).
    const trialCombobox = page.getByRole('combobox').nth(1);
    await expect(trialCombobox).toBeEnabled();
    await trialCombobox.click();
    await page.getByRole('option').first().click();

    await Promise.all([
      page.waitForURL(/\/secretary\/run-order\?trialId=[a-f0-9-]{36}/),
      page.getByRole('button', { name: 'Continue' }).click(),
    ]);

    // INTENT (regression guard): with a trialId in the URL, classes load
    // from Supabase via useTrialClassesWithQuery. The previous
    // classCreationStore-backed implementation rendered "0 classes" for any
    // trial not created in the same browser session.
    await expect(
      page.getByRole('heading', { name: 'Run Order Management', level: 1 })
    ).toBeVisible();
    await expect(page.getByText(/^[1-9]\d* classes$/).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
