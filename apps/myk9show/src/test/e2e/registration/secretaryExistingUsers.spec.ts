import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

const SHOW_ID = process.env.QA_EXISTING_USER_REGISTRATION_SHOW_ID ?? LIVE_REGISTRATION_SHOW_ID;
const PRIMARY_DOG = 'Willow';
const OTHER_EXHIBITOR_DOG = 'Scout';

async function gotoRegistration(page: Page) {
  await page.goto(`/secretary/register/${SHOW_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Add entries for exhibitor' })).toBeVisible({
    timeout: 15000,
  });
}

async function searchDog(page: Page, name: string) {
  const search = page.getByPlaceholder(/Search all dogs/i);
  await search.fill(name);
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(name.toLowerCase()),
    { timeout: 10000 }
  );
}

test.describe('Secretary registration for existing users', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page, '/secretary/dashboard');
    await gotoRegistration(page);
  });

  test('renders secretary-mode search and keeps Next disabled until a dog is selected', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
    await expect(page.getByPlaceholder(/Search all dogs/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();

    await searchDog(page, PRIMARY_DOG);
    await page.getByText(PRIMARY_DOG, { exact: true }).last().click();
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
  });

  test('blocks existing-user carts that span multiple exhibitors', async ({ page }) => {
    await searchDog(page, PRIMARY_DOG);
    await page.getByText(PRIMARY_DOG, { exact: true }).last().click();

    await searchDog(page, OTHER_EXHIBITOR_DOG);
    await page.getByText(OTHER_EXHIBITOR_DOG, { exact: true }).last().click();

    await expect(page.getByText(/2 selected/)).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/wizard processes one exhibitor.*entries at a time/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
  });
});
