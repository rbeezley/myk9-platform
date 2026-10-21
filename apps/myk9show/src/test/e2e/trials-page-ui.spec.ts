import { test, expect } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary } from './helpers/testUsers';

/**
 * The trial URL (`/shows/:showId/trials/:trialId`) after MYK9-1320.
 *
 * A manager no longer gets a trial page: the URL redirects into the workbench (the Overview with
 * the trial open, or Entry Forms filtered to it), and the trial heading menu there is the door to
 * what the page held. Everyone else keeps the read-only Overview and Entries view.
 */

const SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3'; // Test Golden Path Show
const TRIAL_ID = '0c300700-10a6-4a80-9f82-ccd3e6d80f5c'; // Saturday Trial 1
const TRIAL_URL = `/shows/${SHOW_ID}/trials/${TRIAL_ID}`;

/** The trial's collapsible heading on the Overview (CockpitTrialGroup.tsx:95 anchor id). */
const trialHeading = (page: import('@playwright/test').Page) =>
  page.locator(`[id="cockpit-anchor-${TRIAL_ID}"]`);

test.describe('Trial URL - manager', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('redirects into the Overview with the trial open', async ({ page }) => {
    await page.goto(TRIAL_URL);

    await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}\\?.*anchor=${TRIAL_ID}`), {
      timeout: 15000,
    });
    await expect(trialHeading(page)).toBeVisible({ timeout: 15000 });
  });

  test('the Entries deep link lands on Entry Forms filtered to the trial', async ({ page }) => {
    await page.goto(`${TRIAL_URL}?tab=entries`);

    await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/entries\\?.*trial=${TRIAL_ID}`), {
      timeout: 15000,
    });
  });

  test('the retired Financials deep link lands on the Overview, not a 404', async ({ page }) => {
    await page.goto(`${TRIAL_URL}?tab=financials`);

    await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}\\?.*anchor=${TRIAL_ID}`), {
      timeout: 15000,
    });
    await expect(page.getByText(/doesn't exist|not found/i)).toHaveCount(0);
  });

  test('the trial heading menu holds the trial doors, Edit first, and Delete lives in the panel', async ({
    page,
  }) => {
    await page.goto(`/shows/${SHOW_ID}?anchor=${TRIAL_ID}`);
    await expect(trialHeading(page)).toBeVisible({ timeout: 15000 });

    await page
      .getByRole('button', { name: /^Trial actions for / })
      .first()
      .click();
    const items = page.getByRole('menuitem');
    await expect(items.first()).toHaveText('Edit Trial');
    await expect(items.filter({ hasText: 'Entry forms' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Judge supplies' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Trial financials' })).toHaveCount(1);
    await expect(items.filter({ hasText: /delete/i })).toHaveCount(0);

    await items.first().click();
    await expect(page.getByRole('button', { name: 'Delete trial', exact: true })).toBeVisible();
  });
});

test.describe('Trial URL - exhibitor', () => {
  test('keeps the read-only Overview and Entries view, with no Financials tab', async ({
    page,
  }) => {
    await signInAsExhibitor(page);
    await page.goto(`${TRIAL_URL}?tab=financials`);

    // No redirect into the workbench, and the retired tab falls back to Overview.
    await expect(page).toHaveURL(new RegExp(`/trials/${TRIAL_ID}`), { timeout: 15000 });
    await expect(page.getByRole('tab', { name: /^Overview/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: /^Entries/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Financials/ })).toHaveCount(0);
  });
});
