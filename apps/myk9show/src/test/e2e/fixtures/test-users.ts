/**
 * E2E Test Users Configuration
 *
 * All test users share the same simple password for easy testing.
 * These users must be created in Supabase before running E2E tests.
 *
 * To create these users, run:
 *   node scripts/setup-e2e-test-users.js
 *
 * Or create them manually in Supabase Auth dashboard.
 */

// Shared password for all e2e role accounts (staging). Env-only — never spell a
// live shared credential into source (the value is rotated periodically; the
// last literal here was leaked + rotated 2026-06-25). All accounts share one
// password, so any E2E_*_PASSWORD works; source it from apps/myk9show/.env.local
// or CI secrets. Empty string when unset → dependent specs skip / fail loud.
export const TEST_PASSWORD =
  process.env.E2E_SECRETARY_PASSWORD ?? process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '';

// Test user definitions by role
export const TEST_USERS = {
  exhibitor: {
    email: 'e2e-exhibitor@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Exhibitor',
    roles: ['exhibitor'],
  },
  secretary: {
    email: 'e2e-secretary@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'steward', 'exhibitor'],
  },
  judge: {
    email: 'e2e-judge@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge'],
  },
  clubAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'club_admin', 'chairman', 'exhibitor'],
  },
  siteAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'exhibitor'],
  },
  steward: {
    email: 'e2e-secretary@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'steward', 'exhibitor'],
  },
} as const;

export type TestUserRole = keyof typeof TEST_USERS;
export type TestUser = (typeof TEST_USERS)[TestUserRole];
