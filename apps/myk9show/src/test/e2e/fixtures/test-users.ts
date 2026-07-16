/**
 * E2E Test Users Configuration
 *
 * Canonical test users use per-account passwords, matching CI secrets and
 * `scripts/setup-e2e-test-users.ts`.
 * These users must be created in Supabase before running E2E tests.
 *
 * To create these users, run:
 *   pnpm exec tsx scripts/setup-e2e-test-users.ts
 *
 * Or create them manually in Supabase Auth dashboard.
 */

// Legacy export retained for callers that only exercise the secretary fixture.
// Role-aware callers must use TEST_USERS[role].password.
export const TEST_PASSWORD = process.env.E2E_SECRETARY_PASSWORD ?? '';

// Test user definitions by role
export const TEST_USERS = {
  exhibitor: {
    email: 'e2e-exhibitor@test.myk9.com',
    password: process.env.E2E_DEMO_EXHIBITOR_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Exhibitor',
    roles: ['exhibitor'],
  },
  secretary: {
    email: 'e2e-secretary@test.myk9.com',
    password: process.env.E2E_SECRETARY_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'steward', 'exhibitor'],
  },
  judge: {
    email: 'e2e-judge@test.myk9.com',
    password: process.env.E2E_JUDGE_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge'],
  },
  clubAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'club_admin', 'chairman', 'exhibitor'],
  },
  siteAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'exhibitor'],
  },
  steward: {
    email: 'e2e-secretary@test.myk9.com',
    password: process.env.E2E_SECRETARY_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'steward', 'exhibitor'],
  },
} as const;

export type TestUserRole = keyof typeof TEST_USERS;
export type TestUser = (typeof TEST_USERS)[TestUserRole];
