import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for person soft-delete. A direct .update({deleted_at}) is
// rejected by RLS (people_select's `deleted_at IS NULL` is enforced as a WITH CHECK
// on the new row), so soft-delete MUST go through the SECURITY DEFINER RPC. A
// regression to a direct update silently re-breaks person delete for everyone.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
const compactSql = (sql: string) => sql.replace(/\s+/g, '').toLowerCase();

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
  const migrationSource = read(authoritativeMigrationPath);
  const migration = normalizeSql(migrationSource);
  const securitySql = compactSql(migrationSource);

  it('removes the obsolete pre-role-deactivation migration from local lineage', () => {
    expect(existsSync(resolve(__dirname, obsoleteMigrationPath))).toBe(false);
  });

  it('defines the function as SECURITY DEFINER with a locked search_path', () => {
    expect(migration).toContain('function public.soft_delete_person(p_person_id uuid)');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
  });

  it('authorizes self-service through the caller person path', () => {
    expect(securitySql).toContain(
      'orexists(select1frompublic.peoplewhereid=p_person_idandauth_user_id=(selectauth.uid())anddeleted_atisnull)'
    );
  });

  it('deactivates matching active roles only after the person soft-delete succeeds', () => {
    const personSoftDelete = securitySql.indexOf(
      'updatepublic.peoplesetdeleted_at=now(),deleted_by=auth.uid(),updated_at=now()whereid=p_person_idanddeleted_atisnull;'
    );
    const rowCountCapture = securitySql.indexOf('getdiagnosticsv_rows=row_count;');
    const successfulDeleteGuard = securitySql.indexOf(
      "ifv_rows=0thenraiseexception'personnotfoundoralreadydeleted'usingerrcode='p0002';endif;"
    );
    const roleDeactivation = securitySql.indexOf(
      'updatepublic.user_rolessetis_active=falsewhereuser_id=p_person_idandis_active;'
    );

    expect(personSoftDelete).toBeGreaterThan(-1);
    expect(rowCountCapture).toBeGreaterThan(personSoftDelete);
    expect(successfulDeleteGuard).toBeGreaterThan(rowCountCapture);
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
