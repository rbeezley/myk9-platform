import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Database } from '@myk9/supabase';
import { CLASS_AUTHENTICATED_COLUMNS, CLASS_COLUMNS } from '@/services/database/classes/reads';

/**
 * MYK9-479: `classes.judge_name` is retired.
 *
 * It was a free-text snapshot with no trigger maintaining it from
 * judge_assignments, and on the applied database it agreed with the assignment
 * graph on 5 of 31 classes. The decision recorded on the issue is option 2 —
 * drop it and make judge_assignments → people the only judge source.
 *
 * This pins the migration's shape (the parts a behavioural test cannot see on
 * this Mac: LESSONS no-docker) and the two TS surfaces that must move with it.
 * Behavioural pins for the readers live beside them: rowToClass in
 * ReplicatedClassesTable.test, mapDatabaseToClass in
 * classMappers.judgeAssignments.test, resolveClassJudgeName in
 * classJudgeDisplay.test, useClassCheckInData.test, and the AskQ tool executor.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');
const MIGRATION = resolve(MIGRATIONS_DIR, '20260912234500_drop_classes_judge_name.sql');

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function sliceBetween(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  expect(from, `expected ${start}`).toBeGreaterThan(-1);
  const to = sql.indexOf(end, from + start.length);
  expect(to, `expected ${end} after ${start}`).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe('classes.judge_name retirement (MYK9-479)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const code = stripComments(sql);

  it('drops the column', () => {
    expect(code).toMatch(/ALTER TABLE public\.classes DROP COLUMN judge_name;/);
  });

  it('is the last migration that touches the column, so nothing later re-creates it', () => {
    const later = readdirSync(MIGRATIONS_DIR)
      .filter(name => name.endsWith('.sql') && name > '20260912234500_drop_classes_judge_name.sql')
      .filter(name =>
        /\bclasses\.judge_name\b|\bjudge_name\s+(text|varchar)/i.test(
          stripComments(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8'))
        )
      );
    expect(later).toEqual([]);
  });

  it.each(['view_myk9q_entries', 'view_stats_summary'])(
    'rebuilds %s before the drop, deriving judge_name from the confirmed assignment',
    view => {
      const definition = sliceBetween(code, `CREATE OR REPLACE VIEW public.${view}`, 'WHERE e.');
      const dropAt = code.indexOf('DROP COLUMN judge_name');
      expect(code.indexOf(`CREATE OR REPLACE VIEW public.${view}`)).toBeLessThan(dropAt);

      // The output column keeps its name (view_judge_stats groups by it) but
      // no longer reads the table column: it comes from a per-class LATERAL
      // over the confirmed assignment.
      expect(definition).toMatch(/^\s+ja\.judge_name,$/m);
      expect(definition).not.toMatch(/c\.judge_name/);
      expect(definition).toMatch(/LEFT JOIN LATERAL \(/);
      expect(definition).toMatch(/FROM public\.judge_assignments a/);
      expect(definition).toMatch(/a\.class_id = c\.id/);
      expect(definition).toMatch(/a\.status = 'confirmed'/);
      expect(definition).toMatch(/p\.deleted_at IS NULL/);

      // LESSONS replace-view-reloptions: a CREATE OR REPLACE without the inline
      // WITH clause silently reverts the view to owner-run and skips RLS.
      expect(definition).toMatch(/WITH \(security_invoker = true\) AS/);
    }
  );

  it('rebuilds emergency_packet_input before the drop without the column fallback', () => {
    const fn = sliceBetween(
      code,
      'CREATE OR REPLACE FUNCTION public.emergency_packet_input',
      'COMMENT ON FUNCTION public.emergency_packet_input'
    );
    expect(code.indexOf('CREATE OR REPLACE FUNCTION public.emergency_packet_input')).toBeLessThan(
      code.indexOf('DROP COLUMN judge_name')
    );
    expect(fn).not.toMatch(/cl\.judge_name/);
    expect(fn).toMatch(/NULLIF\(btrim\(ja\.judge_full_name\), ''\) AS judge_display_name/);
    // The definer hardening from 20260821220000 survives the copy.
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path = ''/);
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.emergency_packet_input\(uuid, date\) FROM PUBLIC, anon, authenticated;/
    );
  });

  it('restates both column allowlists without judge_name', () => {
    for (const role of ['anon', 'authenticated']) {
      const grant = code.match(
        new RegExp(
          String.raw`GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.classes\s+TO\s+${role}`,
          'i'
        )
      );
      expect(grant, `expected a column grant on classes to ${role}`).not.toBeNull();
      const columns = grant![1]!.split(',').map(column => column.trim());
      expect(columns).not.toContain('judge_name');
      // Sanity: it is the real allowlist, not an empty one.
      expect(columns).toContain('status');
      expect(columns).toContain('display_order');
    }
  });

  it('is gone from the client column selects', () => {
    expect([...CLASS_COLUMNS]).not.toContain('judge_name');
    expect([...CLASS_AUTHENTICATED_COLUMNS]).not.toContain('judge_name');
  });

  it('is gone from the generated classes row type', () => {
    type ClassesRow = Database['public']['Tables']['classes']['Row'];
    expectTypeOf<ClassesRow>().not.toHaveProperty('judge_name');
    // The derived view column still exists — that is the one that keeps
    // view_judge_stats' GROUP BY valid.
    type StatsRow = Database['public']['Views']['view_stats_summary']['Row'];
    expectTypeOf<StatsRow>().toHaveProperty('judge_name');
  });
});
