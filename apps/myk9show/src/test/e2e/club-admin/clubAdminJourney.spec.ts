import { expect, test } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/**
 * Suite category: feature-audit.
 *
 * Club-admin journey beyond CRUD (MYK9-42): membership, officer staffing, and
 * payments. The canonical e2e admin account (e2e-admin@test.myk9.com) holds
 * the club_admin RBAC grant (supabase/seed-demo.sql section 10: "e2e-admin
 * holds the chairman grant" and the club_admin role is granted to the same
 * account), so signInAsAdmin is the correct sign-in for /club-admin/* — there
 * is no separate club-admin-only test account.
 *
 * Add Member / Assign Officer dialogs are opened and verified, then cancelled
 * without saving — the club roster is shared fixture data other specs and the
 * screenshot-docs guides read from.
 */

test.describe('Club-admin membership + staffing journey', () => {
  test('members page shows Members/Officers tabs and the Add Member dialog', async ({ page }) => {
    await signInAsAdmin(page, '/club-admin/members');
    await expect(page).toHaveURL(/\/club-admin\/members/);

    await expect(page.getByRole('heading', { name: /Members$/, level: 1 })).toBeVisible({
      timeout: 20_000,
    });

    const membersTab = page.getByRole('tab', { name: 'Members' });
    const officersTab = page.getByRole('tab', { name: 'Officers' });
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
    await expect(page).toHaveURL(/\/club-admin\/members/);

    await page.getByRole('tab', { name: 'Officers' }).click();
    await expect(page.getByRole('button', { name: 'Assign Officer' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Assign Officer' }).click();

    await expect(page.getByText('Assign Officer', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Position', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('club payments page loads for the club admin', async ({ page }) => {
    await signInAsAdmin(page, '/club-admin/payments');
    await expect(page).toHaveURL(/\/club-admin\/payments/);

    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible({
      timeout: 20_000,
    });
  });
});
