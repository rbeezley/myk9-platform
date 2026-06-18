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
    email: process.env.E2E_CLUB_EMAIL ?? 'club@myk9t.com',
    password: process.env.E2E_CLUB_PASSWORD ?? '',
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
 * Sign in as a test user and wait for navigation away from the sign-in page.
 */
export async function signInAsTestUser(
  page: import('@playwright/test').Page,
  userType: keyof typeof TEST_USERS
) {
  const user = TEST_USERS[userType];

  await page.goto('/sign-in');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from the sign-in page (role-specific dashboards vary)
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });

  return user;
}

/**
 * Sign out the current user.
 */
export async function signOut(page: import('@playwright/test').Page) {
  await page.click('[data-testid="user-menu"], button:has-text("Account menu")');
  await page.click('text="Sign Out"');
  await page.waitForURL(/\/(sign-in|$)/);
}
