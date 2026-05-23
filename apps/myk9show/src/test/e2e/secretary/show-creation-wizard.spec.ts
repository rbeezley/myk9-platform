import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

const ADD_TRIALS_SHOW_ID =
  process.env.QA_ADD_TRIALS_SHOW_ID ?? '4584f257-19b5-4016-aae6-5e7827b769cb';

test.describe('Trial Secretary - Show Creation Wizard', () => {
  test('secretary can open the show creation wizard', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page).toHaveURL(/\/secretary\/create-show\/wizard/);
    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('Step 1 renders current required show details', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page.getByText('Basic Show Information')).toBeVisible();
    await expect(page.getByLabel(/Show Name/i)).toBeVisible();
    await expect(page.getByLabel(/Organization/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Show Dates/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Entry Period/i })).toBeVisible();
    await expect(page.getByLabel(/Location/i)).toBeVisible();
    await expect(page.getByText('Show Chairman *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Secretary *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('Step 1 exposes premium style options and independent date ranges', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await page.getByLabel('Premium List Style').click();
    for (const label of [
      'Monogram (default)',
      'Banner',
      'Headline',
      'Magazine',
      'Poster',
      'Gazette',
      'Field Guide',
      'Heritage',
    ]) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    await selectRange(page, page.getByRole('button', { name: /Show Dates/i }), {
      start: /May 30th, 2026/i,
      end: /June 2nd, 2026/i,
    });
    await expect(page.locator('#show-dates')).toContainText(/May 30, 2026.*Jun 2, 2026/i);

    await selectRange(page, page.getByRole('button', { name: /Entry Period/i }), {
      start: /May 1st, 2026/i,
      end: /June 5th, 2026/i,
    });
    await expect(page.locator('#show-dates')).toContainText(/May 30, 2026.*Jun 2, 2026/i);
    await expect(page.locator('#show-entry-period')).toContainText(/May 1, 2026.*Jun 5, 2026/i);
  });

  test('Add Trials mode lands on trial configuration with AKC event number guidance', async ({
    page,
  }) => {
    await signInAsSecretary(
      page,
      `/secretary/create-show/wizard?showId=${ADD_TRIALS_SHOW_ID}&mode=add-trials`
    );

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Step 2 of 4', { exact: true })).toBeVisible();

    const addTrialAction = page.getByRole('button', { name: /^Add (First )?Trial$/ }).last();
    await expect(addTrialAction).toBeVisible();
    await addTrialAction.click();

    await expect(page.getByPlaceholder('Required: AKC event number')).toBeVisible();
    await expect(page.getByLabel(/Trial Type/i)).toBeVisible();
  });
});

async function selectRange(page: Page, trigger: Locator, dates: { start: RegExp; end: RegExp }) {
  await trigger.click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
  await expect(dialog).toBeVisible();
  await clickCalendarDay(dialog, dates.start);
  await clickCalendarDay(dialog, dates.end);
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toBeVisible();
  await done.evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).not.toBeVisible();
}

async function clickCalendarDay(dialog: Locator, name: RegExp) {
  const day = dialog.getByRole('button', { name }).first();
  await expect(day).toBeVisible();
  await day.click();
}
