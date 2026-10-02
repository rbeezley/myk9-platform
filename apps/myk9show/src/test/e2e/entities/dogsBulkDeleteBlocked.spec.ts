/**
 * MYK9-584 / CRUD standard Phase 2 — a site admin bulk-deleting dogs the server
 * would refuse must be TOLD, before anything is sent.
 *
 * The production bug this first guarded: confirming the delete of two dogs with
 * paid entries produced no message at all. The shared delete dialog now reads
 * delete_preview first, so the refusal is named in the dialog itself, Delete is
 * held off, and the site-admin override is the only way past it.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. `Ranger` and `Scout` (seed-demo.sql
 * section 5) each carry paid lean-seed entries, so the preview blocks them and
 * `soft_delete_dog` would raise MK002. They were the MYK9-109 load dogs
 * `Load 02` / `Load 03` until MYK9-558 made that fixture opt-in;
 * seedDemoStagingConsumersContract.test.ts pins both the paid entries and the
 * shared search term. The walk stops at Keep it and never ticks the
 * acknowledgement — the override is covered by unit tests and a CI-only SQL test
 * instead. If you re-point this at other dogs, verify they are genuinely blocked
 * first, or this spec starts deleting real rows.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/** Dogs verified to carry paid entries, so the delete is always refused. */
const BLOCKED_DOGS = ['Ranger', 'Scout'] as const;
/**
 * ONE filter that shows both (see selectBlockedDogs): their breeds are
 * German Shepherd Dog and Australian Shepherd.
 */
const BLOCKED_DOGS_SEARCH = 'Shepherd';

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
  await search.fill(BLOCKED_DOGS_SEARCH);
  for (const name of BLOCKED_DOGS) {
    const box = page.getByRole('checkbox', { name: `Select ${name}`, exact: true });
    await expect(box).toBeVisible();
    await box.check();
  }
  await expect(page.getByText(`${BLOCKED_DOGS.length} dogs selected`)).toBeVisible();
}

async function openBulkDelete(page: Page) {
  await page.getByRole('button', { name: /bulk actions/i }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`delete ${BLOCKED_DOGS.length} dogs`, 'i') })
    .click();
  const dialog = page.getByRole('dialog', { name: `Delete ${BLOCKED_DOGS.length} dogs?` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('bulk delete of dogs the server refuses', () => {
  // Pinned, because the geometry assertion below is only meaningful on a
  // viewport short enough for the dialog to hit its 90vh cap. playwright.config
  // runs six projects, and on the 1024px-tall tablet the pre-fix inline footer
  // would have fitted anyway — the guard would pass vacuously there. 720 is the
  // height the original defect was measured at.
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page, '/dogs');
  });

  test('names the blocked dogs before anything is sent, and holds Delete off', async ({ page }) => {
    await gotoDogsTable(page);

    // Each checkbox is anchored to its OWN row — never .first()/.last(), which
    // on a destructive control picks another row.
    await selectBlockedDogs(page);

    const deleteCalls: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/rest/v1/rpc/soft_delete_dog')) deleteCalls.push(request.url());
    });

    const dialog = await openBulkDelete(page);
    // Scoped to the blocked-reason paragraph: each name also appears in the
    // dialog description, so a dialog-wide getByText is a strict-mode ambiguity.
    const blockedReason = dialog.getByTestId('delete-blocked-reason');
    await expect(blockedReason).toContainText(
      /has paid or scored entries|have paid or scored entries/,
      {
        timeout: 15_000,
      }
    );
    for (const name of BLOCKED_DOGS) {
      await expect(blockedReason).toContainText(name);
    }
    const confirm = dialog.getByRole('button', { name: `Delete ${BLOCKED_DOGS.length} dogs` });
    await expect(confirm).toBeDisabled();

    // MYK9-584: the primary action must be REACHABLE, not merely present.
    // Asserted as geometry rather than presence because the bug was purely
    // layout: a dialog capped at 90vh with its button below its own bottom edge.
    const reach = await page.evaluate(count => {
      const dialogEl = document.querySelector('[role="dialog"]');
      const button = Array.from(dialogEl?.querySelectorAll('button') ?? []).find(
        b => (b.textContent || '').trim() === `Delete ${count} dogs`
      );
      if (!button) return { found: false as const };
      const box = button.getBoundingClientRect();
      return {
        found: true as const,
        withinViewport: box.bottom <= window.innerHeight && box.top >= 0,
        withinDialog: box.bottom <= (dialogEl as Element).getBoundingClientRect().bottom + 1,
      };
    }, BLOCKED_DOGS.length);
    expect(reach.found, 'the Delete button should exist').toBe(true);
    expect(reach.withinViewport, 'the Delete button should be on screen').toBe(true);
    expect(reach.withinDialog, 'the Delete button should sit inside the dialog box').toBe(true);

    // The site-admin override is offered, and unticked.
    await expect(dialog.getByRole('checkbox', { name: /delete anyway/i })).not.toBeChecked();

    // Dismiss WITHOUT overriding — nothing is destroyed, nothing was sent.
    await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(deleteCalls).toEqual([]);
  });

  test('leaves both refused dogs in the list after a reload', async ({ page }) => {
    // The second half of the report: one dog vanished from the list and only
    // came back on refresh. Both must still be present immediately AND after a reload.
    await gotoDogsTable(page);

    await selectBlockedDogs(page);
    const dialog = await openBulkDelete(page);

    await expect(dialog.getByText(/paid or scored entries/)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();

    // Still there without a refresh...
    const search = page.getByPlaceholder('Search dogs by name, breed, or owner...');
    await search.fill(BLOCKED_DOGS_SEARCH);
    for (const name of BLOCKED_DOGS) {
      await expect(
        page.getByRole('checkbox', { name: `Select ${name}`, exact: true })
      ).toBeVisible();
    }

    // ...and still there after one, which is where the old rollback diverged.
    await gotoDogsTable(page);
    const searchAfter = page.getByPlaceholder('Search dogs by name, breed, or owner...');
    await searchAfter.fill(BLOCKED_DOGS_SEARCH);
    for (const name of BLOCKED_DOGS) {
      await expect(
        page.getByRole('checkbox', { name: `Select ${name}`, exact: true })
      ).toBeVisible();
    }
  });
});
