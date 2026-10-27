import { expect, test } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/**
 * Suite category: feature-audit.
 *
 * Club-admin journey beyond CRUD (MYK9-42): membership, officer staffing, and
 * payments. The canonical e2e admin account (testadmin@myk9t.com) holds
 * the club_admin RBAC grant (supabase/seed-demo.sql section 10: "e2e-admin
 * holds the chairman grant" and the club_admin role is granted to the same
 * account), so signInAsAdmin reaches /club-admin/*.
 *
 * That account is also a site_admin, which is fine HERE — these are structural
 * checks of the surface, and they assert nothing about scope. Do not extend this
 * file with "a club admin may not touch club B": e2e-admin passes every such gate
 * through the is_site_admin() branch, so the assertion would pass vacuously. The
 * club-admin-only fixture (TEST_USERS.CLUB_ADMIN, MYK9-137) exists for that, and
 * needs E2E_CLUB_ADMIN_PASSWORD provisioned before it can sign in.
 *
 * Add Member / Assign Officer dialogs are opened and verified, then cancelled
 * without saving — the club roster is shared fixture data other specs and the
 * screenshot-docs guides read from.
 */

test.describe('Club-admin membership + staffing journey', () => {
  test('members tab shows Members/Officers tabs and the Add Member dialog', async ({ page }) => {
    await signInAsAdmin(page, '/club-admin/members');
    // /club-admin/members redirects to the Members tab of the club page (MYK9-1293).
    await expect(page).toHaveURL(/\/clubs\/[^/?]+\?.*tab=members/, { timeout: 20_000 });

    // Two tab strips: the club page's own, and the manager's "Member management" strip.
    const clubPageTabs = page
      .getByRole('tablist')
      .filter({ has: page.getByRole('tab', { name: /Upcoming Shows/ }) });
    const memberManagementTabs = page.getByRole('tablist', { name: 'Member management' });
    const membersTab = clubPageTabs.getByRole('tab', { name: /^Members/ });
    const officersTab = memberManagementTabs.getByRole('tab', { name: 'Officers' });
    await expect(membersTab).toBeVisible();
    await expect(officersTab).toBeVisible();

    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.getByText('Add Member', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Person', { exact: true })).toBeVisible();
    await expect(page.getByText('Membership Type', { exact: true })).toBeVisible();

    // Cancel — this is a structural check of the staffing surface, not a
    // roster mutation.
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('officers tab shows the Assign Officer dialog with a position field', async ({ page }) => {
    await signInAsAdmin(page, '/club-admin/members');
    await expect(page).toHaveURL(/\/clubs\/[^/?]+\?.*tab=members/, { timeout: 20_000 });

    await page.getByRole('tab', { name: 'Officers' }).click();
    const officersPanel = page.getByRole('tabpanel', { name: 'Officers' });
    const assignOfficerButton = officersPanel
      .getByRole('button', { name: 'Assign Officer' })
      .first();

    await expect(assignOfficerButton).toBeVisible({
      timeout: 15_000,
    });
    // The toolbar and empty-state buttons intentionally trigger the same dialog.
    await assignOfficerButton.click();

    await expect(page.getByText('Assign Officer', { exact: true }).last()).toBeVisible();
    await expect(page.getByLabel('Position')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('club payments tab loads for the club admin', async ({ page }) => {
    await signInAsAdmin(page, '/club-admin/payments');
    await expect(page).toHaveURL(/\/clubs\/[^/?]+\?.*tab=payments/, { timeout: 20_000 });

    await expect(page.getByRole('tab', { name: 'Payments' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 }
    );
    await expect(page.getByText(/Your club receives 100% of entry fees\./i)).toBeVisible({
      timeout: 20_000,
    });
  });
});
