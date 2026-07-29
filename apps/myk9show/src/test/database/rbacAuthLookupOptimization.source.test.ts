import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260729160000_optimize_rbac_auth_lookup.sql'
);
const authIdentityPropagationMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/159_sync_user_roles_auth_user_id_on_people_backfill.sql'),
  'utf8'
);

function readMigration(): string {
  expect(
    existsSync(migrationPath),
    'The additive RBAC auth-lookup migration must exist before this contract can pass'
  ).toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('RBAC auth-identity lookup optimization migration', () => {
  it('recreates every complete-access RPC with the indexed auth-user predicate', () => {
    const migration = readMigration();

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_user_permissions(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_user_roles(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_effective_permissions(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.user_has_permission(');
    expect(
      migration.match(/ur\.auth_user_id\s*=\s*(?:get_[a-z_]+|user_has_permission)\.user_id/g)
    ).toHaveLength(4);
    expect(migration).not.toMatch(/JOIN\s+public\.people\b/i);
    expect(migration).toContain("to_regclass('public.user_roles_auth_user_id_idx')");
  });

  it('retains propagation when a pre-assigned person later receives an auth identity', () => {
    expect(authIdentityPropagationMigration).toContain(
      'AFTER UPDATE OF auth_user_id ON public.people'
    );
    expect(authIdentityPropagationMigration).toContain('UPDATE public.user_roles');
    expect(authIdentityPropagationMigration).toContain('SET auth_user_id = NEW.auth_user_id');
  });

  it('preserves stable security-definer functions with an empty search path', () => {
    const migration = readMigration();

    expect(migration.match(/LANGUAGE plpgsql/g)).toHaveLength(4);
    expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(4);
    expect(migration.match(/\bSTABLE\b/g)).toHaveLength(4);
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(4);
  });

  it('keeps all four functions authenticated-only', () => {
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

  it('pins output, active/expiry, scope, and manage-inheritance compatibility', () => {
    const migration = readMigration();
    const compact = migration.replace(/\s+/g, ' ');

    expect(compact).toContain(
      'RETURNS TABLE ( permission_id UUID, permission_code TEXT, permission_name TEXT, description TEXT, category TEXT, role_id UUID, role_name TEXT, scope_type TEXT, scope_id UUID )'
    );
    expect(compact).toContain(
      'RETURNS TABLE ( user_role_id UUID, role_id UUID, role_name TEXT, role_description TEXT, is_system BOOLEAN, scope_type TEXT, scope_id UUID, granted_by UUID, granted_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, is_active BOOLEAN )'
    );
    expect(compact).toContain(
      'RETURNS TABLE ( permission_name TEXT, permission_code TEXT, source_type TEXT, source_role TEXT, scope_type TEXT, scope_id UUID )'
    );
    expect(migration.match(/AND ur\.is_active = true/g)).toHaveLength(3);
    expect(migration.match(/ur\.expires_at IS NULL OR ur\.expires_at > NOW\(\)/g)).toHaveLength(4);
    expect(migration).toContain("filter_scope_type = 'show' AND ur.show_id = filter_scope_id");
    expect(migration).toContain("filter_scope_type = 'club' AND ur.club_id = filter_scope_id");
    expect(migration).toContain("permission_name LIKE '%:update'");
    expect(migration).toContain("WHERE up.perm_code LIKE '%:manage'");
  });
});
