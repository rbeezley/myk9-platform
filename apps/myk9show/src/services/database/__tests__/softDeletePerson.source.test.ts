import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for person soft-delete. A direct .update({deleted_at}) is
// rejected by RLS (people_select's `deleted_at IS NULL` is enforced as a WITH CHECK
// on the new row), so soft-delete MUST go through the SECURITY DEFINER RPC. A
// regression to a direct update silently re-breaks person delete for everyone.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

describe('person soft-delete wiring', () => {
  it('deleteUser calls soft_delete_person RPC with p_person_id', () => {
    const src = read('../users/reads.ts');
    expect(src).toContain("supabase.rpc('soft_delete_person', { p_person_id: id })");
  });
});

describe('soft_delete_person migration', () => {
  const authoritativeMigrationPath =
    '../../../../../../supabase/migrations/20260710170000_soft_delete_person_deactivates_roles.sql';
  const obsoleteMigrationPath =
    '../../../../../../supabase/migrations/20260710160000_self_service_soft_delete_person.sql';
  const migration = normalizeSql(read(authoritativeMigrationPath));

  it('removes the obsolete pre-role-deactivation migration from local lineage', () => {
    expect(existsSync(resolve(__dirname, obsoleteMigrationPath))).toBe(false);
  });

  it('defines the function as SECURITY DEFINER with a locked search_path', () => {
    expect(migration).toContain('function public.soft_delete_person(p_person_id uuid)');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
  });

  it('authorizes self-service through the caller person path', () => {
    expect(migration).toMatch(
      /or exists\s*\(\s*select 1 from public\.people\s+where id = p_person_id\s+and auth_user_id =\s*\(\s*select auth\.uid\(\)\s*\)\s+and deleted_at is null\s*\)/
    );
  });

  it('deactivates matching active roles only after the person soft-delete succeeds', () => {
    const personSoftDelete = migration.indexOf(
      'update public.people set deleted_at = now(), deleted_by = auth.uid(), updated_at = now() where id = p_person_id and deleted_at is null;'
    );
    const successfulDeleteGuard = migration.indexOf(
      "if v_rows = 0 then raise exception 'person not found or already deleted' using errcode = 'p0002'; end if;"
    );
    const roleDeactivation = migration.indexOf(
      'update public.user_roles set is_active = false where user_id = p_person_id and is_active;'
    );

    expect(personSoftDelete).toBeGreaterThan(-1);
    expect(successfulDeleteGuard).toBeGreaterThan(personSoftDelete);
    expect(roleDeactivation).toBeGreaterThan(successfulDeleteGuard);
  });

  it('gates on site admin or show-person manager', () => {
    expect(migration).toContain('public.is_site_admin()');
    expect(migration).toContain('public.can_manage_show_person(p_person_id)');
  });

  it('only soft-deletes a currently-live row', () => {
    expect(migration).toContain('deleted_at is null');
  });

  it('revokes from PUBLIC and grants execute to authenticated', () => {
    expect(migration).toContain(
      'revoke all on function public.soft_delete_person(uuid) from public'
    );
    expect(migration).toContain(
      'grant execute on function public.soft_delete_person(uuid) to authenticated'
    );
  });
});
