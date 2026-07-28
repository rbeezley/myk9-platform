import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260728210000_materialize_entry_access_context.sql'
  ),
  'utf8'
);
const scanEvidenceSql = readFileSync(
  resolve(__dirname, '../../../../../scripts/qa/db-drift/myk9-114-scan-evidence.sql'),
  'utf8'
);
const scanEvidenceRunner = readFileSync(
  resolve(__dirname, '../../../../../scripts/qa/db-drift/myk9-114-scan-evidence.ts'),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('MYK9-114 statement-scoped entry access context', () => {
  const helper = sliceBetween(
    migration,
    'CREATE FUNCTION private.entry_results_caller_context',
    'COMMENT ON FUNCTION private.entry_results_caller_context'
  );
  const view = sliceBetween(
    migration,
    'CREATE OR REPLACE VIEW public.view_authenticated_entry_results',
    'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated'
  );

  it('uses one fail-closed stable security-definer helper', () => {
    expect(helper).toContain('RETURNS TABLE');
    expect(helper).toContain('LANGUAGE sql');
    expect(helper).toContain('STABLE');
    expect(helper).toContain('SECURITY DEFINER');
    expect(helper).toContain("SET search_path = ''");
    expect(helper).toContain('COALESCE(array_agg(DISTINCT ur.club_id)');
    expect(helper).toContain('COALESCE(array_agg(DISTINCT ja.class_id)');
    expect(helper).toContain('public.ringside_claim_generation_current()');
    expect(helper).toContain("bool_or(r.name IN ('secretary', 'trial_secretary', 'club_admin'))");
  });

  it('keeps the helper outside exposed API schemas', () => {
    expect(migration).toContain('CREATE SCHEMA private AUTHORIZATION postgres');
    expect(migration).toContain('REVOKE ALL ON SCHEMA private FROM PUBLIC');
    expect(migration).toContain(
      'REVOKE ALL ON SCHEMA private FROM anon, authenticated, service_role'
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION private.entry_results_caller_context() FROM PUBLIC'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION private.entry_results_caller_context() TO authenticated'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION private.entry_results_caller_context() TO service_role'
    );
  });

  it('materializes one caller context without materializing entries', () => {
    expect(view).toMatch(
      /WITH caller_context AS MATERIALIZED\s*\(\s*SELECT \* FROM private\.entry_results_caller_context\(\)\s*\)/
    );
    expect(view).toContain('FROM public.entries e');
    expect(view).toContain('CROSS JOIN caller_context ctx');
    expect(view).not.toContain('FROM public.user_roles');
    expect(view).not.toContain('FROM public.judge_assignments');
    expect(view).not.toContain('public.ringside_claim_generation_current()');
  });

  it('preserves manager, judge, steward, owner, exhibitor, and claim gates', () => {
    expect(view).toContain('ctx.is_site_admin');
    expect(view).toContain('sh.id IS NOT NULL');
    expect(view).toContain('(sh.club_id IS NULL AND ctx.has_manager_role)');
    expect(view).toContain('sh.club_id = ANY(ctx.managed_club_ids)');
    expect(view).toContain('e.class_id = ANY(ctx.assigned_class_ids)');
    expect(view).toContain('e.show_id = ANY(ctx.steward_show_ids)');
    expect(view).toContain('sh.club_id = ANY(ctx.steward_club_ids)');
    expect(view).toContain('ctx.person_id = e.handler_id');
    expect(view).toContain('owned_dog.owner_id = ctx.person_id');
    expect(view).toContain('own_dog.co_owner_id = ctx.person_id');
    expect(view).toContain('ctx.claim_generation_current');
    expect(view).toContain("flags.claim_role IN ('judge', 'steward', 'admin')");
  });

  it('preserves the replication schema, watermark, and view privileges', () => {
    expect(view).toContain('WITH (security_invoker = false)');
    expect(view).toMatch(
      /GREATEST\(\s*e\.updated_at,\s*c\.updated_at,\s*sh\.updated_at,\s*show_vis\.updated_at,\s*trial_vis\.updated_at,\s*class_vis\.updated_at\s*\) AS updated_at/
    );
    expect(view).toContain('access.is_own_entry AS is_own_entry');
    expect(view).toMatch(/e\.is_scored,\s*e\.is_in_ring,\s*CASE WHEN/);
    expect(migration).toContain(
      'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated'
    );
    expect(migration).toContain(
      'GRANT SELECT ON public.view_authenticated_entry_results TO service_role'
    );
    expect(migration).toContain(
      'REVOKE SELECT ON public.view_authenticated_entry_results FROM anon'
    );
  });

  it('keeps every boundary change in one explicit transaction', () => {
    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);

    const begin = migration.indexOf('BEGIN;');
    const helperCreate = migration.indexOf('CREATE FUNCTION private.entry_results_caller_context');
    const viewReplace = migration.indexOf(
      'CREATE OR REPLACE VIEW public.view_authenticated_entry_results'
    );
    const helperRevoke = migration.indexOf(
      'REVOKE ALL ON FUNCTION private.entry_results_caller_context()'
    );
    const schemaNotify = migration.indexOf("NOTIFY pgrst, 'reload schema'");
    const commit = migration.lastIndexOf('COMMIT;');

    expect(begin).toBeLessThan(helperCreate);
    expect(helperCreate).toBeLessThan(viewReplace);
    expect(begin).toBeLessThan(helperRevoke);
    expect(helperRevoke).toBeLessThan(commit);
    expect(helperRevoke).toBeLessThan(schemaNotify);
    expect(viewReplace).toBeLessThan(schemaNotify);
    expect(schemaNotify).toBeLessThan(commit);
  });

  it('keeps linked scan evidence read-only and isolates one measured read', () => {
    expect(scanEvidenceSql).not.toContain('pg_stat_reset');
    expect(scanEvidenceSql).not.toContain('reset_local_counters');
    expect(scanEvidenceSql).toContain(":'evidence_mode' = 'snapshot'");
    expect(scanEvidenceSql).toContain(":'evidence_mode' = 'read'");
    expect(scanEvidenceSql).toContain(":'evidence_mode' = 'plans'");
    const readBlock = scanEvidenceSql.slice(
      scanEvidenceSql.indexOf('\\if :is_read'),
      scanEvidenceSql.indexOf('\\if :is_plans')
    );
    expect(readBlock.indexOf('where projected_row is not null')).toBeLessThan(
      readBlock.indexOf('select pg_stat_force_next_flush()')
    );
    expect(scanEvidenceSql.match(/select pg_stat_force_next_flush\(\)/g)).toHaveLength(1);
    expect(scanEvidenceSql).toContain('select *\n  from public.view_authenticated_entry_results;');
    expect(scanEvidenceRunner).toContain("runEvidence('snapshot')");
    expect(scanEvidenceRunner).toContain("runEvidence('read')");
    expect(scanEvidenceRunner.match(/runEvidence\('snapshot'\)/g)).toHaveLength(2);
    expect(scanEvidenceRunner).toContain('passes_max_two_scans');
  });
});
