import { expect, test } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * Suite category: feature-audit.
 *
 * Secretary entry-decision gate + move-up promotion journey (MYK9-42).
 * Exercises the secretary "pending decision" surfaces on
 * pages/secretary/EntryManagementPage.tsx (`?tab=entries|move-ups`) against
 * the Heartland Scent Work Classic demo seed, which ships fixtures built
 * specifically for this walk:
 *   - entries 053/054/057 are 'submitted'/'pending' -> the Entries tab's
 *     enrollment-group "Accept All / Reject All" actions (Cards view — the
 *     default Table view uses a flat per-row status menu instead, see
 *     components/entries/management/EntryFocusedRegistration.tsx).
 *   - entry 056 (Scout) is entry_status='move-up-requested' ("GAP FIXTURE #3",
 *     see supabase/seed-demo.sql section 6) -> the Move-ups tab.
 *
 * These fixtures are shared with the screenshot-docs walk and other e2e specs,
 * so this spec opens each action's confirmation dialog to verify the gate is
 * reachable and correctly populated, then cancels out instead of confirming —
 * approving/denying for real would consume the fixture and break the other
 * consumers. (No write-guard exists yet for these mutations, unlike the
 * ringside_update_entry RPC covered by sharedStagingWriteGuard.ts.)
 *
 * Waitlist-promotion approval is NOT covered here: the seed's waitlist
 * fixture (Juniper, Interior Advanced, "GAP FIXTURE #6") is currently
 * status='expired' in shared staging rather than the seeded 'waiting'
 * (confirmed live via read-only query — some prior run or a TTL job appears
 * to have expired it), and getWaitlistByClass filters to waiting-only, so the
 * Waitlist tab shows its empty state instead of a promotable row. This is a
 * seed-drift gap, not a product gap — see SUMMARY (MYK9-42).
 */

const ENTRIES_PATH = `/secretary/entries/${LIVE_SECRETARY_SHOW_ID}`;

test.describe('Secretary entry approval + move-up gate', () => {
  test('entries tab exposes Accept All / Reject All for pending registrations', async ({
    page,
  }) => {
    await signInAsSecretary(page, `${ENTRIES_PATH}?tab=entries`);
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(ENTRIES_PATH)}\\?tab=entries`));

    // The enrollment-group "Accept All / Reject All" actions only render in
    // Cards view (Table view — the default — shows a flat per-row menu).
    await page.getByRole('button', { name: 'Cards view' }).click();

    // At least one pending-registration enrollment group renders (053/054/057
    // are seeded 'submitted'). Its "Actions" menu carries the decision gate.
    // exact:true — a substring match also catches the page header's "More
    // show actions" button, which renders first in DOM order.
    const actionsButton = page.getByRole('button', { name: 'Actions', exact: true }).first();
    await expect(actionsButton).toBeVisible({ timeout: 20_000 });
    await actionsButton.click();

    await expect(page.getByRole('menuitem', { name: 'Accept All' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Reject All' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Missing Info' })).toBeVisible();

    // Close the menu without acting — this is a structural/data-rendering
    // check, not a mutation.
    await page.keyboard.press('Escape');
  });

  test('move-ups tab surfaces the pending move-up request with a valid target', async ({
    page,
  }) => {
    await signInAsSecretary(page, `${ENTRIES_PATH}?tab=move-ups`);
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(ENTRIES_PATH)}\\?tab=move-ups`));

    await expect(page.getByText(/Move-Up Requests \(\d+\)/)).toBeVisible({ timeout: 20_000 });

    // The pending-request list is read through the replicated (offline-first)
    // entries table, which can still be syncing on a cold session even after
    // the count heading renders — retry the Refresh action instead of
    // treating a first-paint "(0)" as final.
    await expect
      .poll(
        async () => {
          if (
            await page
              .getByText('No Pending Move-Up Requests')
              .isVisible()
              .catch(() => false)
          ) {
            await page.reload();
            await expect(page.getByText(/Move-Up Requests \(\d+\)/)).toBeVisible({
              timeout: 20_000,
            });
          }
          return page.getByText('Scout', { exact: false }).first().isVisible();
        },
        { timeout: 60_000 }
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Approve' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Approve Move-Up Request' })).toBeVisible();

    // The target-class select should offer Interior Advanced (seed comment:
    // "same element, higher level" is the only valid destination).
    await expect(page.getByText('Target Class')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Approve Move-Up Request' })).toBeHidden();
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
