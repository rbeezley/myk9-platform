/**
 * Test Users for Playwright E2E Testing
 *
 * All accounts live in the `myk9-platform` Supabase project.
 * Passwords marked "unverified" haven't been confirmed via automated test;
 * update this file and docs/testing/ if you reset them.
 */

export interface TestUser {
  email: string;
  password: string;
  role: string;
  description: string;
}

export const TEST_USERS: Record<string, TestUser> = {
  SITE_ADMIN: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@myk9t.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'TestPass4567!',
    role: 'site_admin',
    description: 'Site administrator — confirmed reset 2026-05-14',
  },

  SECRETARY: {
    email: 'secretary@myk9t.com',
    password: 'TestPass4567!',
    role: 'secretary',
    description: 'Show secretary — confirmed reset 2026-05-14',
  },

  JUDGE: {
    email: 'judge@myk9t.com',
    password: 'TestPass4567!',
    role: 'judge',
    description: 'Show judge — confirmed reset 2026-05-14',
  },

  CLUB_ADMIN: {
    email: 'club@myk9t.com',
    password: 'TestPass4567!',
    role: 'club_admin',
    description: 'Club administrator — confirmed reset 2026-05-14',
  },

  EXHIBITOR: {
    email: 'exhibitor1@myk9t.com',
    password: 'TestPass4567!',
    role: 'exhibitor',
    description: 'Exhibitor (Alice Martin) — confirmed reset 2026-05-14',
  },

  EXHIBITOR_2: {
    email: 'exhibitor2@myk9t.com',
    password: 'TestPass4567!',
    role: 'exhibitor',
    description: 'Exhibitor test account — confirmed reset 2026-05-14',
  },

  EXHIBITOR_3: {
    email: 'exhibitor3@myk9t.com',
    password: 'TestPass4567!',
    role: 'exhibitor',
    description: 'Exhibitor test account — confirmed reset 2026-05-14',
  },

  EXHIBITOR_4: {
    email: 'exhibitor4@myk9t.com',
    password: 'TestPass4567!',
    role: 'exhibitor',
    description: 'Exhibitor test account — confirmed reset 2026-05-14',
  },

  EXHIBITOR_5: {
    email: 'exhibitor5@myk9t.com',
    password: 'TestPass4567!',
    role: 'exhibitor',
    description: 'Exhibitor test account — confirmed reset 2026-05-14',
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
