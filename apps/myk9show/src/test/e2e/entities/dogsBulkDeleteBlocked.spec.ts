/**
 * MYK9-584 — a site admin bulk-deleting dogs the server refuses must be TOLD.
 *
 * The production bug this guards: selecting two dogs with paid entries and
 * confirming the delete produced no message at all. The optimistic delete
 * pruned the selection, which unmounted the bulk bar, which took the
 * blocked-delete dialog with it — and `claimFailure` had already suppressed the
 * toast. Every unit test passed; the page-level composition was the broken part,
 * which is exactly what a browser walk sees and a component test cannot.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. `Load 02` and `Load 03` each carry 8 paid
 * entries, so `soft_delete_dog` raises MK002 and nothing is deleted. The walk
 * stops at Close and never ticks the acknowledgement or presses "Delete anyway"
 * — the override is covered by unit tests and a CI-only SQL test instead.
 * If you re-point this at other dogs, verify they are genuinely blocked first,
 * or this spec starts deleting real rows.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/** Dogs verified to carry paid entries, so the delete is always refused. */
const BLOCKED_DOGS = ['Load 02', 'Load 03'] as const;

async function gotoDogsTable(page: Page) {
  await page.goto('/dogs', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Dogs', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: /Name/i })).toBeVisible();
}

/**
 * Selects every blocked dog under ONE filter.
 *
 * Do not search between selections: `useBulkSelection({ pruneToItems: true })`
 * drops the selection for any dog the current filter hides, so selecting A then
 * searching for B silently deselects A. Learned the hard way — the first run of
 * this spec found an empty bulk bar, not a missing menu item.
 */
async function selectBlockedDogs(page: Page) {
  const search = page.getByPlaceholder('Search dogs by name, breed, or owner...');
  await search.fill('Load 0');
  for (const name of BLOCKED_DOGS) {
    const box = page.getByRole('checkbox', { name: `Select ${name}` });
    await expect(box).toBeVisible();
    await box.check();
  }
  await expect(page.getByText(`${BLOCKED_DOGS.length} dogs selected`)).toBeVisible();
}

async function confirmBulkDelete(page: Page) {
  await page.getByRole('button', { name: /bulk actions/i }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`delete ${BLOCKED_DOGS.length} dogs`, 'i') })
    .click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
}

test.describe('bulk delete of dogs the server refuses', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page, '/dogs');
  });

  test('reports the refusal in a persistent dialog AND a toast', async ({ page }) => {
    await gotoDogsTable(page);

    // Each checkbox is anchored to its OWN row — never .first()/.last(), which
    // on a destructive control picks another row.
    await selectBlockedDogs(page);

    // Confirm the ordinary bulk delete. The server will refuse both.
    await confirmBulkDelete(page);

    // THE REGRESSION: both reports must appear. Either one alone is the bug.
    const blockedDialog = page.getByRole('dialog');
    await expect(blockedDialog).toBeVisible({ timeout: 15_000 });
    await expect(blockedDialog.getByText(/could not be deleted/i)).toBeVisible();
    for (const name of BLOCKED_DOGS) {
      await expect(blockedDialog.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/\d+ of \d+ succeeded/)).toBeVisible();

    // MYK9-584: the primary action must be REACHABLE, not merely present.
    // Asserted as geometry rather than presence because the bug was purely
    // layout: the dialog capped at 90vh while the button rendered below its own
    // bottom edge, so `toBeVisible()` passed while a human saw nothing. jsdom
    // reports 0 for every box, so this assertion can only live in a browser.
    const reach = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(b =>
        /delete anyway/i.test(b.textContent || '')
      );
      if (!button) return { found: false as const };
      const box = button.getBoundingClientRect();
      return {
        found: true as const,
        withinViewport: box.bottom <= window.innerHeight && box.top >= 0,
        withinDialog: box.bottom <= (dialog as Element).getBoundingClientRect().bottom + 1,
      };
    });
    expect(reach.found, 'the override button should exist').toBe(true);
    expect(reach.withinViewport, 'the override button should be on screen').toBe(true);
    expect(reach.withinDialog, 'the override button should sit inside the dialog box').toBe(true);

    // Dismiss WITHOUT overriding — nothing is destroyed.
    await blockedDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('leaves both refused dogs in the list after a reload', async ({ page }) => {
    // The second half of the report: one dog vanished from the list and only
    // came back on refresh, because concurrent optimistic rollbacks clobbered
    // each other. Both must still be present immediately AND after a reload.
    await gotoDogsTable(page);

    await selectBlockedDogs(page);
    await confirmBulkDelete(page);

    await expect(page.getByText(/could not be deleted/i)).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();

    // Still there without a refresh...
    const search = page.getByPlaceholder('Search dogs by name, breed, or owner...');
    await search.fill('Load 0');
    for (const name of BLOCKED_DOGS) {
      await expect(page.getByRole('checkbox', { name: `Select ${name}` })).toBeVisible();
    }

    // ...and still there after one, which is where the old rollback diverged.
    await gotoDogsTable(page);
    const searchAfter = page.getByPlaceholder('Search dogs by name, breed, or owner...');
    await searchAfter.fill('Load 0');
    for (const name of BLOCKED_DOGS) {
      await expect(page.getByRole('checkbox', { name: `Select ${name}` })).toBeVisible();
    }
  });
});
