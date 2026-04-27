import { test, expect, Page } from '@playwright/test';

/**
 * UI tests for the Entry Management page (secretary role).
 *
 * Walks /secretary/entries/:showId as secretary@myk9t.com against the seeded
 * June 2026 AKC Scent Work show. Tests are stateless w.r.t. DB content — they
 * verify UI flows (browse, bulk dialogs, armband, comp) regardless of what
 * status the seeded entries currently have.
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

// Seeded "June 2026" AKC Scent Work show.
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const ENTRIES_URL = `/secretary/entries/${SHOW_ID}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL('/shows');
}

async function signInAsSecretary(page: Page) {
  return signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

/** Navigate to entries page and wait for the entries list to render. */
async function gotoEntries(page: Page) {
  await page.goto(ENTRIES_URL);
  // The entries-card heading is the data-loaded signal
  await page
    .getByRole('heading')
    .filter({ hasText: /^Entries \(\d+\)$/ })
    .waitFor({ timeout: 10_000 });
}

/**
 * Click the "Select All" checkbox in the entries list header. The visible
 * "Select All" toggle is a Checkbox + sibling span inside the entries-card
 * header — there's no <label> wrapping them, so we scope to the entries-card
 * heading's parent and click the only checkbox in that header row.
 */
async function selectAllEntries(page: Page) {
  const entriesHeader = page
    .getByRole('heading')
    .filter({ hasText: /^Entries \(\d+\)$/ })
    .locator('..');
  await entriesHeader.getByRole('checkbox').click();
}

// ─── Browse ───────────────────────────────────────────────────────────────────

test.describe('Browse entries', () => {
  test('loads the June 2026 show with stats and entry cards', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    // Stats card subtitles are unique strings (avoids collision with tab labels)
    await expect(page.getByText('Total Entries', { exact: true })).toBeVisible();
    await expect(page.getByText('Need review', { exact: true })).toBeVisible();
    await expect(page.getByText('Confirmed entries', { exact: true })).toBeVisible();

    // At least one entry card heading must appear
    await expect(page.getByRole('heading', { level: 4 }).first()).toBeVisible();
  });

  test('search filter renders matching entries', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await page.getByRole('textbox', { name: 'Search entries...' }).fill('Bravo');

    // The Bravo dog has at least one entry on the seeded show
    await expect(page.getByText('Bravo').first()).toBeVisible();

    await page.getByRole('textbox', { name: 'Search entries...' }).fill('');
  });

  test('tab navigation: Entries / Waitlist outer tabs', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await page.getByRole('tab', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();

    await page.getByRole('tab', { name: 'Entries', exact: true }).click();
    await expect(page.getByText('Total Entries', { exact: true })).toBeVisible();
  });
});

// ─── Bulk actions ──────────────────────────────────────────────────────────────

test.describe('Bulk actions', () => {
  test('Change Status dialog opens after Select All + Change Status click', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await selectAllEntries(page);

    const changeStatusBtn = page.getByRole('button', { name: 'Change Status' });
    await expect(changeStatusBtn).toBeVisible();

    // Regression guard for 2026-04-27 stale-closure bug: dialog never opened
    await changeStatusBtn.click();
    await expect(page.getByRole('dialog', { name: 'Bulk Status Change' })).toBeVisible();

    // Dialog has the three status options
    await page.locator('[role="dialog"] [role="combobox"]').click();
    await expect(page.getByRole('option', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Move to Waitlist' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Reject' })).toBeVisible();
  });

  test('Bulk Check-In dialog opens and confirming does not crash the component', async ({
    page,
  }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await selectAllEntries(page);

    const bulkCheckInBtn = page.getByRole('button', { name: 'Bulk Check-In' });
    await expect(bulkCheckInBtn).toBeVisible();
    await bulkCheckInBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Bulk Check-In' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Check in all classes for/)).toBeVisible();

    // Capture the PATCH the click fires so we can assert it targets the correct
    // table column. With the previous bug (passing class definition IDs), the
    // PATCH still returned 200 because Supabase silently matches zero rows for
    // unknown UUIDs — the UI looked fine but nothing was persisted. Asserting
    // on the request URL distinguishes "wrote correctly" from "wrote nothing".
    const [patchRequest] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/rest/v1/entries') && r.method() === 'PATCH'),
      page.getByRole('button', { name: 'Check In All' }).click(),
    ]);

    // The request body must set is_in_ring (the column bulkCheckIn writes).
    const body = patchRequest.postDataJSON() as Record<string, unknown> | null;
    expect(body).toMatchObject({ is_in_ring: true });

    await expect(dialog).not.toBeVisible();

    // 'checked_in' typo crash regression: LoadingErrorBoundary must NOT fire.
    await expect(page.getByText('Failed to load component')).not.toBeVisible();

    // Optimistic UI shows Checked In immediately
    await expect(page.getByRole('button', { name: /Checked In/ }).first()).toBeVisible();

    // Persistence regression: reload and re-assert. With the class-IDs bug,
    // the PATCH targeted nonexistent entry rows, so this re-render after a
    // fresh DB fetch would revert to "Not Checked In".
    await page.reload();
    await page
      .getByRole('heading')
      .filter({ hasText: /^Entries \(\d+\)$/ })
      .waitFor({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Checked In/ }).first()).toBeVisible();
  });
});

// ─── Armband assignment ────────────────────────────────────────────────────────

test.describe('Armband assignment', () => {
  test('Auto-Assign Armbands dialog opens with starting number field and cancels cleanly', async ({
    page,
  }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await page.getByRole('button', { name: 'Auto-Assign Armbands' }).click();

    const dialog = page.getByRole('dialog', { name: /Auto-Assign/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Automatically assign sequential armband numbers/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('manual Assign Armband dialog opens for an entry', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    // The seeded June 2026 show has at least one entry with an Assign Armband
    // button; failing means the entry-action row regressed.
    const assignBtn = page.getByRole('button', { name: 'Assign Armband' }).first();
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Assign Armband' });
    await expect(dialog).toBeVisible();
    // Either an input or the Assign button confirms the dialog body rendered.
    await expect(dialog.getByRole('button', { name: /Assign|Cancel/ }).first()).toBeVisible();

    // Cancel out (test does not mutate state)
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});

// ─── Comp entry ────────────────────────────────────────────────────────────────

test.describe('Comp entry', () => {
  test('Comp Entry dialog opens with reason field', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    // The seeded show always has at least one un-comped entry showing the
    // "Comp Entry" button; if this disappears the entry-action row regressed.
    const compBtn = page.getByRole('button', { name: 'Comp Entry' }).first();
    await expect(compBtn).toBeVisible();
    await compBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Comp Entry' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/This waives all fees/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Reason' })).toBeVisible();

    // Cancel out (test does not mutate state)
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
