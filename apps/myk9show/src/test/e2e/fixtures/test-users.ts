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

// Simple shared password for all test accounts
export const TEST_PASSWORD = 'Test1234!';

// Test user definitions by role
export const TEST_USERS = {
  exhibitor: {
    email: 'e2e-exhibitor@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Exhibitor',
    roles: ['exhibitor']
  },
  secretary: {
    email: 'e2e-secretary@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Secretary',
    roles: ['secretary', 'exhibitor']
  },
  judge: {
    email: 'e2e-judge@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge']
  },
  clubAdmin: {
    email: 'e2e-clubadmin@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'ClubAdmin',
    roles: ['club_admin', 'exhibitor']
  },
  siteAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'exhibitor']
  },
  steward: {
    email: 'e2e-steward@test.myk9.com',
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'Steward',
    roles: ['steward']
  }
} as const;

export type TestUserRole = keyof typeof TEST_USERS;
export type TestUser = typeof TEST_USERS[TestUserRole];
