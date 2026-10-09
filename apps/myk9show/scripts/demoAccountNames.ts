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

export interface DemoAccountAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * MYK9-1010: an AKC entry needs the dog owner's complete address (the marked
 * catalog prints it), and these accounts own the dogs E2E specs enter into the
 * AKC demo show. Obviously fake: a "Demo Lane" in Demoville, KS, ZIP 99999
 * (unassigned). Every demo account gets one so a spec can enter any of them.
 *
 * Repeated as SQL literals by supabase/seed-isolated-e2e-accounts.sql,
 * supabase/seed-demo.sql and supabase/scripts/myk9-1010-fixture-addresses.sql;
 * src/test/database/demoAccountAddressesContract.test.ts fails when any drifts.
 */
const demoAddress = (houseNumber: number): DemoAccountAddress => ({
  streetAddress: `${houseNumber} Demo Lane`,
  city: 'Demoville',
  state: 'KS',
  zipCode: '99999',
});

export const DEMO_ACCOUNT_ADDRESSES: Record<string, DemoAccountAddress> = {
  'exhibitor@myk9t.com': demoAddress(101),
  'secretary@myk9t.com': demoAddress(102),
  'judge@myk9t.com': demoAddress(103),
  'testadmin@myk9t.com': demoAddress(104),
  'clubadmin@myk9t.com': demoAddress(105),
  'chairman@myk9t.com': demoAddress(106),
  'exhibitor2@myk9t.com': demoAddress(107),
};
