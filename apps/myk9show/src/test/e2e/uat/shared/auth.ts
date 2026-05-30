import { expect, type Page } from '@playwright/test';

export const SECRETARY_USER = {
  email: 'secretary@myk9t.com',
  password: 'TestPass4567!',
};

export async function signIn(page: Page, email: string, password: string, returnTo = '/') {
  const params = new URLSearchParams({ returnTo });
  await page.goto(`/sign-in?${params.toString()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('credential-input')).toBeVisible({ timeout: 15000 });
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
