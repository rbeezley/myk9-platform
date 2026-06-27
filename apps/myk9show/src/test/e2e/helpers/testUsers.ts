/**
 * Test Users for Playwright E2E Testing
 *
 * All accounts live in the `myk9-platform` Supabase project.
 * Credentials are stored in CI secrets and .env.local only — never hardcoded here.
 *
 * CI-critical accounts (required for A11y smoke + E2E PR Smoke):
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_SECRETARY_EMAIL / E2E_SECRETARY_PASSWORD
 *   E2E_JUDGE_EMAIL / E2E_JUDGE_PASSWORD
 *
 * Nightly-only accounts (EXHIBITOR, CLUB_ADMIN, DEMO_EXHIBITOR):
 *   E2E_DEMO_EXHIBITOR_EMAIL / E2E_DEMO_EXHIBITOR_PASSWORD
 *   Others use env vars or are skipped when absent.
 */

import { expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  role: string;
  description: string;
}

export const TEST_USERS: Record<string, TestUser> = {
  SITE_ADMIN: {
    email: process.env.E2E_ADMIN_EMAIL ?? '',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    role: 'site_admin',
    description: 'Site administrator — e2e-admin@test.myk9.com, rotated 2026-06-18',
  },

  SECRETARY: {
    email: process.env.E2E_SECRETARY_EMAIL ?? '',
    password: process.env.E2E_SECRETARY_PASSWORD ?? '',
    role: 'secretary',
    description: 'Show secretary — e2e-secretary@test.myk9.com, rotated 2026-06-18',
  },

  JUDGE: {
    email: process.env.E2E_JUDGE_EMAIL ?? '',
    password: process.env.E2E_JUDGE_PASSWORD ?? '',
    role: 'judge',
    description: 'Show judge — e2e-judge@test.myk9.com, rotated 2026-06-18',
  },

  CLUB_ADMIN: {
    // Canonical club-admin login. The old duplicate `club@myk9t.com` auth user
    // was removed 2026-06-25 — its `people` row remains as a seeded demo official
    // but can no longer sign in. All e2e accounts share one password, so fall
    // back to the demo-exhibitor secret when E2E_CLUB_PASSWORD is unset.
    email: process.env.E2E_CLUB_EMAIL ?? 'e2e-clubadmin@test.myk9.com',
    password: process.env.E2E_CLUB_PASSWORD ?? process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    role: 'club_admin',
    description: 'Club administrator — nightly only',
  },

  EXHIBITOR: {
    email: process.env.E2E_EXHIBITOR_EMAIL ?? 'exhibitor1@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Exhibitor (Alice Martin) — nightly only',
  },

  // Primary demo exhibitor with seeded dogs (Willow, Ranger, Juniper).
  // Protected from DB wipes. Use this account for tests that need real dog data.
  DEMO_EXHIBITOR: {
    email: process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'e2e-exhibitor@test.myk9.com',
    password: process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Demo exhibitor with seeded dogs — protected from wipes',
  },

  EXHIBITOR_2: {
    email: 'exhibitor2@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Exhibitor test account — nightly only',
  },

  EXHIBITOR_3: {
    email: 'exhibitor3@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Exhibitor test account — nightly only',
  },

  EXHIBITOR_4: {
    email: 'exhibitor4@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Exhibitor test account — nightly only',
  },

  EXHIBITOR_5: {
    email: 'exhibitor5@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Exhibitor test account — nightly only',
  },
};

/**
 * Navigate to `/sign-in` and wait for the credential field to render, retrying
 * once if the SPA shell is still booting (the dev server's first paint can lag
 * past the goto, leaving a "Loading…" body with no form yet).
 */
async function gotoSignIn(page: Page, signInPath: string): Promise<void> {
  const input = page.getByTestId('credential-input');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(signInPath, { waitUntil: 'commit' });

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

/**
 * Drive the real SmartSignInPage (Phase 1b "single email-or-passcode front
 * door") two-step flow:
 *   1. fill the single credential field (`credential-input`) with the email
 *   2. Continue — this reveals the password step *in place* (the password field
 *      does not exist in the DOM until this transition)
 *   3. fill `password-input` and submit (`sign-in-button`)
 *   4. wait for navigation off `/sign-in`
 *
 * This is the one canonical sign-in helper; every spec's local `signIn` and the
 * role wrappers below delegate here so the flow lives in exactly one place.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  returnTo = '/'
): Promise<void> {
  if (!email || !password) {
    throw new Error(`Missing E2E credentials for ${email || 'unknown test user'}`);
  }

  const params = new URLSearchParams({ returnTo });
  await gotoSignIn(page, `/sign-in?${params.toString()}`);

  await page.getByTestId('credential-input').fill(email);
  await page.getByTestId('continue-button').click();

  // The email branch reveals the password sub-form ("we'll ask for your
  // password next"); wait for it before filling.
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(password);

  await page.getByTestId('sign-in-button').click();
  const signInResult = await Promise.race([
    page
      .waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 })
      .then(() => 'signed-in' as const)
      .catch((error: unknown) => ({ error })),
    page
      .getByText(/invalid login credentials/i)
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => 'invalid-credentials' as const)
      .catch(() => new Promise<never>(() => undefined)),
  ]);

  if (signInResult === 'invalid-credentials') {
    throw new Error(`E2E sign-in rejected credentials for ${email}`);
  }

  if (typeof signInResult === 'object' && 'error' in signInResult) {
    throw signInResult.error;
  }

  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * Sign in as a named test user (env-backed credentials) and wait for navigation
 * away from the sign-in page.
 */
export async function signInAsTestUser(page: Page, userType: keyof typeof TEST_USERS) {
  const user = TEST_USERS[userType];
  await signIn(page, user.email, user.password);
  return user;
}

/**
 * Role convenience wrappers — use the env-backed canonical accounts (the
 * `*@myk9t.com` accounts have no `auth.users` row and cannot authenticate).
 */
export const signInAsSecretary = (page: Page, returnTo = '/') =>
  signIn(page, TEST_USERS.SECRETARY.email, TEST_USERS.SECRETARY.password, returnTo);

export const signInAsAdmin = (page: Page, returnTo = '/') =>
  signIn(page, TEST_USERS.SITE_ADMIN.email, TEST_USERS.SITE_ADMIN.password, returnTo);

export const signInAsJudge = (page: Page, returnTo = '/') =>
  signIn(page, TEST_USERS.JUDGE.email, TEST_USERS.JUDGE.password, returnTo);

/** Exhibitor wrapper uses the protected demo account with seeded dogs. */
export const signInAsExhibitor = (page: Page, returnTo = '/') =>
  signIn(page, TEST_USERS.DEMO_EXHIBITOR.email, TEST_USERS.DEMO_EXHIBITOR.password, returnTo);

/**
 * Sign out the current user.
 */
export async function signOut(page: import('@playwright/test').Page) {
  await page.click('[data-testid="user-menu"], button:has-text("Account menu")');
  await page.click('text="Sign Out"');
  await page.waitForURL(/\/(sign-in|$)/);
}
