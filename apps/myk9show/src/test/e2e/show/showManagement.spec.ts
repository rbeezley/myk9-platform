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
  expect(href).toMatch(/^\/shows\/[a-f0-9-]{36}$/);

  await firstShowLink.click();
  await expect(page).toHaveURL(/\/shows\/[a-f0-9-]{36}$/);

  const showId = page.url().match(/\/shows\/([a-f0-9-]{36})$/)?.[1];
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
    await expect(page.getByText('Basic Show Information')).toBeVisible();
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('secretary show detail exposes current management tabs and actions', async ({ page }) => {
    await signInAsSecretary(page, '/shows');
    await openFirstShowFromBrowse(page);

    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

    for (const tab of ['Overview', 'Trials', 'Classes', 'Entries', 'Results']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: 'myK9Q Access Codes', level: 3 })).toBeVisible();
    await expect(page.locator('[data-testid="show-trials-tab"]')).toHaveCount(0);
  });

  test('secretary trial and class add actions route to the incremental wizard modes', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/shows');
    const showId = await openFirstShowFromBrowse(page);

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

    await page.goto(`/shows/${showId}`, { waitUntil: 'domcontentloaded' });
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
