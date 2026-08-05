/**
 * Test Users for Playwright E2E Testing
 *
 * All accounts live in the `myk9-platform` Supabase project.
 * Credentials are stored in CI secrets and .env.local only — never hardcoded here.
 *
 * Canonical accounts (required for CI, Nightly, and route-health):
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_SECRETARY_EMAIL / E2E_SECRETARY_PASSWORD
 *   E2E_JUDGE_EMAIL / E2E_JUDGE_PASSWORD
 *   E2E_DEMO_EXHIBITOR_EMAIL / E2E_DEMO_EXHIBITOR_PASSWORD
 *
 * Legacy/demo-only accounts (EXHIBITOR_2..5) are fixture data, not route-health
 * sign-in users. Use DEMO_EXHIBITOR for authenticated exhibitor tests.
 * Steward flows use the canonical secretary account.
 *
 * Optional account (MYK9-137):
 *   E2E_CLUB_ADMIN_PASSWORD — a club-admin-only actor. Its email is fixed, not
 * overridable; the seeds hard-code it.
 *
 * LOCAL-ONLY FOR NOW. It is NOT part of the CI/Nightly canonical set, and no
 * workflow passes E2E_CLUB_ADMIN_PASSWORD, so it is skipped there even once the
 * secret exists in GitHub. Turning it on means adding the secret AND wiring it
 * into the isolated-e2e lifecycle steps in .github/workflows — until both are
 * done, specs that sign in as CLUB_ADMIN cannot run anywhere but a developer
 * machine. Assertions about club SCOPING that need no browser belong in
 * supabase/tests/club_secretary_grant_test.sql, which builds its own actor inside
 * a rolled-back transaction and runs on every CI push.
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

  // JUDGE-ONLY, and the "only" is load-bearing (MYK9-141). A judge that also
  // holds exhibitor or secretary clears judge-only authorization checks through
  // the wrong branch, so "a judge is denied the secretary result surface" would
  // report a pass whether or not judge scoping exists. seed-demo.sql section 10f
  // deactivates every non-judge grant on this address to keep that true; the
  // 2026-08-01 judge UX walk found it rendering as `Secretary +2`.
  //
  // Assigned to classes 031..035 of the Heartland show; 036..039 are assigned to
  // nobody, which is the negative subject for assignment-isolation tests.
  JUDGE: {
    email: process.env.E2E_JUDGE_EMAIL ?? '',
    password: process.env.E2E_JUDGE_PASSWORD ?? '',
    role: 'judge',
    description: 'Show judge — e2e-judge@test.myk9.com, rotated 2026-06-18',
  },

  // Same judge-only invariant, zero assignments — the empty-dashboard subject.
  // No E2E_JUDGE_EMPTY_EMAIL override: the address is hard-coded in seed-demo.sql
  // section 10f, which is where its exclusivity comes from.
  JUDGE_WITHOUT_ASSIGNMENTS: {
    email: 'e2e-judge-empty@test.myk9.com',
    password: process.env.E2E_JUDGE_EMPTY_PASSWORD ?? '',
    role: 'judge',
    description: 'Isolated judge-only account with no assignments',
  },

  // Club-scoped authority ONLY — no site_admin. Kept distinct from SITE_ADMIN on
  // purpose: club gates read `is_site_admin() OR is_club_admin(id)`, so signing in
  // as the site admin satisfies them without ever testing club scoping (MYK9-137).
  // Requires E2E_CLUB_ADMIN_PASSWORD; see scripts/setup-e2e-test-users.ts.
  // No E2E_CLUB_ADMIN_EMAIL override on purpose: this address is hard-coded in
  // supabase/seed-demo.sql (section 10e) and seed-isolated-e2e-accounts.sql, which
  // is where the club_admin grant comes from. An override could only ever point at
  // an account that was never granted anything.
  CLUB_ADMIN: {
    email: 'e2e-club-admin@test.myk9.com',
    password: process.env.E2E_CLUB_ADMIN_PASSWORD ?? '',
    role: 'club_admin',
    description: 'Club-admin-only account, scoped to Heartland — holds no site-wide role',
  },

  EXHIBITOR: {
    email: process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'e2e-exhibitor@test.myk9.com',
    password: process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Compatibility alias for DEMO_EXHIBITOR',
  },

  // Canonical exhibitor login with seeded dogs (Willow, Ranger, Juniper).
  // Protected from DB wipes. Use this account for authenticated exhibitor tests.
  DEMO_EXHIBITOR: {
    email: process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'e2e-exhibitor@test.myk9.com',
    password: process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Canonical exhibitor with seeded dogs — protected from wipes',
  },

  EXHIBITOR_2: {
    email: 'exhibitor2@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Legacy exhibitor fixture — not a canonical route-health login',
  },

  EXHIBITOR_3: {
    email: 'exhibitor3@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Legacy exhibitor fixture — not a canonical route-health login',
  },

  EXHIBITOR_4: {
    email: 'exhibitor4@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Legacy exhibitor fixture — not a canonical route-health login',
  },

  EXHIBITOR_5: {
    email: 'exhibitor5@myk9t.com',
    password: process.env.E2E_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Legacy exhibitor fixture — not a canonical route-health login',
  },
};

/**
 * Navigate to `/sign-in` and wait for the credential field to render, retrying
 * once if the SPA shell is still booting (the dev server's first paint can lag
 * past the goto, leaving a "Loading…" body with no form yet).
 */
async function gotoSignIn(page: Page, signInPath: string): Promise<void> {
  const input = credentialInput(page);

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

  await credentialInput(page).fill(email);
  await continueButton(page).click();

  // The email branch reveals the password sub-form ("we'll ask for your
  // password next"); wait for it before filling.
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(password);

  await page.getByTestId('sign-in-button').click();
  const authErrorBanner = page.getByText(/invalid login credentials|user is banned/i).first();
  const signInResult = await Promise.race([
    page
      .waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 })
      .then(() => 'signed-in' as const)
      .catch((error: unknown) => ({ error })),
    authErrorBanner
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(async () => ({
        authError: (await authErrorBanner.textContent())?.trim() ?? 'auth rejected',
      }))
      .catch(() => new Promise<never>(() => undefined)),
  ]);

  if (typeof signInResult === 'object' && 'authError' in signInResult) {
    throw new Error(`E2E sign-in rejected ${email}: ${signInResult.authError}`);
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

function credentialInput(page: Page) {
  return page
    .getByTestId('credential-input')
    .or(page.getByRole('textbox', { name: /Email or show passcode/i }))
    .first();
}

function continueButton(page: Page) {
  return page
    .getByTestId('continue-button')
    .or(page.getByRole('button', { name: 'Continue', exact: true }))
    .first();
}

/**
 * Sign out the current user.
 */
export async function signOut(page: import('@playwright/test').Page) {
  await page.click('[data-testid="user-menu"], button:has-text("Account menu")');
  await page.click('text="Sign Out"');
  await page.waitForURL(/\/(sign-in|$)/);
}
