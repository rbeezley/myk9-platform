import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

/**
 * Phase B of docs/plan-ia-admin-person-detail.md: a roster row drills down to
 * the person's record, and the trip is reversible.
 *
 * The round trip is the point. Unit tests cover the URL codec and the breadcrumb
 * builder in isolation; only a real browser proves the three pieces agree — the
 * roster writes its state to the URL, the drill-down carries that URL in router
 * state, and the breadcrumb walks back to the same filtered list.
 *
 * Registered in REGRESSION_SPECS (nightly), not PR smoke: the PR smoke job is
 * given only E2E_SECRETARY_* credentials, and this needs a site admin.
 */
test.describe('Admin user roster drill-down', () => {
  test.beforeEach(async ({ page }) => {
    const testSetup = new TestSetup(page);
    await testSetup.signIn('admin');
    await page.goto('/admin/users');
    await page.waitForLoadState('domcontentloaded');
  });

  test('a search term lands in the URL', async ({ page }) => {
    await page.getByPlaceholder(/search by name/i).fill('a');

    await expect(page).toHaveURL(/[?&]q=a\b/);
  });

  test('a row opens the person record, and the breadcrumb walks back to the same list', async ({
    page,
  }) => {
    await page.getByPlaceholder(/search by name/i).fill('a');
    await expect(page).toHaveURL(/[?&]q=a\b/);

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    // Drilled down to the record — not the edit panel.
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

    // The trail names where we came from, not the canonical /people parent.
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb.getByRole('button', { name: 'Admin' })).toBeVisible();
    await expect(breadcrumb.getByRole('button', { name: 'People' })).toHaveCount(0);

    await breadcrumb.getByRole('button', { name: 'Users' }).click();

    // Back on the roster with the search still applied.
    await expect(page).toHaveURL(/\/admin\/users\?.*\bq=a\b/);
    await expect(page.getByPlaceholder(/search by name/i)).toHaveValue('a');
  });

  test('the browser Back button also restores the filtered list', async ({ page }) => {
    await page.getByPlaceholder(/search by name/i).fill('a');
    await expect(page).toHaveURL(/[?&]q=a\b/);

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/admin\/users\?.*\bq=a\b/);
    await expect(page.getByPlaceholder(/search by name/i)).toHaveValue('a');
  });

  test('"Edit user" stays on the roster', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.getByRole('button', { name: /^actions for/i }).click();
    await page.getByRole('menuitem', { name: 'Edit user' }).click();

    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('dialog').or(page.getByRole('complementary'))).toBeVisible();
  });
});
