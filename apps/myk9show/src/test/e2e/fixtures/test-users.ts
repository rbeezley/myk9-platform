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
  // `roles: ['judge']` here is a CLAIM about the database, not a control on it —
  // nothing in this file grants or revokes anything. seed-demo.sql section 10g is
  // what makes it true, by deactivating every non-judge grant on this address;
  // before it existed the account carried a stray exhibitor grant and rendered as
  // `Secretary +2` (MYK9-141). The exclusivity is the whole value of the fixture:
  // a judge that also holds exhibitor/secretary satisfies judge-only checks
  // through the broader role, so an isolation test written with it is vacuous —
  // the same trap `clubAdmin` below documents for site_admin.
  judge: {
    email: 'e2e-judge@test.myk9.com',
    password: process.env.E2E_JUDGE_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Judge',
    roles: ['judge'],
  },
  // Same exclusivity, but seeded with no judge_assignments rows at all.
  judgeWithoutAssignments: {
    email: 'e2e-judge-empty@test.myk9.com',
    password: process.env.E2E_JUDGE_EMPTY_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Judge No Assignments',
    roles: ['judge'],
  },
  // MUST stay a different account from `siteAdmin`, holding NO site-wide role.
  // Club-scoped gates are a disjunction (`is_site_admin() OR is_club_admin(id)`),
  // so an actor that is also a site admin satisfies them through the site branch
  // and never exercises club scoping — a cross-club rejection test written with
  // such an account passes whether or not the club term exists (MYK9-137).
  // Provisioned by scripts/setup-e2e-test-users.ts when E2E_CLUB_ADMIN_PASSWORD
  // is set; club_admin on Heartland only (supabase/seed-demo.sql section 10e).
  clubAdmin: {
    email: 'e2e-club-admin@test.myk9.com',
    password: process.env.E2E_CLUB_ADMIN_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Club Admin',
    roles: ['club_admin'],
  },
  siteAdmin: {
    email: 'e2e-admin@test.myk9.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    firstName: 'Test',
    lastName: 'Admin',
    roles: ['site_admin', 'secretary', 'club_admin', 'chairman', 'exhibitor'],
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
