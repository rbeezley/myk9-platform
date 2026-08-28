import { test, expect, Page, type TestInfo } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * UI tests for the Entry Management page (secretary role).
 *
 * Walks the canonical `/shows/:showId/entry-management` surface as the
 * secretary role against the maintained Heartland seed. Card-only assertions
 * explicitly switch to Cards view; table-only row-action and selection coverage
 * stays on desktop projects; mobile-chrome and tablet skip those tests because
 * they render enrollment cards instead.
 */

test.describe.configure({ mode: 'serial' });

// The maintained seeded secretary show (Heartland Scent Work Classic). Use the
// shared constant so the spec tracks reseeds instead of a hardcoded show id.
const SHOW_ID = LIVE_SECRETARY_SHOW_ID;
const ENTRIES_URL = `/shows/${SHOW_ID}/entry-management`;

/** Navigate to entries page and wait for the entries list to render. */
async function gotoEntries(page: Page) {
  const entriesResponse = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      response.url().includes('/rest/v1/entries') &&
      response.url().includes('show_id=eq.'),
    { timeout: 10_000 }
  );
  await page.goto(ENTRIES_URL);
  // The "Total Entries" title is the data-loaded signal.
  await page.getByText('Total Entries', { exact: true }).waitFor({ timeout: 10_000 });
  await entriesResponse;
}

/**
 * Click the canonical table selection checkbox. The enrollment-card view does
 * not expose this control, so callers that need it keep the desktop table view.
 */
async function selectAllEntries(page: Page) {
  await page.getByRole('checkbox', { name: 'Select all entries' }).click();
}

function skipMobileTableCoverage(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name === 'mobile-chrome' || testInfo.project.name === 'tablet',
    'Table-only Entry Management coverage is not rendered by mobile/table projects'
  );
}

// ─── Browse ───────────────────────────────────────────────────────────────────

test.describe('Browse entries', () => {
  test('loads the seeded secretary show with stats and entry cards', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    // Stats card subtitles are unique strings (avoids collision with tab labels)
    await expect(page.getByText('Total Entries', { exact: true })).toBeVisible();
    await expect(page.getByText('Need review', { exact: true })).toBeVisible();
    await expect(page.getByText('Confirmed entries', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Cards view' }).click();
    const firstEntryCard = page.locator('.border.rounded-lg').filter({ hasText: 'Willow' }).first();
    await expect(firstEntryCard).toBeVisible();
  });

  test('search filter renders matching entries', async ({ page }) => {
    await signInAsSecretary(page);
    await gotoEntries(page);

    await page.getByRole('textbox', { name: 'Search entries' }).fill('Willow');

    // Willow is a dog seeded into the maintained secretary show (Heartland).
    await expect(page.getByText('Willow').first()).toBeVisible();

    await page.getByRole('textbox', { name: 'Search entries' }).fill('');
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
  }, testInfo) => {
    skipMobileTableCoverage(testInfo);
    await signInAsSecretary(page);
    await page.goto(`${ENTRIES_URL}?attention=all`);
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 10_000,
    });

    const rowActions = page.getByRole('button', { name: /^Actions for / }).first();
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

test.describe('Bulk actions', () => {
  test('bulk action menu keeps registration decisions and omits check-in', async ({
    page,
  }, testInfo) => {
    skipMobileTableCoverage(testInfo);
    await signInAsSecretary(page);
    await gotoEntries(page);

    await selectAllEntries(page);

    const bulkActions = page.getByRole('button', { name: 'Bulk actions' });
    await expect(bulkActions).toBeVisible();
    await bulkActions.click();

    await expect(page.getByRole('menuitem', { name: /Accept .* selected/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Check in .* selected/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Reject .* selected/ })).toBeVisible();
  });
});

// ─── Armband assignment ────────────────────────────────────────────────────────

test.describe('Armband assignment', () => {
  test('manual armband dialog opens from the entry row action menu', async ({ page }, testInfo) => {
    skipMobileTableCoverage(testInfo);
    await signInAsSecretary(page);
    await gotoEntries(page);

    // The armband action lives in the per-row Actions menu, and its label is
    // "Assign armband" (unassigned) or "Change armband" (already assigned) —
    // match both so the test is robust to the seed's armband state.
    await page
      .getByRole('button', { name: /Actions for/i })
      .first()
      .click();
    const armbandItem = page.getByRole('menuitem', { name: /(Assign|Change) armband/i }).first();
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

test.describe('Comp entry', () => {
  test('Comp Entry dialog opens with reason field', async ({ page }, testInfo) => {
    skipMobileTableCoverage(testInfo);
    await signInAsSecretary(page);
    await gotoEntries(page);

    const rowActions = page.getByRole('button', { name: /^Actions for / }).first();
    await rowActions.click();
    const compItem = page.getByRole('menuitem', { name: 'Comp entry', exact: true });
    await expect(compItem).toBeVisible();
    await compItem.dispatchEvent('click');

    const dialog = page.getByRole('dialog', { name: 'Comp Entry' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/This waives all fees/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Reason' })).toBeVisible();

    // Cancel out (test does not mutate state)
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
