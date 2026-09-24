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

import { type Page } from '@playwright/test';
import { resolveFixtureEmail } from '../../fixtures/fixtureEmail';
import { assertAddressIsLive } from '../../fixtures/retiredFixtureDomain';
import { runSignInLadder } from '../../e2e-helpers/signInRetryPolicy';
import { attemptSignIn } from './signInFlow';

export interface TestUser {
  email: string;
  password: string;
  role: string;
  description: string;
}

// EMAILS USE `||`, NOT `??`, AND THE DIFFERENCE IS LOAD-BEARING. An unset
// GitHub secret does not arrive as undefined — `${{ secrets.FOO }}` interpolates
// to an EMPTY STRING. `??` only fires on null/undefined, so with `??` an unset
// secret beat the default and the suite signed in as ''. Worse, the preflight
// resolver used `||`, so it fell back to the canonical address and reported the
// credentials healthy; the preflight passed and Playwright then failed, which is
// the exact false-green the preflight exists to prevent (Codex, #1889).
//
// Passwords keep `?? ''` because blank must stay fatal there: `signIn` and
// `resolveAuthPreflightConfig` both reject an empty password outright.
//
// F2: these defaulted to '' while only the `description` named the real account, so a
// stale env override (or a missing one) failed as `Invalid login credentials` -- the
// same message Supabase returns for a wrong password, which reads as a rotation problem
// rather than a bad address. The @test.myk9.com set these once pointed at was retired
// on 2026-08-23 and has no auth.users rows. Defaulting to the canonical @myk9t.com
// accounts, as DEMO_EXHIBITOR already did, makes a missing override harmless and an
// unset email impossible. Passwords stay env-only and are never defaulted.
export const TEST_USERS: Record<string, TestUser> = {
  SITE_ADMIN: {
    email: resolveFixtureEmail(process.env.E2E_ADMIN_EMAIL, 'testadmin@myk9t.com'),
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    role: 'site_admin',
    description: 'Site administrator — testadmin@myk9t.com, rotated 2026-06-18',
  },

  SECRETARY: {
    email: resolveFixtureEmail(process.env.E2E_SECRETARY_EMAIL, 'secretary@myk9t.com'),
    password: process.env.E2E_SECRETARY_PASSWORD ?? '',
    role: 'secretary',
    description: 'Show secretary — secretary@myk9t.com, rotated 2026-06-18',
  },

  // JUDGE-ONLY, and the "only" is load-bearing (MYK9-141). A judge that also
  // holds exhibitor or secretary clears judge-only authorization checks through
  // the wrong branch, so "a judge is denied the secretary result surface" would
  // report a pass whether or not judge scoping exists. seed-demo.sql section 10g
  // deactivates every non-judge grant on this address to keep that true; the
  // 2026-08-01 judge UX walk found it rendering as `Secretary +2`.
  //
  // Assigned to classes 031..035 of the Heartland show; 036..039 are assigned to
  // nobody, which is the negative subject for assignment-isolation tests.
  JUDGE: {
    email: resolveFixtureEmail(process.env.E2E_JUDGE_EMAIL, 'judge@myk9t.com'),
    password: process.env.E2E_JUDGE_PASSWORD ?? '',
    role: 'judge',
    description: 'Show judge — judge@myk9t.com, rotated 2026-06-18',
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
    email: 'clubadmin@myk9t.com',
    password: process.env.E2E_CLUB_ADMIN_PASSWORD ?? '',
    role: 'club_admin',
    description: 'Club-admin-only account, scoped to Heartland — holds no site-wide role',
  },

  EXHIBITOR: {
    email: resolveFixtureEmail(process.env.E2E_DEMO_EXHIBITOR_EMAIL, 'exhibitor@myk9t.com'),
    password: process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    role: 'exhibitor',
    description: 'Compatibility alias for DEMO_EXHIBITOR',
  },

  // Canonical exhibitor login with seeded dogs (Willow, Ranger, Juniper).
  // Protected from DB wipes. Use this account for authenticated exhibitor tests.
  DEMO_EXHIBITOR: {
    email: resolveFixtureEmail(process.env.E2E_DEMO_EXHIBITOR_EMAIL, 'exhibitor@myk9t.com'),
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

/** The E2E suite's own post-submit budget. Unchanged since before MYK9-463. */
export const DEFAULT_SIGN_IN_NAVIGATION_TIMEOUT_MS = 15000;

export interface SignInOptions {
  /**
   * How long to wait for the password step and then for navigation off
   * `/sign-in`. Callers that authenticate many sessions at once (the G9 load
   * harness) pass their own budget; specs leave it alone.
   */
  navigationTimeoutMs?: number;
  /**
   * Whether an `auth-never-returned` timeout may be retried (MYK9-541).
   * Defaults to true. The G9 load harness passes `false` EXPLICITLY rather
   * than relying on its 45s budget to overflow the ladder's total budget:
   * that arithmetic silently re-enables retries at any per-attempt budget
   * under ~21s, and 16 shards retrying in lockstep would amplify exactly the
   * load the policy exists to survive. See `LOAD_HARNESS_SIGN_IN_OPTIONS`.
   */
  retry?: boolean;
}

/**
 * This is the one canonical sign-in helper; every spec's local `signIn` and the
 * role wrappers below delegate here so the flow lives in exactly one place.
 *
 * A sign-in that ran out of time with no session token (`auth-never-returned`)
 * is auth-service latency, not a verdict on the diff, so it is retried inside a
 * bounded, logged, circuit-broken ladder — `signInRetryPolicy` owns which
 * verdicts qualify, how the next attempt is projected from the measured cost of
 * the last one, and when the worker stops retrying altogether.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  returnTo = '/',
  options: SignInOptions = {}
): Promise<void> {
  if (!email || !password) {
    throw new Error(`Missing E2E credentials for ${email || 'unknown test user'}`);
  }

  assertAddressIsLive(email);

  // Default unchanged for the E2E suite; the load harness passes its own budget
  // because 16 shards authenticate at once and this literal was the only 15s
  // cliff in a preparation phase whose neighbours already allow 30-90s
  // (MYK9-463).
  const navigationTimeoutMs = options.navigationTimeoutMs ?? DEFAULT_SIGN_IN_NAVIGATION_TIMEOUT_MS;

  await runSignInLadder(email, {
    attempt: () => attemptSignIn(page, email, password, returnTo, navigationTimeoutMs),
    wait: ms => page.waitForTimeout(ms),
    now: () => performance.now(),
    log: line => console.warn(line),
    retriesEnabled: options.retry !== false,
  });
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
 * Role convenience wrappers — use the env-backed canonical accounts.
 *
 * The `*@myk9t.com` addresses are real mailboxes with `auth.users` rows and DO
 * authenticate; verified 2026-08-26 signing in as `secretary@myk9t.com` and
 * `exhibitor@myk9t.com`. They are the defaults below for that reason.
 *
 * The older `e2e-*@test.myk9.com` addresses are NOT a supported override — that
 * domain is retired and holds no auth users. `assertAddressIsLive` rejects one
 * before it reaches Supabase, because the error Supabase returns for a dead
 * address is indistinguishable from a wrong password.
 */
export const signInAsSecretary = (page: Page, returnTo = '/', options?: SignInOptions) =>
  signIn(page, TEST_USERS.SECRETARY.email, TEST_USERS.SECRETARY.password, returnTo, options);

export const signInAsAdmin = (page: Page, returnTo = '/', options?: SignInOptions) =>
  signIn(page, TEST_USERS.SITE_ADMIN.email, TEST_USERS.SITE_ADMIN.password, returnTo, options);

export const signInAsJudge = (page: Page, returnTo = '/', options?: SignInOptions) =>
  signIn(page, TEST_USERS.JUDGE.email, TEST_USERS.JUDGE.password, returnTo, options);

/** Exhibitor wrapper uses the protected demo account with seeded dogs. */
export const signInAsExhibitor = (page: Page, returnTo = '/', options?: SignInOptions) =>
  signIn(
    page,
    TEST_USERS.DEMO_EXHIBITOR.email,
    TEST_USERS.DEMO_EXHIBITOR.password,
    returnTo,
    options
  );
