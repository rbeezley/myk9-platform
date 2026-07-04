import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SA-006: user_roles / roles / permissions / role_permissions / permission_audit_log
// all still carried `SELECT USING (true)` from migration 006, letting any signed-in
// user enumerate the full role map. This migration scopes those five SELECT
// policies and moves the legitimate cross-user reads to SECURITY DEFINER RPCs.
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260703180000_restrict_rbac_role_map_select.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('RBAC role-map SELECT scoping RLS contract (SA-006)', () => {
  it('drops all five permissive USING (true) SELECT policies', () => {
    for (const policy of [
      'DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles',
      'DROP POLICY IF EXISTS "permission_audit_log_select" ON public.permission_audit_log',
      'DROP POLICY IF EXISTS "roles_select" ON public.roles',
      'DROP POLICY IF EXISTS "permissions_select" ON public.permissions',
      'DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions',
    ]) {
      expect(migration).toContain(policy);
    }
  });

  it('scopes user_roles SELECT to self (auth_user_id) or site admin, denying anon', () => {
    const policy = sliceBetween(
      migration,
      'CREATE POLICY "user_roles_select"',
      'CREATE POLICY "permission_audit_log_select"'
    );
    expect(policy).toContain('FOR SELECT TO authenticated');
    expect(policy).toContain('(SELECT auth.uid()) = auth_user_id');
    expect(policy).toContain('(SELECT public.is_site_admin())');
    // must not re-open to the whole table
    expect(policy).not.toContain('USING (true)');
    expect(policy).not.toContain('USING (TRUE)');
  });

  it('scopes permission_audit_log SELECT to site admins only', () => {
    const policy = sliceBetween(
      migration,
      'CREATE POLICY "permission_audit_log_select"',
      'CREATE POLICY "roles_select"'
    );
    expect(policy).toContain('FOR SELECT TO authenticated');
    expect(policy).toContain('USING ((SELECT public.is_site_admin()))');
    expect(policy).not.toContain('auth_user_id');
  });

  it('keeps the roles/permissions/role_permissions catalog readable to authenticated only (deny anon)', () => {
    for (const table of ['roles', 'permissions', 'role_permissions']) {
      const policy = sliceBetween(
        migration,
        `CREATE POLICY "${table}_select" ON public.${table}`,
        ';'
      );
      expect(policy).toContain('FOR SELECT TO authenticated');
      expect(policy).toContain('USING (true)');
    }
  });

  it('adds get_show_officials as a public-safe SECURITY DEFINER RPC for show overview officials', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)'
    );
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)',
      'CREATE OR REPLACE FUNCTION public.get_club_show_manager_ids'
    );
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain("SET search_path = ''");
    // returns only a single show's officials, never the whole table
    expect(fn).toContain('JOIN public.shows s ON s.id = ur.show_id');
    expect(fn).toContain('WHERE ur.show_id = p_show_id');
    expect(fn).toContain('s.deleted_at IS NULL');
    expect(fn).toContain("s.status IN ('published', 'upcoming', 'in_progress', 'completed')");
    expect(fn).toContain('(SELECT public.is_club_admin(s.club_id))');
    expect(fn).toContain('(SELECT public.is_show_secretary(s.id))');
    expect(fn).toContain('(SELECT public.is_site_admin())');
    expect(fn).toContain("r.name IN ('secretary', 'chairman', 'steward')");
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated'
    );
  });

  it('adds get_club_show_manager_ids as a SECURITY DEFINER RPC granted to authenticated', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_club_show_manager_ids(p_club_id uuid)'
    );
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.get_club_show_manager_ids(p_club_id uuid)',
      'GRANT EXECUTE ON FUNCTION public.get_show_officials'
    );
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain("SET search_path = ''");
    expect(fn).toContain('WHERE ur.club_id = p_club_id');
    expect(fn).toContain("r.name = 'secretary'");
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO authenticated'
    );
  });

  it('revokes default PUBLIC execute before granting only intended RPC roles', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC'
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_club_show_manager_ids(uuid) FROM PUBLIC'
    );
    // ordering: each REVOKE must precede its GRANT
    expect(migration.indexOf('REVOKE ALL ON FUNCTION public.get_show_officials')).toBeLessThan(
      migration.indexOf('GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon')
    );
    expect(migration.indexOf('REVOKE ALL ON FUNCTION public.get_show_officials')).toBeLessThan(
      migration.indexOf('GRANT EXECUTE ON FUNCTION public.get_show_officials')
    );
    expect(
      migration.indexOf('REVOKE ALL ON FUNCTION public.get_club_show_manager_ids')
    ).toBeLessThan(migration.indexOf('GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids'));
    expect(migration).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO anon'
    );
  });

  it('reloads the PostgREST schema cache so the policy + RPC changes take effect', () => {
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
