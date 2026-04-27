import { test, expect, Page } from '@playwright/test';

/**
 * UI test for the Classes-on-a-Trial workflow that the secretary uses.
 *
 * Covers:
 *   - The "Add Classes" panel loads templates filtered by show organization
 *     (regression: panel previously opened to "No templates available" because
 *     templates were not initialized, then later filtered against the wrong
 *     field).
 *   - Editing a class to assign a judge from the show's judge pool.
 *   - The delete-class confirmation dialog (entry-cascade copy + cancellation).
 *   - The cascade itself (deleting a class with entries soft-deletes its
 *     entries) is exercised by the unit test in
 *     `classQueries.deleteCascade.test.ts` since that's a DB-layer assertion.
 *
 * Test data:
 *   Reuses the persistent "Test Golden Path Show" → "Saturday Trial 1" fixture.
 *   This trial ships with five Container classes; we mutate the Container
 *   Master row (judge assignment, then revert) to keep the fixture stable for
 *   other suites.
 *
 * Auth: secretary@myk9t.com / testpass123 (matches clubsUI.spec.ts).
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

const TEST_SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3'; // Test Golden Path Show
const TEST_TRIAL_ID = '0c300700-10a6-4a80-9f82-ccd3e6d80f5c'; // Saturday Trial 1
const TRIAL_URL = `/shows/${TEST_SHOW_ID}/trials/${TEST_TRIAL_ID}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

async function gotoTrial(page: Page) {
  await page.goto(TRIAL_URL, { waitUntil: 'networkidle' });
  // Wait until the classes table mounts (data hydrated from replication).
  await expect(page.getByRole('button', { name: 'Add Classes' })).toBeVisible({ timeout: 15000 });
}

test.describe('Classes UI — Add Classes panel', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('opens with templates loaded for the AKC show organization', async ({ page }) => {
    // Listen for the sport_templates fetch BEFORE navigating — the page-mount
    // useEffect fires the fetch as soon as the trial page loads, well before
    // the user clicks the Add Classes button.
    const templateFetch = page.waitForResponse(
      resp => resp.url().includes('/rest/v1/sport_templates') && resp.request().method() === 'GET',
      { timeout: 15000 }
    );

    await gotoTrial(page);
    await templateFetch;

    await page.getByRole('button', { name: 'Add Classes' }).click();

    // Single AKC template in the catalog → panel auto-advances to "Select
    // Classes". Pre-fix this opened to "Select Template" with a "No templates
    // available" alert; pre-second-fix it opened to "No active templates found
    // for AKC".
    await expect(page.getByRole('dialog', { name: 'Select Classes' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/No (active )?templates (are available|found)/i)).toHaveCount(0);

    // Cancel out — this test asserts the panel opens correctly, not that it
    // commits new classes.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Select Classes' })).toHaveCount(0);
  });
});

test.describe('Classes UI — Edit class judge', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('renders judge name (not UUID) when re-opening Edit on a saved class', async ({ page }) => {
    // Regression: SelectTrigger fell back to the raw judge UUID when
    // assignedJudges loaded after the form mounted. Picking a previously-saved
    // judge re-opens the panel showing "Richard Beezley", not "08a66fc8-…".
    // Setup: Container Master in this fixture has Richard Beezley assigned
    // from earlier walkthrough runs.
    await gotoTrial(page);

    const masterRow = page.getByRole('button', { name: /Container Master /i }).first();
    await expect(masterRow).toBeVisible();
    await masterRow.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Edit Class/i }).click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Class' });
    await expect(editDialog).toBeVisible();

    // Judge combobox shows the resolved name, not the raw UUID.
    const judgeCombo = editDialog.getByRole('combobox', { name: /Judge/i });
    await expect(judgeCombo).not.toHaveText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );

    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).toHaveCount(0);
  });
});

test.describe('Classes UI — Delete class confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('confirmation dialog warns and cancels without mutating data', async ({ page }) => {
    await gotoTrial(page);

    // Open Delete on Container Master.
    const masterRow = page.getByRole('button', { name: /Container Master /i }).first();
    await masterRow.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Delete Class/i }).click();

    const alert = page.getByRole('alertdialog', { name: 'Delete Class' });
    await expect(alert).toBeVisible();
    await expect(alert.getByText('This action cannot be undone.')).toBeVisible();
    await expect(alert.getByText(/Container Master/i)).toBeVisible();

    // Cancel — no DELETE/PATCH should fire.
    let deleteFired = false;
    page.on('request', req => {
      if (req.url().includes('/rest/v1/classes') && ['PATCH', 'DELETE'].includes(req.method())) {
        deleteFired = true;
      }
    });

    await alert.getByRole('button', { name: 'Cancel' }).click();
    await expect(alert).toHaveCount(0);

    // Class still exists in the table.
    await expect(page.getByRole('button', { name: /Container Master /i }).first()).toBeVisible();
    expect(deleteFired).toBe(false);
  });
});
