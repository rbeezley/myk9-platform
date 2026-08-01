import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migration = readFileSync(
  join(
    repoRoot,
    'supabase/migrations/20260801180000_withhold_judge_assignment_private_columns.sql'
  ),
  'utf8'
);
const showReads = readFileSync(
  join(repoRoot, 'apps/myk9show/src/services/database/shows/reads.postgrest.ts'),
  'utf8'
);
const replication = readFileSync(
  join(repoRoot, 'apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts'),
  'utf8'
);
const judgeReads = readFileSync(
  join(repoRoot, 'apps/myk9show/src/services/database/judges/reads.ts'),
  'utf8'
);

describe('MYK9-146 private judge-assignment read contract', () => {
  it('revokes broad reads and grants only the public/authenticated safe columns', () => {
    expect(migration).toContain(
      'REVOKE SELECT ON TABLE public.judge_assignments FROM PUBLIC, anon, authenticated'
    );
    expect(migration).toMatch(
      /GRANT SELECT \([\s\S]*?id,[\s\S]*?person_id,[\s\S]*?updated_at[\s\S]*?\) ON public\.judge_assignments TO anon/
    );
    expect(migration).toContain('day_capacity_override');
    expect(migration).toContain('version');

    const anonGrant = migration.slice(
      migration.indexOf('GRANT SELECT (', migration.indexOf('TO anon') - 300),
      migration.indexOf(') ON public.judge_assignments TO anon') + 1
    );
    expect(anonGrant).not.toContain('fee');
    expect(anonGrant).not.toContain('notes');
  });

  it('keeps private columns behind the caller-checked manager RPC', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_manager_judge_assignments()'
    );
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('WHERE public.is_show_office_manager(ja.show_id)');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_manager_judge_assignments() FROM PUBLIC, anon'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_manager_judge_assignments() TO authenticated, service_role'
    );
  });

  it('does not ask PostgREST or replication for fee/notes', () => {
    expect(showReads).not.toMatch(/judge_assignments\([\s\S]{0,500}\bfee\b/);
    expect(showReads).not.toMatch(/judge_assignments\([\s\S]{0,500}\bnotes\b/);
    expect(showReads).not.toMatch(/judge:people![\s\S]{0,160}\bemail\b/);
    expect(replication).not.toMatch(/\.select\([\s\S]{0,300}\*\s*,\s*classes/);
    expect(replication).toContain('day_capacity_override, version');
    expect(replication).toContain('return rows.map(row => ({ ...row, fee: null, notes: null }))');
    expect(judgeReads).toContain("rpc('get_manager_judge_assignments')");
    expect(judgeReads).toContain('.select(JUDGE_ASSIGNMENT_PUBLIC_SELECT)');
    expect(judgeReads).toContain('totalFees: null');
  });
});
