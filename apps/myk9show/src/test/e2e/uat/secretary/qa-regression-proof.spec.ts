import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../shared/artifacts';

const ADD_TRIALS_SHOW_ID =
  process.env.QA_ADD_TRIALS_SHOW_ID ?? '4584f257-19b5-4016-aae6-5e7827b769cb';
const strictBrowserHealth = process.env.QA_STRICT_BROWSER_HEALTH !== 'false';
// The proof command pins --workers=1 so the UAT finding artifact order stays
// stable while browser health is collected per test.
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Secretary QA regression proof', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Playwright requires fixture destructuring for hooks; this proof does not
    // need the page after health listeners have already captured failures.
    void page;
    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'QA regression proof', status, details);
    healthByTest.delete(testInfo.testId);

    if (strictBrowserHealth) {
      expect(details, details.join('\n')).toEqual([]);
    }
  });

  test('dashboard attention items stay scoped to managed shows', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/dashboard');

    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible({
      timeout: 15000,
    });

    const managedText = await page.locator('text=/Managing \\d+ shows?/').first().textContent();
    expect(managedText).toBeTruthy();

    if (managedText?.includes('Managing 0 shows')) {
      await expect(page.getByText(/pending review/i)).not.toBeVisible();
    }
  });

  test('wizard route exposes complete style options and stable date ranges', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/\/secretary\/create-show\/wizard/);

    await page.getByLabel('Premium List Style').click();
    const styleOptions = [
      'Monogram (default)',
      'Banner',
      'Headline',
      'Magazine',
      'Poster',
      'Gazette',
      'Field Guide',
      'Heritage',
    ];
    for (const label of styleOptions) {
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

  test('trial configuration uses human AKC labels and required event numbers', async ({ page }) => {
    await signInAsSecretary(
      page,
      `/secretary/create-show/wizard?showId=${ADD_TRIALS_SHOW_ID}&mode=add-trials`
    );

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    const addTrialAction = page.getByRole('button', { name: 'Add First Trial' });
    await expect(addTrialAction).toBeVisible();
    await addTrialAction.click({ force: true });

    const eventNumber = page.getByPlaceholder('Required: AKC event number');
    await expect(eventNumber).toBeVisible();
    await expect(eventNumber).toHaveAttribute('required', '');

    await page.getByLabel(/Trial Type/i).click({ force: true });
    for (const label of ['Scent Work', 'Obedience', 'Rally', 'Obedience & Rally', 'Tracking']) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('option', { name: /scent_work/i })).toHaveCount(0);
    await page.getByRole('option', { name: 'Scent Work', exact: true }).click();

    const trialDateTime = page.getByLabel(/Trial Date & Time/i);
    await expect(trialDateTime).toBeVisible();
    await trialDateTime.press('Enter');
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
    await expect(dialog.locator('select').first()).toHaveValue('5');
    await expect(dialog.locator('select').nth(1)).toHaveValue('2026');
  });
});

async function selectRange(page: Page, trigger: Locator, dates: { start: RegExp; end: RegExp }) {
  await trigger.click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
  await expect(dialog).toBeVisible();
  await clickCalendarDay(dialog, dates.start);
  await clickCalendarDay(dialog, dates.end);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).not.toBeVisible();
}

async function clickCalendarDay(dialog: Locator, name: RegExp) {
  const day = dialog.getByRole('button', { name }).first();
  await expect(day).toBeVisible();
  await day.click();
}
