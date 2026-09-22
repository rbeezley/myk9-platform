import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

async function openFirstShowFromBrowse(page: Page): Promise<string> {
  await page.goto('/shows', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible({
    timeout: 15000,
  });

  await page.getByRole('tab', { name: /^Browse All/ }).click();

  const firstShowLink = page.locator('a[href^="/shows/"]').first();
  await expect(
    firstShowLink,
    'Expected at least one seeded public show with a /shows/:id link in Browse All.'
  ).toBeVisible({ timeout: 15000 });
  const href = (await firstShowLink.getAttribute('href')) ?? '';
  expect(href).toMatch(/^\/shows\/[a-f0-9-]{36}(?:\/setup)?$/);

  await firstShowLink.click();
  await expect(page).toHaveURL(/\/shows\/[a-f0-9-]{36}(?:\/setup)?$/);

  const showId = page.url().match(/\/shows\/([a-f0-9-]{36})(?:\/setup)?$/)?.[1];
  expect(showId).toBeTruthy();
  return showId!;
}

test.describe('Show management workflow', () => {
  test('public browse uses the current Shows page instead of legacy create-show test IDs', async ({
    page,
  }) => {
    await page.goto('/shows/browse', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/shows$/);
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('textbox', { name: /Search shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Browse All/ })).toBeVisible();
    await expect(page.locator('[data-testid="create-new-show-button"]')).toHaveCount(0);
  });

  test('secretary can reach the canonical show wizard from the browse page', async ({ page }) => {
    await signInAsSecretary(page, '/shows');

    await expect(page.getByRole('button', { name: 'New Show' })).toBeVisible({ timeout: 15000 });
    await Promise.all([
      page.waitForURL(/\/secretary\/create-show\/wizard/),
      page.getByRole('button', { name: 'New Show' }).click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('secretary show detail exposes current management tabs and actions', async ({ page }) => {
    await signInAsSecretary(page, '/shows');
    const showId = await openFirstShowFromBrowse(page);

    // The show header's `...` overflow menu is deleted (MYK9-630). The one
    // actions surface is the app header's Actions button, which is icon-only
    // below `sm` and keeps its accessible name there.
    await expect(page.getByRole('button', { name: 'More show actions' })).toHaveCount(0);
    await expect(page.getByTestId('header-actions-trigger')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('header-actions-trigger').click();
    await expect(page.getByRole('menuitem', { name: 'Open Entry Management' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Show Details' })).toBeVisible();
    await page.keyboard.press('Escape');

    // MYK9-630 phase 2: the five standalone page links above the tab strip are
    // deleted -- every one of those pages IS a tab now, and the tabs are the
    // only horizontal row on the page.
    await expect(page.locator('[data-testid="canonical-show-management-nav"]')).toHaveCount(0);
    for (const label of ['Show Desk', 'Entry Management', 'Reports', 'Submit Results']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(6);
    await expect(tabs).toHaveText([
      /^Overview/,
      /^Setup/,
      /^Entries/,
      /^Show Day/,
      /^Results/,
      /^Reports/,
    ]);

    // Each tab is a real page: selecting one changes the URL.
    await page.getByRole('tab', { name: /^Show Day/ }).click();
    await expect(page).toHaveURL(new RegExp(`/shows/${showId}/show-day`));

    await expect(page.locator('[data-testid="show-trials-tab"]')).toHaveCount(0);
  });

  test('secretary trial and class add actions route to the incremental wizard modes', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/shows');
    const showId = await openFirstShowFromBrowse(page);

    await page.goto(`/shows/${showId}?tab=trials`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /^Trials/ }).click();
    const newTrialButton = page.getByRole('button', { name: 'New Trial' }).first();
    await expect(newTrialButton).toBeVisible({ timeout: 15000 });
    await Promise.all([
      page.waitForURL(
        new RegExp(`/secretary/create-show/wizard\\?showId=${showId}&mode=add-trials`)
      ),
      newTrialButton.click(),
    ]);
    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible();

    await page.goto(`/shows/${showId}?tab=classes`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /^Classes/ }).click();
    const newClassButton = page.getByRole('button', { name: 'New Class' }).first();
    await expect(newClassButton).toBeVisible({ timeout: 15000 });
    await Promise.all([
      page.waitForURL(
        new RegExp(`/secretary/create-show/wizard\\?showId=${showId}&mode=add-classes`)
      ),
      newClassButton.click(),
    ]);
    await expect(page.getByRole('heading', { name: /Classes \(\d+\)/ })).toBeVisible();
  });
});
