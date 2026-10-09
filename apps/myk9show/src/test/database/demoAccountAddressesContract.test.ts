// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_ADDRESSES, DEMO_ACCOUNT_NAMES } from '../../../scripts/demoAccountNames';
import { ownerAddressMissingParts } from '@/features/registration/ownerAddress';

// MYK9-1010: an AKC entry is refused (wizard, submit_show_entries,
// stripe-checkout) when the dog's owner has no complete address. The shared
// @myk9t.com demo accounts own the dogs E2E specs enter into the AKC demo
// show, so every copy that provisions or seeds them must carry a complete
// address, and the copies must agree with the one module.

const repoRoot = resolve(__dirname, '../../../../..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

const setup = read('apps/myk9show/scripts/setup-e2e-test-users.ts');
const isolatedSeed = read('supabase/seed-isolated-e2e-accounts.sql');
const demoSeed = read('supabase/seed-demo.sql');
const loadSeed = read('supabase/seed-load-fixture.sql');
const liveScript = read('supabase/scripts/myk9-1010-fixture-addresses.sql');

const addressTuple = (email: string) => {
  const a = DEMO_ACCOUNT_ADDRESSES[email]!;
  return `('${email}', '${a.streetAddress}', '${a.city}', '${a.state}', '${a.zipCode}')`;
};

/** Every @myk9t.com account a seed resolves a dog owner from. */
function seededDogOwners(sql: string): string[] {
  const owners = new Set<string>();
  for (const block of sql.split(/INSERT INTO public\.dogs/).slice(1)) {
    const statement = block.split(/;\s*\n/)[0] ?? '';
    for (const match of statement.matchAll(/lower\(email\)\s*=\s*'([^']+@myk9t\.com)'/g)) {
      owners.add(match[1]!);
    }
  }
  return [...owners].sort();
}

describe('demo account addresses (MYK9-1010)', () => {
  it('gives every demo account a complete address', () => {
    expect(Object.keys(DEMO_ACCOUNT_ADDRESSES).sort()).toEqual(
      Object.keys(DEMO_ACCOUNT_NAMES).sort()
    );
    for (const [email, address] of Object.entries(DEMO_ACCOUNT_ADDRESSES)) {
      expect(ownerAddressMissingParts(address), email).toEqual([]);
    }
  });

  it('covers every account the seeds make a dog owner', () => {
    const owners = [...seededDogOwners(demoSeed), ...seededDogOwners(loadSeed)];
    // Known answer for the reader: the demo seed's dogs belong to these two.
    expect(seededDogOwners(demoSeed)).toEqual(['exhibitor@myk9t.com', 'secretary@myk9t.com']);
    for (const owner of owners) {
      expect(DEMO_ACCOUNT_ADDRESSES[owner], owner).toBeDefined();
    }
  });

  it('provisioning writes the address from the shared module on update and insert', () => {
    for (const email of Object.keys(DEMO_ACCOUNT_NAMES)) {
      expect(setup).toContain(`address: DEMO_ACCOUNT_ADDRESSES['${email}']!,`);
    }
    expect(setup.match(/\.\.\.addressColumns/g)?.length).toBe(2);
  });

  it('the isolated seed sets the same address per email, after the people upsert', () => {
    const upsertEnd = isolatedSeed.indexOf('INSERT INTO public.people');
    for (const email of Object.keys(DEMO_ACCOUNT_ADDRESSES)) {
      expect(isolatedSeed.split(addressTuple(email)).length - 1, email).toBe(1);
      // After the INSERT, so a freshly created profile gets it too.
      expect(isolatedSeed.indexOf(addressTuple(email)), email).toBeGreaterThan(upsertEnd);
    }
  });

  it('seed-demo.sql fills the same address for every demo account', () => {
    for (const email of Object.keys(DEMO_ACCOUNT_ADDRESSES)) {
      expect(demoSeed, email).toContain(addressTuple(email));
    }
  });

  it('the live script fills exactly the three fixture owners, with the same values', () => {
    const fixtures = ['exhibitor@myk9t.com', 'secretary@myk9t.com', 'testadmin@myk9t.com'];
    for (const email of fixtures) {
      expect(liveScript, email).toContain(addressTuple(email));
    }
    const targeted = [...liveScript.matchAll(/\('([^']+@[^']+)',/g)].map(m => m[1]).sort();
    expect(targeted).toEqual(fixtures);
  });
});
