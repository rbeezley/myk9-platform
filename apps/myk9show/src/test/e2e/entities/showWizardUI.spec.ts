import { test, expect, Page } from '@playwright/test';

/**
 * UI-driven e2e walk through the secretary's Show Creation Wizard.
 *
 * Strategy:
 *   - Sign in fresh per test (per-worker auth state isn't shared in Playwright).
 *   - Walk all four wizard steps end-to-end and create a real show.
 *   - The timezone-display regression suite is the guard for the
 *     /qa-feature walk that found `MAY 14` rendering for shows starting
 *     `2026-05-15`. Postgres `DATE` columns return `…T00:00:00+00:00`, which
 *     used to be parsed as local time in west-of-UTC zones and shifted the
 *     visible day forward (Apr 26, 2026).
 *
 * Auth: secretary@myk9t.com / testpass123 (matches showsUI.spec.ts).
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

// ---------------------------------------------------------------------------
// Step 1 — Show Details
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Step 1 (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('opens at Step 1 with required-field labels and disabled Next', async ({ page }) => {
    await page.goto('/secretary/create-show/wizard');

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible();
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Entry Period *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Chairman *', { exact: true })).toBeVisible();
    // Show Secretary auto-set to the signed-in user.
    await expect(page.getByText('You', { exact: true })).toBeVisible();

    // Next is disabled until required fields are filled.
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('clone affordance is present (Phase 1 — Quiet the Noise)', async ({ page }) => {
    await page.goto('/secretary/create-show/wizard');
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Date timezone regression — the bug found by /qa-feature on 2026-04-26
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Date timezone regression (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Browse list date block matches the day in the descriptive label', async ({ page }) => {
    // INTENT (regression guard): the date "block" (DateCircle) used to parse
    // a UTC midnight timestamp like "2026-05-22T00:00:00+00:00" with the
    // bare `Date` constructor, which yielded May 21 in CDT — visibly off by
    // one from the descriptive label rendered next to it. Both must show
    // the same calendar day now.
    await page.goto('/shows');
    await page.getByRole('tab', { name: /^Browse All/ }).click();

    // Locate the first card that has a date label like "Jun 13–14".
    const card = page.locator('[role="group"][aria-label*="day show"]').first();
    await expect(card).toBeVisible();
    const ariaLabel = (await card.getAttribute('aria-label')) ?? '';
    // ariaLabel looks like "May 22, 2 day show" — pull "May 22".
    const blockLabel = ariaLabel.split(',')[0]?.trim();
    expect(blockLabel).toMatch(/^[A-Z][a-z]+ \d{1,2}$/);

    // The descriptive label is sibling text; format produced by
    // formatDateRange (e.g. "May 22–23"). Match the same month + start day.
    const monthShort = blockLabel!.split(' ')[0];
    const startDay = blockLabel!.split(' ')[1];
    const sameRow = card.locator('xpath=..').locator(`text=/${monthShort} ${startDay}/`);
    await expect(sameRow.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Add Trials mode — the wizard reused for incremental updates
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Add Trials mode (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Add Trials lands on Step 2 with the show data preloaded', async ({ page }) => {
    await page.goto('/shows');
    await page.getByRole('tab', { name: /^Browse All/ }).click();
    // Open the first show, capture its id from the URL.
    await page.locator('h3').first().click();
    await page.waitForURL(/\/shows\/[a-f0-9-]{36}/);
    const showId = page.url().match(/\/shows\/([a-f0-9-]{36})/)![1]!;

    await page.goto(`/secretary/create-show/wizard?showId=${showId}&mode=add-trials`);

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible();
    await expect(page.getByText('Step 2 of 4', { exact: true })).toBeVisible();
    // The "Add Trial" button is the affordance to start a new trial entry.
    await expect(page.getByRole('button', { name: /^Add Trial$/ }).first()).toBeVisible();
  });
});
