import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestDefinitions, latestViewDefinition, migrationsDir } from './migrationTextScanners';

// MYK9-1011: a stored Disqualified result. The CHECK constraint is the gate every
// score write passes through, and every server rule that treats 'excused' as
// "accounted for, not qualifying" must treat 'disqualified' the same way. These
// are static SQL contracts over the migration text; the behavioral counterpart
// (supabase/tests/myk9_1011_disqualified_result_test.sql) only runs in CI.

const ORIGINAL_VALUES = ['pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn'];

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
}

function read(file: string): string {
  return readFileSync(resolve(migrationsDir, file), 'utf8');
}

/** The quoted values of the first `result_status IN ( … )` list at/after `from`. */
function resultStatusValues(sql: string, from = 0): string[] {
  const match = /result_status\s+IN\s*\(([^)]*)\)/i.exec(sql.slice(from));
  if (!match) throw new Error('no result_status IN (...) list found');
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('entries.result_status CHECK constraint (MYK9-1011)', () => {
  const adders = migrationFiles().filter(file =>
    read(file).includes('ADD CONSTRAINT entries_result_status_check')
  );
  const latest = adders.at(-1)!;
  const sql = read(latest);
  const values = resultStatusValues(sql, sql.indexOf('ADD CONSTRAINT entries_result_status_check'));

  it('is last redefined by the DQ migration', () => {
    expect(latest).toBe('20261011003700_myk9_1011_disqualified_result.sql');
  });

  it('permits exactly the original values plus disqualified', () => {
    expect([...values].sort()).toEqual([...ORIGINAL_VALUES, 'disqualified'].sort());
  });

  it('parser control: the original inline constraint (003) is read as the old list', () => {
    // Without this a parser that returned the new list for every input would pass.
    const original = read('003_entries_and_scoring.sql');
    const at = original.indexOf('result_status TEXT DEFAULT');
    expect(resultStatusValues(original, at).sort()).toEqual([...ORIGINAL_VALUES].sort());
    expect(resultStatusValues(original, at)).not.toContain('disqualified');
  });

  it('drops the old CHECK by definition, not by an assumed auto-generated name', () => {
    expect(sql).toContain("pg_get_constraintdef(c.oid) ILIKE '%result_status%'");
    expect(sql).toContain("c.conrelid = 'public.entries'::regclass");
    expect(sql).toContain("c.contype = 'c'");
    expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(sql.indexOf('ADD CONSTRAINT'));
  });

  it('leaves manual_results (historical external results) on its own CHECK', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.manual_results/);
  });
});

describe('server rules that treat excused as accounted-for also cover disqualified', () => {
  const definitions = latestDefinitions();

  it('refresh_class_scoring_state counts a DQ as accounted for', () => {
    const fn = definitions.get('refresh_class_scoring_state')!;
    expect(fn.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(fn.body).toContain(
      "AND (is_scored = true OR result_status IN ('absent', 'excused', 'disqualified'))"
    );
  });

  it('refresh_class_scoring_state keeps its definer settings and non-deleted scope', () => {
    const fn = definitions.get('refresh_class_scoring_state')!;
    expect(fn.body).toContain('SECURITY DEFINER');
    expect(fn.body).toContain("SET search_path = ''");
    expect(fn.body).toMatch(/WHERE class_id = p_class_id\s+AND deleted_at IS NULL/);
  });

  it('handle_entry_scoring_state_change does not reopen a class for a DQ', () => {
    const fn = definitions.get('handle_entry_scoring_state_change')!;
    expect(fn.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(fn.body).toContain("NEW.result_status IS DISTINCT FROM 'excused'");
    expect(fn.body).toContain("NEW.result_status IS DISTINCT FROM 'disqualified'");
  });

  it('get_my_entry_queue_places does not queue a DQ', () => {
    const fn = definitions.get('get_my_entry_queue_places')!;
    expect(fn.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(fn.body).toContain("NOT IN ('absent', 'excused', 'disqualified')");
  });

  it('get_own_entitlement_context counts a DQ as a scored result', () => {
    const fn = definitions.get('get_own_entitlement_context')!;
    expect(fn.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(fn.body).toContain(
      "e.result_status IN ('qualified', 'nq', 'absent', 'excused', 'disqualified', 'withdrawn')"
    );
  });

  it('a DQ never gets a placement: the ranker admits only qualified results', () => {
    const ranker = definitions.get('recalculate_class_placements')!;
    expect(ranker.body).toContain("e2.result_status = 'qualified'");
    expect(ranker.body).not.toContain('disqualified');
    // Not re-created here: its latest definition predates this migration.
    expect(ranker.file < '20261011003700').toBe(true);
  });

  it('a DQ blocks dog deletion like any other recorded result', () => {
    // private.* functions are invisible to latestDefinitions(), so read the file.
    const sql = read('20260926174500_myk9_822_blocking_entries_rpc.sql');
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION private.count_dog_blocking_entries');
    expect(start).toBeGreaterThan(-1);
    expect(sql.slice(start, start + 700)).toContain("e.result_status <> 'pending'");
  });
});

describe('result_text on every results view reads DQ for a disqualified entry', () => {
  it('view_public_entry_results (anon) must not fall through to pending', () => {
    const view = latestViewDefinition('view_public_entry_results');
    expect(view.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(view.body).toContain("e.result_status = 'disqualified'::text THEN 'DQ'::text");
    expect(view.body).toContain('WITH (security_invoker = false)');
  });

  it('view_authenticated_entry_results keeps owner-run and gains the DQ arm', () => {
    const view = latestViewDefinition('view_authenticated_entry_results');
    expect(view.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(view.body).toContain(
      "(access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'"
    );
    expect(view.body).toContain('WITH (security_invoker = false)');
  });

  it('view_entry_with_results carries security_invoker = true inline', () => {
    const view = latestViewDefinition('view_entry_with_results');
    expect(view.file).toBe('20261011003700_myk9_1011_disqualified_result.sql');
    expect(view.body).toContain('WITH (security_invoker = true)');
    expect(view.body).toContain("e.result_status = 'disqualified' THEN 'DQ'");
    expect(view.body).not.toMatch(/SELECT\s+e\.\*/);
  });
});
