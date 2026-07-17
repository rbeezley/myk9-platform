import { expect, test } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * Suite category: feature-audit.
 *
 * Exhibitor post-payment lifecycle journey (MYK9-42): refund, withdraw, and
 * scratch/pull, walked against the Heartland Scent Work Classic demo seed.
 *
 * Scope note — there is no exhibitor-initiated self-service cancel/withdraw
 * button anywhere in the app today (pages/MyEntriesPage renders entries
 * read-only + a check-in action; withdrawal and refund are secretary-driven,
 * see components/entries/management/EntryListCard.tsx). "Move-up" is likewise
 * secretary-approved (covered by
 * secretary/entryApprovalAndWaitlistGate.spec.ts). So this spec covers the
 * lifecycle as the app actually implements it:
 *   1. the exhibitor's read-only view of an already-withdrawn/refunded entry
 *      (seed "GAP FIXTURE #4" — entries 059/060, entry_status='withdrawn',
 *      payment_status='refunded', refund columns populated), and
 *   2. the secretary-side withdraw -> refund dialog chain on one of the
 *      exhibitor's paid entries, opened and verified but never confirmed —
 *      confirming would issue a real Stripe refund against shared staging.
 */

const SHOW_MY_ENTRIES_PATH = `/shows/${LIVE_SECRETARY_SHOW_ID}?tab=my-entries`;
const ENTRIES_PATH = `/secretary/entries/${LIVE_SECRETARY_SHOW_ID}`;

test.describe('Exhibitor post-payment lifecycle', () => {
  test('exhibitor sees their withdrawn entry as Withdrawn with the refund amount', async ({
    page,
  }) => {
    await signInAsExhibitor(page, SHOW_MY_ENTRIES_PATH);
    await expect(page).toHaveURL(/tab=my-entries/);

    // Entry ...060 (Ranger, Exterior Excellent) is seeded withdrawn/refunded
    // and owned by e2e-exhibitor — it must render on their own My Entries tab.
    await expect(page.getByText('Withdrawn', { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Refunded/i).first()).toBeVisible();
    await expect(page.getByText('$30', { exact: false }).first()).toBeVisible();
  });

  test('secretary can open the withdraw -> refund dialog chain for a paid entry', async ({
    page,
  }) => {
    await signInAsSecretary(page, `${ENTRIES_PATH}?tab=entries`);
    await expect(page).toHaveURL(/tab=entries/);

    // Entry ...051 (Willow, Container Novice A) is seeded confirmed/paid —
    // its per-entry status menu carries the Withdrawn action.
    const statusMenuTrigger = page
      .getByRole('button', { name: /Change entry status for Willow/i })
      .first();
    await expect(statusMenuTrigger).toBeVisible({ timeout: 20_000 });
    await statusMenuTrigger.click();

    await page.getByRole('menuitem', { name: 'Withdrawn' }).click();
    await expect(page.getByRole('dialog', { name: 'Record Withdrawal Reason' })).toBeVisible();

    // Cancel out — confirming would (a) actually withdraw a shared seed entry
    // other specs depend on staying 'confirmed'/'paid', and (b) chain into
    // RefundEntryDialog, which submits a real Stripe refund.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Record Withdrawal Reason' })).toBeHidden();
  });

  test('pulls tab (scratch/DNS requests) renders its empty state cleanly', async ({ page }) => {
    await signInAsSecretary(page, `${ENTRIES_PATH}?tab=pulls`);
    await expect(page).toHaveURL(/tab=pulls/);

    // No pull/scratch request is seeded for this show — assert the tab loads
    // and shows a "nothing pending" state rather than an error, proving the
    // scratch-approval surface itself is reachable even with zero fixtures.
    await expect(page.getByText('Pull Management')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/no pending pull/i).or(page.getByText(/no pull requests/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});
