import { test, expect } from '@playwright/test';
import { LoginPage, ShowCreationWizardPage } from '../page-objects';

/**
 * Smoke tests: Officials & Judges pickers in the Show Creation Wizard.
 *
 * Prerequisites (run before testing):
 * - Dev server running on localhost:5173
 * - A test secretary user logged in (run scripts/create-secretary-test-user.js)
 * - At least one person with judge_qualifications in the database
 */
test.describe('Show Wizard — Officials & Judges Pickers', () => {
  let loginPage: LoginPage;
  let wizardPage: ShowCreationWizardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    wizardPage = new ShowCreationWizardPage(page);

    await loginPage.goto();
    await loginPage.loginAsSecretary();
    await wizardPage.goto();
  });

  test('Show Details step loads with populated chairman picker', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // Find the Show Chairman picker trigger and open it
    const chairmanTrigger = page.getByRole('button', { name: /Select Show Chairman/i });
    await chairmanTrigger.click();

    // The popover should appear — it should have at least one of the two group headers:
    // "Suggested" (people with CHAIRMAN/CLUB_ADMIN roles) or "All People" (everyone else)
    const hasSuggested = await page
      .getByText('Suggested')
      .isVisible()
      .catch(() => false);
    const hasAllPeople = await page
      .getByText('All People')
      .isVisible()
      .catch(() => false);

    expect(hasSuggested || hasAllPeople).toBe(true);
  });

  test('Secretary field is auto-filled with the logged-in user badge', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // The secretary is auto-filled with the logged-in user — the "You" badge should appear
    // next to the secretary picker when the selection matches the current user.
    await expect(page.getByText('You', { exact: true })).toBeVisible();
  });

  test('"Add new judge" footer expands the new-person form', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.locator('text=Basic Show Information')).toBeVisible();

    // Open the judges search popover
    const judgesTrigger = page.getByRole('button', { name: /Search and add judges/i });
    await judgesTrigger.click();

    // Click "Add new judge" in the popover footer
    await page.getByRole('button', { name: /Add new judge/i }).click();

    // The new judge inline form should appear with the three required credential fields
    await expect(page.getByPlaceholder('First name')).toBeVisible();
    await expect(page.getByPlaceholder('Last name')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 98234')).toBeVisible();
  });
});
