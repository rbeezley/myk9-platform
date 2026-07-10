import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// R1 (judge-verification-remediation) task 3.1: verify the anon
// ringside-passcode claim can READ show-scoped announcements before wiring
// the feed. A ringside passcode session is a Supabase ANONYMOUS auth
// session (see supabase/functions/validate-passcode/index.ts and migration
// 20260624163000's Phase C note): it authenticates as Postgres role
// `authenticated` with a non-null `auth.uid()`, it just carries no
// account/person record.
//
// show_announcements' SELECT policy (migration 057, unchanged by 089's
// SA-022 fix, which only touched INSERT/UPDATE/DELETE) is
// `USING (auth.uid() is not null)` — ANY authenticated caller, which already
// admits the anon passcode session. No migration/RLS extension was needed
// for R1's read path. This is a static-SQL contract test (pattern per
// ringsidePasscodeClaimAuthzRlsContract.test.ts) pinning that fact so a
// future edit narrowing the SELECT policy to an account-only check doesn't
// silently break ringside announcements again.

const baseMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/057_announcements.sql'),
  'utf8'
);
const authzFixMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/089_security_sa022_announcements_rls.sql'),
  'utf8'
);

describe('show_announcements read authz — anon ringside-passcode contract', () => {
  it('SELECT policy admits any authenticated caller (auth.uid() is not null), not an account/role check', () => {
    expect(baseMigration).toContain('create policy "Authenticated users can read announcements"');
    expect(baseMigration).toContain('on show_announcements for select');
    expect(baseMigration).toContain('using (auth.uid() is not null)');
  });

  it('the SELECT policy is not scoped to a `TO <role>` clause narrower than authenticated', () => {
    // A `TO authenticated` (or no TO clause, defaulting to PUBLIC/all roles)
    // both admit the anon passcode session, which authenticates as Postgres
    // role `authenticated`. Guard against a future edit adding e.g.
    // `TO secretary, judge` which would silently exclude it.
    const selectPolicy = baseMigration.slice(
      baseMigration.indexOf('create policy "Authenticated users can read announcements"'),
      baseMigration.indexOf('-- Announcements: all authenticated users can insert')
    );
    expect(selectPolicy).not.toMatch(/\bto\s+(?!authenticated\b)\w+/i);
  });

  it('SA-022 only replaced the mutation policies (INSERT/UPDATE/DELETE) — SELECT stayed untouched', () => {
    expect(authzFixMigration).not.toContain('read announcements');
    expect(authzFixMigration).toContain(
      'DROP POLICY IF EXISTS "Authenticated users can create announcements"'
    );
    expect(authzFixMigration).toContain(
      'DROP POLICY IF EXISTS "Author or admin can update announcements"'
    );
    expect(authzFixMigration).toContain(
      'DROP POLICY IF EXISTS "Author or admin can delete announcements"'
    );
  });

  it('never widens write access to the ringside-passcode claim (no composer at ringside, per R1 design)', () => {
    // The mutation policies gate on auth.uid() = author_id or is_platform_admin()
    // — never on app_metadata / JWT claims. A passcode session with no `people`
    // record cannot satisfy `auth.uid() = author_id` for a secretary-authored
    // announcement, so it cannot post/edit/delete. This must stay true.
    expect(authzFixMigration).not.toContain('app_metadata');
    expect(authzFixMigration).not.toContain('auth.jwt()');
  });
});
