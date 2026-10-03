/**
 * Display names of the seeded @myk9t.com demo accounts (MYK9-836), defined once.
 *
 * Imported by setup-e2e-test-users.ts so every provisioning run writes these to
 * both `people` and the Auth user metadata. supabase/seed-isolated-e2e-accounts.sql
 * and supabase/scripts/myk9-836-demo-rename.sql repeat them as SQL literals;
 * src/test/database/demoAccountNamesContract.test.ts fails when any copy drifts.
 */
export interface DemoAccountName {
  firstName: string;
  lastName: string;
}

export const DEMO_ACCOUNT_NAMES: Record<string, DemoAccountName> = {
  'exhibitor@myk9t.com': { firstName: 'Casey', lastName: 'Morgan' },
  'secretary@myk9t.com': { firstName: 'Jordan', lastName: 'Ellis' },
  'judge@myk9t.com': { firstName: 'Pat', lastName: 'Donovan' },
  'testadmin@myk9t.com': { firstName: 'Taylor', lastName: 'Brooks' },
  'clubadmin@myk9t.com': { firstName: 'Morgan', lastName: 'Reyes' },
  'chairman@myk9t.com': { firstName: 'Alex', lastName: 'Whitfield' },
  'exhibitor2@myk9t.com': { firstName: 'Riley', lastName: 'Parker' },
};
