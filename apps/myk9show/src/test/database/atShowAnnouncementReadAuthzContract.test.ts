import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// R1 (judge-verification-remediation) task 3.1: verify the anon
// ringside-passcode claim can READ only its own show's announcements. A
// ringside passcode session is a Supabase ANONYMOUS auth session, which uses
// the Postgres `authenticated` role but has no account/person record. The
// claim is stamped server-side by validate-passcode and revoked when the
// passcode generation changes.
const ringsideReadMigration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260801110000_restore_ringside_announcement_read_authz.sql'
  ),
  'utf8'
);

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

  it('does not restore the old account-wide auth.uid-only read', () => {
    expect(ringsideReadMigration).not.toContain('USING (auth.uid() IS NOT NULL)');
    expect(ringsideReadMigration).not.toContain('USING (( SELECT auth.uid()) IS NOT NULL)');
  });
});
