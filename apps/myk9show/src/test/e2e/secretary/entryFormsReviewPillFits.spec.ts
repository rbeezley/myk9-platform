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
      let rows: unknown;
      try {
        rows = await response.json();
      } catch {
        // An empty or non-JSON body (a 204, a proxy page) passes through untouched.
        await route.fulfill({ response });
        return;
      }
      if (Array.isArray(rows)) {
        type Row = { registration_id?: string; entry_status?: string; show_id?: string };
        // Only this show's forms: another scope's pull must never pick the staged form.
        const candidates = (rows as Row[])
          .filter(
            row =>
              row.show_id === SHOW_ID && row.entry_status === 'confirmed' && row.registration_id
          )
          .map(row => row.registration_id as string)
          .sort();
        registrationId ??= candidates[0] ?? null;
        for (const row of rows as Row[]) {
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

/**
 * Opens the first form that needs review, so the detail panel sits beside the list, then waits on
 * layout, not on the network: the list's width must stop changing and the list must settle into
 * the expected grid or stacked layout before anything is measured against its width. (The panel's
 * column is reserved before a form opens, so the list does not narrow on the click.)
 */
async function openFormNeedingReview(page: Page, grid: boolean) {
  const listSection = page.locator('section[aria-label="Entry forms"]');
  const listWidth = async () => Math.round((await listSection.boundingBox())?.width ?? 0);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByTestId('needs-review-marker') })
    .first();
  // The row's action control carries the row id (`getEntryRegistrationRowId`).
  await row.locator('button[id^="entry-registration-"]').click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await listWidth();
        const stable = now === last;
        last = now;
        return stable;
      },
      { message: 'the list width stops changing', intervals: [150] }
    )
    .toBe(true);
  await expect(page.getByTestId('entry-review-heading')).toHaveCount(grid ? 1 : 0);
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

// At 1440px the list beside the panel is wide enough for the grid; at 1200px (about 530px of
// list) it stacks, so names and labels are never cut to a few characters (MYK9-1898).
for (const viewport of [
  { width: 1440, height: 900, grid: true },
  { width: 1200, height: 750, grid: false },
]) {
  test(`Needs review renders in full beside the open form at ${viewport.width}px (MYK9-1898)`, async ({
    page,
  }) => {
    await openEntryForms(page, viewport);
    await openFormNeedingReview(page, viewport.grid);
    // The layout under test is the split one: the list and the panel side by side.
    await expect(page.getByRole('list', { name: 'Entry form work queue' })).toBeVisible();
    if (viewport.grid) {
      await expect(page.getByTestId('entry-review-heading')).toHaveText('Review / payment');
    }

    await expectReviewColumnInFull(page, `${viewport.width}px with the panel open`, viewport.grid);
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
