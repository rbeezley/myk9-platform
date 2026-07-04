import { test, expect } from '@playwright/test';
import { ShowCreationWizardPage } from '../page-objects';
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
  let wizardPage: ShowCreationWizardPage;

  test.beforeEach(async ({ page }) => {
    wizardPage = new ShowCreationWizardPage(page);

    await signInAsSecretary(page);
    await wizardPage.goto();
  });

  test('Show Details step loads with populated chairman picker', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();

    // Find the Show Chairman picker trigger and open it
    const chairmanTrigger = page.getByRole('button', { name: /Show Chairman/i });
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

  test('"Add new Show Chairman" form requires name, email, and phone', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();

    // Open the chairman picker and expand its inline "Add new" form.
    await page.getByRole('button', { name: /Show Chairman/i }).click();
    await page.getByRole('button', { name: /Add new Show Chairman/i }).click();

    // The create form must collect full contact info — email AND phone are
    // surfaced on the premium/reports, so both are required alongside the name.
    await expect(page.getByPlaceholder('First name')).toBeVisible();
    await expect(page.getByPlaceholder('Last name')).toBeVisible();
    await expect(page.getByPlaceholder('email@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('(555) 123-4567')).toBeVisible();

    // Save stays disabled until every field (including phone) is filled.
    const save = page.getByRole('button', { name: /Add Show Chairman/i });
    await page.getByPlaceholder('First name').fill('Pat');
    await page.getByPlaceholder('Last name').fill('Chair');
    await page.getByPlaceholder('email@example.com').fill('pat.chair@example.com');
    await expect(save).toBeDisabled();
    await page.getByPlaceholder('(555) 123-4567').fill('555-123-4567');
    await expect(save).toBeEnabled();
  });

  test('Secretary field is auto-filled with the logged-in user badge', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();

    // The secretary is auto-filled with the logged-in user — the "You" badge should appear
    // next to the secretary picker when the selection matches the current user.
    await expect(page.getByText('You', { exact: true })).toBeVisible();
  });

  test('"Add new judge" footer expands the new-person form', async ({ page }) => {
    // Verify we're on the Show Details step
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();

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
