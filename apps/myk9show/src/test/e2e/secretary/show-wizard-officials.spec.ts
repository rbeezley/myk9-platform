import { test, expect } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

/**
 * Smoke tests: Officials & Judges pickers in the Show Creation Wizard.
 *
 * Prerequisites (run before testing):
 * - Dev server running on localhost:5173
 * - A test secretary user logged in (run scripts/create-secretary-test-user.js)
 * - At least one person with judge_qualifications in the database
 */
test.describe('Show Wizard — Officials & Judges Pickers', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');
    await expect(page.getByText('Basic Show Information')).toBeVisible({ timeout: 15000 });
  });

  test('Show Details step opens the chairman picker', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // Find the Show Chairman picker trigger and open it
    const chairmanTrigger = page.getByRole('button', { name: /Show Chairman/i });
    await chairmanTrigger.click();

    await expect(page.getByPlaceholder('Search show chairman…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add new Show Chairman' })).toBeVisible();
  });

  test('Secretary field is auto-filled with the logged-in user badge', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // The secretary is auto-filled with the logged-in user — the "You" badge should appear
    // next to the secretary picker when the selection matches the current user.
    await expect(page.getByLabel('Show Secretary auto-filled with current user')).toBeVisible();
  });

  test('"Add new judge" footer expands the new-person form', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // Open the judges search popover
    const judgesTrigger = page.getByRole('button', { name: /Show Judges/i });
    await judgesTrigger.click();

    // Click "Add new judge" in the popover footer
    await page.getByRole('button', { name: /Add new judge/i }).click();

    // The new judge inline form should appear with the three required credential fields
    await expect(page.getByPlaceholder('First name')).toBeVisible();
    await expect(page.getByPlaceholder('Last name')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 98234')).toBeVisible();
  });
});
