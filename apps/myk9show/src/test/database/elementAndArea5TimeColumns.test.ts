import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from './migrationTextScanners';

// MYK9-2068: the UKC element time and the Nationals Area 5 time are score columns.
// Every server object that lists the score column set must carry them, or a write is
// refused (the ringside allowlist), unaudited (the audit trigger), unguarded (the
// cancelled-class and held-entry triggers) or invisible to the replica (the views).
// Static SQL contract; the behavioral tests only run in CI.

const FILE = '20261116041700_myk9_2068_element_and_area5_time.sql';
const sql = readFileSync(resolve(migrationsDir, FILE), 'utf8');

function statementFrom(start: string): string {
  const at = sql.indexOf(start);
  if (at < 0) throw new Error(`migration does not contain ${start}`);
  const end = sql.indexOf('\nREVOKE ALL ON FUNCTION', at);
  return sql.slice(at, end < 0 ? undefined : end);
}

describe('element_time_seconds and area5_time_seconds', () => {
  it('adds both columns as nullable numerics', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS area5_time_seconds NUMERIC,/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS element_time_seconds NUMERIC;/);
  });

  it.each([
    ['public.ringside_update_entry('],
    ['private.entries_refuse_cancelled_class_writes()'],
    ['public.entries_block_score_when_awaiting_registration()'],
  ])('%s accepts both columns beside area4_time_seconds', start => {
    const body = statementFrom(`CREATE OR REPLACE FUNCTION ${start}`);
    expect(body).toContain(`'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds',`);
  });

  it('audits both columns, in the function, the trigger column list and its change test', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.entries_score_audit_trigger()')
    );
    expect(body).toContain(`'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds'`);
    expect(body).toContain('area4_time_seconds, area5_time_seconds, element_time_seconds,');
    expect(body).toContain('OLD.area5_time_seconds, OLD.element_time_seconds');
    expect(body).toContain('NEW.area5_time_seconds, NEW.element_time_seconds');
  });

  it('exposes both through the two entry views, masked like area4_time_seconds', () => {
    expect(sql).toContain(
      'CASE WHEN access.can_view_scores THEN e.area5_time_seconds END AS area5_time_seconds'
    );
    expect(sql).toContain(
      'CASE WHEN access.can_view_scores THEN e.element_time_seconds END AS element_time_seconds'
    );
    expect(sql).toMatch(
      /entries\.area5_time_seconds,\s*entries\.element_time_seconds\s*FROM public\.view_authenticated_entry_results AS entries/
    );
  });

  it('keeps the new columns away from anon', () => {
    expect(sql).toContain(
      'REVOKE ALL (area5_time_seconds, element_time_seconds) ON public.entries FROM anon;'
    );
  });
});
