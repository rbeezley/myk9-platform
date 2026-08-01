import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// R1 (judge-verification-remediation) task 3.1: verify the anon
// ringside-passcode claim can READ only its own show's announcements. A
// ringside passcode session is a Supabase ANONYMOUS auth session, which uses
// the Postgres `authenticated` role but has no account/person record. The
// claim is stamped server-side by validate-passcode and revoked when the
// passcode generation changes.
const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const policyMigrations = readdirSync(migrationsDir)
  .filter(fileName => fileName.endsWith('.sql'))
  .sort()
  .filter(fileName => {
    const sql = readFileSync(resolve(migrationsDir, fileName), 'utf8');
    return (
      sql.includes('show_announcements_select') ||
      sql.includes('"Authenticated users can read announcements"')
    );
  });
const latestPolicyMigration = policyMigrations.at(-1);
if (!latestPolicyMigration) {
  throw new Error('No migration defining the show_announcements SELECT policy was found');
}
const ringsideReadMigration = readFileSync(resolve(migrationsDir, latestPolicyMigration), 'utf8');

describe('show_announcements read authz — anon ringside-passcode contract', () => {
  it('replaces the account-only policy with the latest policy', () => {
    expect(ringsideReadMigration).toContain(
      'DROP POLICY IF EXISTS show_announcements_select ON public.show_announcements'
    );
    expect(ringsideReadMigration).toContain(
      'CREATE POLICY show_announcements_select ON public.show_announcements'
    );
    expect(ringsideReadMigration).toContain('TO authenticated');
  });

  it('keeps real accounts on the existing account read path', () => {
    expect(ringsideReadMigration).toContain('(SELECT public.is_real_account())');
  });

  it('admits only a current, server-stamped claim for the row show', () => {
    expect(ringsideReadMigration).toContain(
      '(SELECT public.ringside_claim_generation_current()) IS TRUE'
    );
    expect(ringsideReadMigration).toContain(
      "(SELECT auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'"
    );
    expect(ringsideReadMigration).toContain(
      "nullif((SELECT auth.jwt() -> 'app_metadata' ->> 'show_id'), '') = show_announcements.show_id::text"
    );
  });

  it('intentionally admits every validated show-participant passcode role', () => {
    expect(ringsideReadMigration).toContain(
      'claim for any validated passcode role (including exhibitor)'
    );
    expect(ringsideReadMigration).not.toContain('ringside_role');
  });

  it('keeps claim-based authorization limited to SELECT policy statements', () => {
    const claimPolicyStatements = ringsideReadMigration
      .split(/(?=CREATE POLICY\b|ALTER POLICY\b)/i)
      .filter(statement => statement.includes('auth.jwt()') || statement.includes('app_metadata'));

    expect(claimPolicyStatements.length).toBeGreaterThan(0);
    for (const statement of claimPolicyStatements) {
      expect(statement).toMatch(/CREATE POLICY\s+show_announcements_select[\s\S]*FOR SELECT/i);
    }
  });

  it('does not restore the old account-wide auth.uid-only read', () => {
    expect(ringsideReadMigration).not.toContain('USING (auth.uid() IS NOT NULL)');
    expect(ringsideReadMigration).not.toContain('USING (( SELECT auth.uid()) IS NOT NULL)');
  });
});
