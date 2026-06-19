import { expect, type Page } from '@playwright/test';
import { TEST_USERS } from '../../helpers/testUsers';

export const SECRETARY_USER = TEST_USERS.SECRETARY;

async function gotoSignIn(page: Page, signInPath: string) {
  const input = page.getByTestId('credential-input');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(signInPath, {
      waitUntil: 'commit',
    });

    try {
      await expect(input).toBeVisible({ timeout: 30000 });
      return;
    } catch (error) {
      const bodyText = await page
        .locator('body')
        .innerText({ timeout: 1000 })
        .catch(() => '');
      const shellStillBooting =
        bodyText.trim().length === 0 || /Loading page|Loading\.\.\./i.test(bodyText);

      if (attempt === 1 || !shellStillBooting) {
        throw error;
      }
    }
  }
}

export async function signIn(page: Page, email: string, password: string, returnTo = '/') {
  const params = new URLSearchParams({ returnTo });
  await gotoSignIn(page, `/sign-in?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
  await page.getByTestId('credential-input').fill(email);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/\/sign-in/);
}

export async function signInAsSecretary(page: Page, returnTo = '/') {
  await signIn(page, SECRETARY_USER.email, SECRETARY_USER.password, returnTo);
}
