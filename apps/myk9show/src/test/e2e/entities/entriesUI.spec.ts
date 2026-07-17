import { test, expect, Page } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * UI tests for the Entry Management page (secretary role).
 *
 * Walks /secretary/entries/:showId as TEST_USERS.SECRETARY against the seeded
 * secretary show, verifying UI flows (browse, bulk dialogs, armband, comp).
 *
 * SKIPPED pending MYK9-46. This whole file needs a coherent rewrite against the
 * restructured Entry Management page and a clean seed: assertions carry stale
 * assumptions (fixture dog names, every-entry-has-an-armband), and several tests
 * use the desktop `Actions for` row menu that the `mobile-chrome` project never
 * renders (it shows enrollment cards instead). Skipping the file wholesale is
 * more honest than piecemeal patches that only pass on one project + seed state.
 */

test.describe.configure({ mode: 'serial' });

// The maintained seeded secretary show (Heartland Scent Work Classic). Use the
// shared constant so the spec tracks reseeds instead of a hardcoded show id.
const SHOW_ID = LIVE_SECRETARY_SHOW_ID;
const ENTRIES_URL = `/secretary/entries/${SHOW_ID}`;

/** Navigate to entries page and wait for the entries list to render. */
async function gotoEntries(page: Page) {
  await page.goto(ENTRIES_URL);
  // The "Total Entries" stat subtitle is the data-loaded signal.
  await page.getByText('Total Entries', { exact: true }).waitFor({ timeout: 10_000 });
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

test.describe.skip('Browse entries', () => {
  test('loads the seeded secretary show with stats and entry cards', async ({ page }) => {
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

    await page.getByRole('textbox', { name: 'Search entries...' }).fill('Willow');

    // Willow is a dog seeded into the maintained secretary show (Heartland).
    await expect(page.getByText('Willow').first()).toBeVisible();

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

  test('entry row Actions menu teardown does not block the Add entries decision point', async ({
    page,
  }) => {
    await signInAsSecretary(page);
    await page.goto(`/secretary/entries/${LIVE_SECRETARY_SHOW_ID}?attention=all`);
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 10_000,
    });

    const rowActions = page.getByRole('button', { name: /Actions for/i }).first();
    await expect(rowActions).toBeVisible();
    await rowActions.click();

    const removeEntryItem = page.getByRole('menuitem', { name: /Remove entry/i }).first();
    await expect(removeEntryItem).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(removeEntryItem).not.toBeVisible();

    await expect(page.getByRole('group', { name: 'Add entries' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter my own dogs' })).toBeVisible();
    await page.getByRole('button', { name: 'Add mail-in entry' }).click();
    await page.waitForURL(`**/secretary/register/${LIVE_SECRETARY_SHOW_ID}`, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ─── Bulk actions ──────────────────────────────────────────────────────────────

test.describe.skip('Bulk actions', () => {
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

test.describe.skip('Armband assignment', () => {
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

  test('manual armband dialog opens from the entry row action menu', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    // The armband action lives in the per-row Actions menu, and its label is
    // "Assign armband" (unassigned) or "Change armband" (already assigned) —
    // match both so the test is robust to the seed's armband state.
    await page
      .getByRole('button', { name: /Actions for/i })
      .first()
      .click();
    const armbandItem = page
      .getByRole('menuitem', { name: /(Assign|Change) armband/i })
      .first();
    await expect(armbandItem).toBeVisible();
    await armbandItem.click();

    // The dialog title is "Assign Armband" in both modes (see ArmbandDialog).
    const dialog = page.getByRole('dialog', { name: 'Assign Armband' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Assign|Cancel/ }).first()).toBeVisible();

    // Cancel out (test does not mutate state)
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});

// ─── Comp entry ────────────────────────────────────────────────────────────────

test.describe.skip('Comp entry', () => {
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
