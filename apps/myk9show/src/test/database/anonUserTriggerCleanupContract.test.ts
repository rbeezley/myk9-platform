import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase E of docs/plan-ringside-entries-read-authz.md. Enabling anonymous
// sign-ins for passcode ringside (Phase C/D) exposed a latent bug: the new-user
// triggers created people/exhibitor_profiles/user_roles for EVERY auth user,
// including anonymous ones — polluting core tables and blocking hard-delete.
//
// These are static SQL-content contracts (the behavioral proof ran live against
// staging in rolled-back transactions: an anon insert creates 0 children, the
// anon row then deletes cleanly, a normal insert still creates its person; the
// cleanup function removes exactly the stale anon users + children and leaves
// real people untouched). They guard against a future edit silently re-breaking
// the boundaries.

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const triggerMigration = readFileSync(
  resolve(migrationsDir, '20260625000000_skip_anon_users_in_new_user_trigger.sql'),
  'utf8'
);
const cleanupMigration = readFileSync(
  resolve(migrationsDir, '20260625000100_cleanup_stale_ringside_anon_users.sql'),
  'utf8'
);
const safeCastMigration = readFileSync(
  resolve(migrationsDir, '20260625000200_cleanup_anon_safe_show_id_cast.sql'),
  'utf8'
);

describe('anon-user trigger guard — 20260625000000', () => {
  it('skips anonymous users in handle_new_user BEFORE creating any person row', () => {
    const guardIndex = triggerMigration.indexOf('IF NEW.is_anonymous THEN');
    const firstPeopleInsert = triggerMigration.indexOf('INSERT INTO public.people');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(firstPeopleInsert).toBeGreaterThan(guardIndex); // guard precedes creation
  });

  it('guards materialize_club_access_request_from_auth_user for anonymous users', () => {
    const fnIndex = triggerMigration.indexOf(
      'FUNCTION public.materialize_club_access_request_from_auth_user'
    );
    expect(fnIndex).toBeGreaterThanOrEqual(0);
    const fnBody = triggerMigration.slice(fnIndex);
    const guardIndex = fnBody.indexOf('if new.is_anonymous then');
    const accessCall = fnBody.indexOf('insert_club_access_request_from_signup');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(accessCall).toBeGreaterThan(guardIndex);
  });

  it('preserves the non-anonymous path (still creates person + exhibitor profile)', () => {
    // Regression guard: the guard must be an early-return, not a removal of the
    // normal signup behavior.
    expect(triggerMigration).toContain('INSERT INTO public.people');
    expect(triggerMigration).toContain('INSERT INTO public.exhibitor_profiles');
    expect(triggerMigration).toContain('INSERT INTO public.user_roles');
  });
});

describe('stale-anon cleanup — 20260625000100', () => {
  it('is SECURITY DEFINER and revoked from public', () => {
    expect(cleanupMigration).toContain('SECURITY DEFINER');
    expect(cleanupMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.cleanup_stale_ringside_anon_users\([^)]*\) FROM public/
    );
  });

  it('only ever selects anonymous users for deletion', () => {
    expect(cleanupMigration).toContain('u.is_anonymous = true');
  });

  it('deletes child rows BEFORE the auth.users row (FK-safe order)', () => {
    const userRoles = cleanupMigration.indexOf('DELETE FROM public.user_roles');
    const profiles = cleanupMigration.indexOf('DELETE FROM public.exhibitor_profiles');
    const people = cleanupMigration.indexOf('DELETE FROM public.people');
    const authUsers = cleanupMigration.indexOf('DELETE FROM auth.users');
    expect(userRoles).toBeGreaterThanOrEqual(0);
    expect(authUsers).toBeGreaterThan(people);
    expect(people).toBeGreaterThan(profiles);
    expect(profiles).toBeGreaterThan(userRoles);
  });

  it('re-asserts is_anonymous on the final auth.users delete (belt-and-suspenders)', () => {
    expect(cleanupMigration).toMatch(
      /DELETE FROM auth\.users WHERE id = ANY\(v_ids\) AND is_anonymous = true/
    );
  });

  it('scopes every delete to the collected ids (never an unbounded delete)', () => {
    // No DELETE may run without an id-scoped predicate.
    const deletes = cleanupMigration.match(/DELETE FROM (public|auth)\.\w+[^;]*/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const stmt of deletes) {
      expect(stmt).toMatch(/= ANY\(v_ids\)/);
    }
  });

  it('schedules a daily pg_cron cleanup job', () => {
    expect(cleanupMigration).toContain("cron.schedule(\n  'cleanup-ringside-anon'");
    expect(cleanupMigration).toContain("'0 4 * * *'");
  });
});

describe('cleanup show_id cast hardening — 20260625000200', () => {
  it('safe-casts show_id via a UUID regex guard (a bad value can never abort the cron)', () => {
    // The cast must be gated by a UUID-shape regex so a malformed app_metadata
    // show_id yields NULL instead of raising and aborting the whole run.
    expect(safeCastMigration).toMatch(
      /~\*\s*'\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$'/
    );
    expect(safeCastMigration).toContain('CASE');
  });

  it('filters to anonymous rows BEFORE casting (cast never runs over real accounts)', () => {
    const cte = safeCastMigration.indexOf('WITH stale AS');
    const anonFilter = safeCastMigration.indexOf('WHERE u.is_anonymous = true');
    const arrayAgg = safeCastMigration.indexOf('array_agg(st.id)');
    expect(cte).toBeGreaterThanOrEqual(0);
    expect(anonFilter).toBeGreaterThan(cte);
    expect(arrayAgg).toBeGreaterThan(anonFilter); // selection happens after the anon-only CTE
  });

  it('keeps the belt-and-suspenders is_anonymous re-assert on the final delete', () => {
    expect(safeCastMigration).toMatch(
      /DELETE FROM auth\.users WHERE id = ANY\(v_ids\) AND is_anonymous = true/
    );
  });
});
