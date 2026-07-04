import { expect, test, type Locator, type Page } from '@playwright/test';
import { SECRETARY_USER, signInAsSecretary } from '../shared/auth';
import { currentMonthWizardDates } from '../../shared/wizardDates';
import { ADD_TRIALS_SHOW_ID } from '../shared/seededShows';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../shared/artifacts';

const strictBrowserHealth = process.env.QA_STRICT_BROWSER_HEALTH !== 'false';
// The proof command pins --workers=1 so the UAT finding artifact order stays
// stable while browser health is collected per test.
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Secretary QA regression proof', () => {
  test.skip(
    !SECRETARY_USER.email || !SECRETARY_USER.password,
    'Secretary QA regression proof requires E2E_SECRETARY_EMAIL and E2E_SECRETARY_PASSWORD'
  );

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

    // Premium List Style is collapsed by default under "More options".
    await page.getByRole('button', { name: /More options/i }).click();
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

    const dates = currentMonthWizardDates();
    await selectRange(page, page.getByRole('button', { name: /Show Dates/i }), {
      start: dates.show.start.pick,
      end: dates.show.end.pick,
    });
    const showRange = new RegExp(`${dates.show.start.display}.*${dates.show.end.display}`, 'i');
    await expect(page.locator('#show-dates')).toContainText(showRange);

    await selectRange(page, page.getByRole('button', { name: /Entry Period/i }), {
      start: dates.entry.start.pick,
      end: dates.entry.end.pick,
    });
    const entryRange = new RegExp(`${dates.entry.start.display}.*${dates.entry.end.display}`, 'i');
    await expect(page.locator('#show-dates')).toContainText(showRange);
    await expect(page.locator('#show-entry-period')).toContainText(entryRange);
  });

  test('trial configuration uses human AKC labels and required event numbers', async ({ page }) => {
    await signInAsSecretary(
      page,
      `/secretary/create-show/wizard?showId=${ADD_TRIALS_SHOW_ID}&mode=add-trials`
    );

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    const addTrialAction = page.getByRole('button', { name: /^Add (First )?Trial$/ }).last();
    await expect(addTrialAction).toBeVisible();
    await addTrialAction.click({ force: true });

    const eventNumber = page.getByPlaceholder('Required: AKC event number');
    await expect(eventNumber).toBeVisible();
    await expect(eventNumber).toHaveAttribute('required', '');

    // This is a Base UI Select (@base-ui/react/select), not Radix. Its options
    // are recomputed (TrialConfigurationStep `trialTypeOptions` useMemo) when the
    // show's `organization` hydrates from the show query and templates load — both
    // async, both landing AFTER this row mounts. A single `click({ force: true })`
    // can fire the open during one of those re-render windows; Base UI then leaves
    // the portal open-but-empty (or detached) for the full timeout, passing only on
    // the next run's fresh open. Re-open inside toPass() so each attempt re-clicks
    // the trigger and re-asserts content — deterministically recovering from a
    // re-render that dropped the popup, instead of racing a single forced open.
    const trialTypeTrigger = page.getByLabel(/Trial Type/i);
    const scentWorkOptionByRole = page.getByRole('option', { name: 'Scent Work', exact: true });
    await expect(async () => {
      if (!(await scentWorkOptionByRole.isVisible().catch(() => false))) {
        await trialTypeTrigger.click();
      }
      await expect(scentWorkOptionByRole).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    for (const label of ['Scent Work', 'Obedience', 'Rally', 'Obedience & Rally', 'Tracking']) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('option', { name: /scent_work/i })).toHaveCount(0);
    const scentWorkOption = page
      .getByRole('option', { name: 'Scent Work', exact: true })
      .filter({ visible: true });
    await expect(scentWorkOption).toHaveCount(1);
    await scentWorkOption.click();

    const trialDateTime = page.getByLabel(/Trial Date & Time/i);
    await expect(trialDateTime).toBeVisible();
    await trialDateTime.press('Enter');
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
    // The picker defaults to the show's start date, which may differ from the current month
    // due to UTC-midnight timestamps resolving to the previous day in US timezones.
    // Assert year is current and month is within a ±2-month window of today.
    const now = new Date();
    const yearStr = await dialog.locator('select').nth(1).inputValue();
    expect(parseInt(yearStr)).toBe(now.getFullYear());
    const monthStr = await dialog.locator('select').first().inputValue();
    const pickedMonth = parseInt(monthStr);
    expect(pickedMonth).toBeGreaterThanOrEqual(Math.max(1, now.getMonth() - 1));
    expect(pickedMonth).toBeLessThanOrEqual(Math.min(12, now.getMonth() + 4));
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
  // The Base UI popover can briefly reposition after range selection; DOM click
  // keeps this helper from failing on Playwright-only actionability jitter.
  await done.evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).not.toBeVisible();
}

async function clickCalendarDay(dialog: Locator, name: RegExp) {
  const day = dialog.getByRole('button', { name }).first();
  await expect(day).toBeVisible();
  await day.click();
}
