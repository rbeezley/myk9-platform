import { expect, test, type Page } from '@playwright/test';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from '../helpers/testUsers';
import { expectNoHorizontalOverflow } from '../helpers/horizontalOverflow';
import { measureReviewColumn } from '../helpers/entryReviewColumnGeometry';

/**
 * The Entry Forms list's "Needs review" pill renders in full beside the open form panel
 * (MYK9-1898). At 1440x900 it read "Needs revi…" and the column heading "REVIEW / PAY…"; at
 * 1200x750 "Accepted" and "Payment due" clipped the same way. The pill is the one label the list
 * exists to make obvious (MYK9-1594), and the animated landing scene (MYK9-1894) captures it.
 *
 * Only rendered geometry can see a clipped label, so every label in the "Review / payment" column
 * is measured: content wider or taller than its box, or a pill past its cell's edge, fails. A run
 * with no pill on screen fails too, so a pass is a verdict about the pill, not an empty list.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const ENTRIES = `/shows/${SHOW_ID}/entries`;

// A cold dev server compiles the show page on first load.
test.setTimeout(90_000);

/**
 * The seed has no form awaiting review, and this spec must never write to the shared database to
 * make one. So the entries replica's two reads are passed through with one form's rows turned
 * back to "pending": the server's real rows, one status changed, in the browser only (the method
 * the landing prototype used, MYK9-1894). Both reads change the same form.
 */
async function stageOneFormNeedingReview(page: Page) {
  let registrationId: string | null = null;
  for (const table of ['entries', 'view_authenticated_entry_results_replication']) {
    await page.route(`**/rest/v1/${table}{,?*}`, async route => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const rows = (await response.json()) as unknown;
      if (Array.isArray(rows)) {
        const candidates = (rows as Array<{ registration_id?: string; entry_status?: string }>)
          .filter(row => row.entry_status === 'confirmed' && row.registration_id)
          .map(row => row.registration_id as string)
          .sort();
        registrationId ??= candidates[0] ?? null;
        for (const row of rows as Array<{ registration_id?: string; entry_status?: string }>) {
          if (registrationId && row.registration_id === registrationId)
            row.entry_status = 'pending';
        }
      }
      await route.fulfill({ response, json: rows });
    });
  }
}

async function openEntryForms(page: Page, viewport: { width: number; height: number }) {
  // Default guard: strict mode would also refuse the secretary page's read RPCs.
  await installSharedStagingWriteGuard(page);
  await stageOneFormNeedingReview(page);
  await page.setViewportSize(viewport);
  await signInAsSecretary(page, ENTRIES);
  await page.goto(ENTRIES);
  await expect(page.getByRole('list', { name: 'Entry form work queue' })).toBeVisible({
    timeout: 60_000,
  });
  // Positive control: the staged form awaits review, so the pill is on screen.
  await expect(page.getByTestId('needs-review-marker').first()).toBeVisible({ timeout: 30_000 });
}

/** Opens the first form that needs review, so the detail panel sits beside the list. */
async function openFormNeedingReview(page: Page) {
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByTestId('needs-review-marker') })
    .first();
  // The row's action control carries the row id (`getEntryRegistrationRowId`).
  await row.locator('button[id^="entry-registration-"]').click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  // Let the panel settle: the queue column's width is what the labels are measured against.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function expectReviewColumnInFull(page: Page, label: string, withHeading: boolean) {
  const geometry = await measureReviewColumn(page);
  expect(geometry.pills, `${label}: a "Needs review" pill must render`).toBeGreaterThan(0);
  expect(geometry.cells, `${label}: review cells must render`).toBeGreaterThan(0);
  expect(geometry.heading, `${label}: "Review / payment" heading on screen`).toBe(withHeading);
  expect(geometry.clipped, `${label}: no review or payment label may be clipped`).toEqual([]);
  expect(geometry.actionsOutOfReach, `${label}: every row action stays inside the list`).toEqual(
    []
  );
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1200, height: 750 },
]) {
  test(`Needs review renders in full beside the open form at ${viewport.width}px (MYK9-1898)`, async ({
    page,
  }) => {
    await openEntryForms(page, viewport);
    await openFormNeedingReview(page);
    // The layout under test is the split one: the list and the panel side by side.
    await expect(page.getByRole('list', { name: 'Entry form work queue' })).toBeVisible();
    await expect(page.getByTestId('entry-review-heading')).toHaveText('Review / payment');

    await expectReviewColumnInFull(page, `${viewport.width}px with the panel open`, true);
    await expectNoHorizontalOverflow(page, `Entry Forms at ${viewport.width}px`);
  });
}

test('Needs review renders in full in the stacked list at 390px (MYK9-1898)', async ({ page }) => {
  const PHONE = { width: 390, height: 844 } as const;
  await openEntryForms(page, PHONE);
  // On a phone the form replaces the list, so the list is measured as the secretary sees it.
  await expectReviewColumnInFull(page, '390px stacked list', false);
  await expectNoHorizontalOverflow(page, 'Entry Forms at 390px');
});
