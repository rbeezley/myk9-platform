import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730110000_restrict_rbac_access_lookups.sql'
);

function readMigration(): string {
  expect(
    existsSync(migrationPath),
    'The RBAC access-lookup authorization migration must exist before this contract can pass'
  ).toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('RBAC access-lookup authorization migration', () => {
  it('allows self lookups and site-admin inspection through one private guard', () => {
    const migration = readMigration();

    expect(migration).toContain('CREATE OR REPLACE FUNCTION private.can_inspect_rbac_user');
    expect(migration).toContain('auth.uid() IS NOT NULL');
    expect(migration).toContain('p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())');
    expect(migration).toContain('OR (SELECT public.is_site_admin());');
    expect(migration.match(/private\.can_inspect_rbac_user\(user_id\)/g)).toHaveLength(4);
    expect(
      migration.match(/RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';/g)
    ).toHaveLength(4);
  });

  it('keeps the four RPCs authenticated-only after recreation', () => {
    const migration = readMigration();
    const signatures = [
      'public.get_user_permissions(UUID, TEXT, UUID)',
      'public.get_user_roles(UUID)',
      'public.get_effective_permissions(UUID, TEXT, UUID)',
      'public.user_has_permission(UUID, TEXT, TEXT, UUID)',
    ];

    for (const signature of signatures) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
    }
  });
});
