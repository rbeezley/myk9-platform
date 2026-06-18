import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for migration 20260618120000 — create_show_with_children now writes
 * CLASS-LEVEL judge assignments. Two regressions this pins against:
 *
 *  1. Wrong grain: prior versions inserted show-level rows (class_id NULL), which
 *     the class-centric judge dashboard (useJudgeAssignments) and the migration-114
 *     capacity functions both silently drop because they JOIN classes ON
 *     c.id = ja.class_id. A judge created via the wizard never appeared on
 *     /judge/dashboard.
 *  2. Phantom columns: migrations 20260510120000 / 20260510143000 inserted into
 *     judge_id / role / assigned_date / is_active — columns that do not exist on
 *     judge_assignments (real columns are person_id, show_id, trial_id, class_id,
 *     status; see migration 005).
 *
 * The migration is the source of truth for what the RPC writes, so we assert its
 * shape directly.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260618120000_create_show_with_children_class_level_judges.sql'
  ),
  'utf8'
);

/** Only the function definition counts — leading comments legitimately name the phantom columns. */
const body = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'));

/** Columns that do NOT exist on judge_assignments — the latent second bug. */
const PHANTOM_COLUMNS = ['judge_id', 'role', 'assigned_date', 'is_active'];

describe('create_show_with_children class-level judges migration (20260618120000)', () => {
  it('replaces the RPC with an unchanged signature', () => {
    expect(body).toContain(
      'FUNCTION public.create_show_with_children(\n  p_show      jsonb,\n  p_trials    jsonb,\n  p_classes   jsonb,\n  p_judge_ids uuid[]\n)'
    );
  });

  it('inserts judge_assignments at CLASS level (person_id + class_id), not show level', () => {
    // The INSERT column list must include both person_id and class_id.
    const insertMatch = body.match(/INSERT INTO public\.judge_assignments\s*\(([^)]*)\)/);
    expect(insertMatch).not.toBeNull();
    const columns = insertMatch![1]!.replace(/\s+/g, ' ');
    expect(columns).toContain('person_id');
    expect(columns).toContain('class_id');
    expect(columns).toContain('show_id');
    expect(columns).toContain('trial_id');
    expect(columns).toContain('status');
  });

  it('writes the assignment with status confirmed (active on the dashboard)', () => {
    expect(body).toMatch(/'confirmed'/);
  });

  it('does NOT use the phantom columns in the judge_assignments INSERT column list', () => {
    // Scope to the INSERT column list: reading the payload key v_class->>'judge_id'
    // is legitimate and must not be confused with a (nonexistent) judge_id column.
    const insertMatch = body.match(/INSERT INTO public\.judge_assignments\s*\(([^)]*)\)/);
    const columns = insertMatch![1]!;
    for (const col of PHANTOM_COLUMNS) {
      expect(columns).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('gates the assignment insert on a freshly-inserted class and a present judge_id (idempotent, opt-in)', () => {
    expect(body).toContain('RETURNING id INTO v_inserted_class_id');
    expect(body).toMatch(
      /IF v_inserted_class_id IS NOT NULL AND v_class_judge_id IS NOT NULL THEN/
    );
  });

  it('re-grants EXECUTE to authenticated and revokes PUBLIC', () => {
    expect(body).toContain(
      'REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC'
    );
    expect(body).toContain(
      'GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated'
    );
  });

  it('keeps the function schema-qualified under SET search_path = \'\'', () => {
    expect(body).toContain("SET search_path = ''");
    expect(body).toContain('public.judge_assignments');
    expect(body).toContain('public.classes');
  });
});
