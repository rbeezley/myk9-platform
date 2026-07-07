import { expect, test } from '@playwright/test';
import { TEST_USERS } from './helpers/testUsers';
import { signIn } from './uat/shared/auth';

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
    await signIn(
      page,
      TEST_USERS.SECRETARY.email,
      TEST_USERS.SECRETARY.password,
      '/secretary/dashboard'
    );

    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Add Show' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal tasks' })).toBeVisible();
    // Messages is no longer a dashboard/sidebar link; PR #592 consolidated it
    // into the top Message Center panel.
    await expect(page.getByRole('button', { name: /^Message Center/ })).toBeVisible();
  });

  test('exhibitor can land on My Shows and continue to show discovery', async ({ page }) => {
    await signIn(
      page,
      TEST_USERS.DEMO_EXHIBITOR.email,
      TEST_USERS.DEMO_EXHIBITOR.password,
      '/exhibitor/entries'
    );

    await expect(page).toHaveURL(/\/exhibitor\/entries|\/my-entries/);
    await expect(page.getByRole('heading', { name: 'My Shows' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Enter a Show' }).click();
    await expect(page).toHaveURL(/\/shows$/);
    await expect(page.getByRole('heading', { name: 'Shows', exact: true })).toBeVisible({
      timeout: 15000,
    });
  });

  test('judge can land on the assignment dashboard without myK9Show scoring controls', async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.JUDGE.email, TEST_USERS.JUDGE.password, '/judge/dashboard');

    await expect(page).toHaveURL(/\/judge\/dashboard/);
    await expect(page.getByText('Manage your judging assignments')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Today's Classes")).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Judging Assignments', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No Classes Today' })).toBeVisible();
  });
});
