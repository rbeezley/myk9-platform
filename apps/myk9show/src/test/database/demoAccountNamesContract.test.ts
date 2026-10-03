// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_NAMES } from '../../../scripts/demoAccountNames';

// MYK9-836: the demo accounts' display names live in one module
// (scripts/demoAccountNames.ts). Every other copy must agree with it, or a
// provisioning run / reseed silently reverts the names (or breaks e2e specs that
// select the owner by name).

const repoRoot = resolve(__dirname, '../../../../..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

const setup = read('apps/myk9show/scripts/setup-e2e-test-users.ts');
const isolatedSeed = read('supabase/seed-isolated-e2e-accounts.sql');
const renameScript = read('supabase/scripts/myk9-836-demo-rename.sql');
const demoSeed = read('supabase/seed-demo.sql');

const emails = Object.keys(DEMO_ACCOUNT_NAMES);

describe('demo account names (single source)', () => {
  it('has no test vocabulary in any canonical name', () => {
    for (const { firstName, lastName } of Object.values(DEMO_ACCOUNT_NAMES)) {
      expect(`${firstName} ${lastName}`).not.toMatch(/\b(Test|Second|Third|Admin|Exhibitor)\b/);
    }
  });

  it('provisioning pulls every demo account name from the shared module', () => {
    for (const email of emails) {
      expect(setup).toContain(`...DEMO_ACCOUNT_NAMES['${email}']!`);
    }
    // No hand-typed "Test" first names survive in a user definition.
    expect(setup).not.toMatch(/firstName:\s*'(Test|Second)'/);
  });

  it('the isolated seed lists the same first and last name per email', () => {
    for (const [email, { firstName, lastName }] of Object.entries(DEMO_ACCOUNT_NAMES)) {
      const row = `('${email}', '${firstName}', '${lastName}')`;
      // The accounts VALUES list appears twice (UPDATE then INSERT).
      expect(isolatedSeed.split(row).length - 1, row).toBe(2);
    }
    expect(isolatedSeed).not.toMatch(/'Test', '/);
    expect(isolatedSeed).not.toContain("'Second', 'Exhibitor'");
  });

  it('the live rename script targets the same names for the shared accounts', () => {
    for (const { firstName, lastName } of Object.values(DEMO_ACCOUNT_NAMES)) {
      expect(renameScript, `${firstName} ${lastName}`).toMatch(
        new RegExp(`'${firstName}', +'${lastName}'\\)`)
      );
    }
  });

  it('seed-demo.sql denormalises the exhibitor and secretary names it shares', () => {
    const exhibitor = DEMO_ACCOUNT_NAMES['exhibitor@myk9t.com']!;
    const secretary = DEMO_ACCOUNT_NAMES['secretary@myk9t.com']!;
    expect(demoSeed).toContain(`'${exhibitor.firstName} ${exhibitor.lastName}'`);
    expect(demoSeed).toContain(`'${secretary.firstName} ${secretary.lastName}'`);
    expect(demoSeed).not.toMatch(/'Test (Exhibitor|Secretary)'/);
  });
});
