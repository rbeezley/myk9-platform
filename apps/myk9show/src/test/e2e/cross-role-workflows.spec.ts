import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS, type TestUser } from './helpers/testUsers';

async function signIn(page: Page, user: TestUser, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  await page.goto(`/sign-in?${params.toString()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('email-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('email-input').fill(user.email);
  await page.getByTestId('password-input').fill(user.password);
  await page.getByTestId('sign-in-button').click();

  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test.describe('Cross-role workflow smoke', () => {
  test('public browse route keeps legacy links moving to the current Shows page', async ({
    page,
  }) => {
    await page.goto('/shows/browse', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/shows$/);
    await expect(page.getByRole('heading', { name: 'Shows', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('textbox', { name: /Search shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Browse All/i })).toBeVisible();
  });

  test('secretary can land on the current command center', async ({ page }) => {
    await signIn(page, TEST_USERS.SECRETARY, '/secretary/dashboard');

    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'New Show' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal tasks' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible();
  });

  test('exhibitor can land on My Entries and continue to show discovery', async ({ page }) => {
    await signIn(page, TEST_USERS.EXHIBITOR, '/exhibitor/entries');

    await expect(page).toHaveURL(/\/exhibitor\/entries|\/my-entries/);
    await expect(page.getByText('My Entries')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter a Show' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find Shows' })).toBeVisible();
  });

  test('judge can land on the assignment dashboard without myK9Show scoring controls', async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.JUDGE, '/judge/dashboard');

    await expect(page).toHaveURL(/\/judge\/dashboard/);
    await expect(page.getByText('Manage your judging assignments')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Today's Classes")).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Judging Assignments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No Classes Today' })).toBeVisible();
  });
});
