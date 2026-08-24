import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260824210000_service_role_acl_health_probe.sql'),
  'utf8'
);

describe('MYK9-236 deployed service-role ACL probe', () => {
  it('preserves the existing cheap facts and enriches only the full probe path', () => {
    for (const fact of [
      'latest_migration',
      'ringside_conflict_counter',
      'ringside_containment',
      'payout_ledger',
      'applied_acl_grants',
      'cron_jobs',
      'sign_in_email_drift',
    ]) {
      expect(migration).toContain(`'${fact}'`);
    }

    expect(migration).toContain('if p_include_expensive then');
    expect(migration).toContain('public.system_health_probe()');
    expect(migration).toContain("'service_role_tables'");
    expect(migration).toMatch(/where has_table_privilege\(\s*'service_role'/);
    expect(migration).toMatch(
      /array\[\s*'SELECT', 'INSERT', 'UPDATE', 'DELETE',\s*'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'\s*\]/
    );
    expect(migration).toContain("and c.relkind = 'r'");
  });

  it('keeps the security-definer boundary and service-role-only execution grant', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      'revoke all on function public.system_health_probe(boolean) from public;'
    );
    expect(migration).toContain(
      'revoke all on function public.system_health_probe(boolean) from authenticated;'
    );
    expect(migration).toContain(
      'grant execute on function public.system_health_probe(boolean) to service_role;'
    );
  });
});
