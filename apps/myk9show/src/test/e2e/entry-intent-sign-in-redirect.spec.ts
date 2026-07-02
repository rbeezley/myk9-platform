import { test, expect } from '@playwright/test';
import { LIVE_REGISTRATION_SHOW_ID, LIVE_SECRETARY_SHOW_NAME } from './uat/shared/seededShows';
import { TEST_USERS } from './helpers/testUsers';

const REGISTER_PATH = `/shows/${LIVE_REGISTRATION_SHOW_ID}/register`;
const SHOW_PATH = `/shows/${LIVE_REGISTRATION_SHOW_ID}`;
const exhibitor = TEST_USERS.DEMO_EXHIBITOR;

test.describe('entry intent sign-in redirect', () => {
  test.skip(
    !exhibitor.email || !exhibitor.password,
    'Requires E2E_DEMO_EXHIBITOR_EMAIL and E2E_DEMO_EXHIBITOR_PASSWORD'
  );

  test('signed-out Enter this show preserves the show registration intent through sign-in', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto(SHOW_PATH, { waitUntil: 'commit', timeout: 60000 });

    await expect(page.getByText(LIVE_SECRETARY_SHOW_NAME).first()).toBeVisible({
      timeout: 30000,
    });
    await page.locator('main').getByRole('link', { name: /^Enter this show$/i }).first().click();

    await page.waitForURL(
      url => url.pathname === '/sign-in' && url.searchParams.get('redirectTo') === REGISTER_PATH,
      { timeout: 30000 }
    );
    await expect(
      page.getByRole('heading', { name: `Sign in to enter ${LIVE_SECRETARY_SHOW_NAME}` })
    ).toBeVisible({ timeout: 30000 });

    await page.getByTestId('credential-input').fill(exhibitor.email);
    await page.getByTestId('continue-button').click();
    await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('password-input').fill(exhibitor.password);
    await page.getByTestId('sign-in-button').click();

    await page.waitForURL(url => url.pathname === REGISTER_PATH, { timeout: 30000 });
    await expect(page).not.toHaveURL(/\/exhibitor\/entries/);
    await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
      timeout: 30000,
    });
  });
});
