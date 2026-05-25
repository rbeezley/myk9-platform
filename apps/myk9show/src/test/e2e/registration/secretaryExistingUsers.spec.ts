import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary as signInSecretary } from '../uat/shared/auth';

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

async function signInAsSecretary(page: Page) {
  await signInSecretary(page, `/secretary/register/${SHOW_ID}`);
}

async function gotoRegistration(page: Page) {
  if (!new URL(page.url()).pathname.startsWith(`/secretary/register/${SHOW_ID}`)) {
    await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
}

async function searchDog(page: Page, name: string) {
  const search = page.getByPlaceholder(/Search all dogs/i);
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(name.toLowerCase()),
    { timeout: 10000 }
  );
  await search.fill(name);
  await responsePromise;
}

test.describe('Secretary registration for existing users', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
    await gotoRegistration(page);
  });

  test('renders secretary-mode search and keeps Next disabled until a dog is selected', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
    await expect(page.getByPlaceholder(/Search all dogs/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();

    await searchDog(page, 'Bravo');
    await page.getByText('Bravo', { exact: true }).last().click();
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
  });

  test('blocks existing-user carts that span multiple exhibitors', async ({ page }) => {
    await searchDog(page, 'Bravo');
    await page.getByText('Bravo', { exact: true }).last().click();

    await searchDog(page, 'Ziva');
    await page.getByText('Ziva', { exact: true }).last().click();

    await expect(page.getByText(/2 selected/)).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/wizard processes one exhibitor.*entries at a time/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
  });
});
