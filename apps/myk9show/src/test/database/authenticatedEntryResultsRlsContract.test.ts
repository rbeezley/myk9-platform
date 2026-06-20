import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260620001929_restrict_authenticated_entry_results.sql'
  ),
  'utf8'
);

const refreshMigration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260620185323_refresh_authenticated_entry_result_view_watermark.sql'
  ),
  'utf8'
);

const FORBIDDEN_AUTHENTICATED_COLUMNS = [
  'result_status',
  'search_time_seconds',
  'total_faults',
  'total_score',
  'final_placement',
  'judge_notes',
  'judge_signature',
  'disqualification_reason',
  'video_review_notes',
];

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('authenticated entry results — RLS/grants contract', () => {
  it('exposes scored fields through an owner-run view with an embedded row gate', () => {
    const view = sliceBetween(
      migration,
      'CREATE VIEW public.view_authenticated_entry_results',
      'GRANT SELECT ON public.view_authenticated_entry_results'
    );

    expect(view).toContain('security_invoker = false');
    expect(view).toContain('public.can_manage_show(e.show_id) AS can_manage');
    expect(view).toContain('WHERE access.can_manage OR access.is_own_entry');
    expect(view).toMatch(/p\.auth_user_id\s*=\s*auth\.uid\(\)[\s\S]*?p\.id\s*=\s*e\.handler_id/i);
    expect(view).toMatch(/owned_dog\.owner_id\s*=\s*p\.id/i);
  });

  it('returns raw scored columns only to managers and cascade-masked columns to own-entry callers', () => {
    const view = sliceBetween(
      migration,
      'CREATE VIEW public.view_authenticated_entry_results',
      'GRANT SELECT ON public.view_authenticated_entry_results'
    );

    expect(view).toMatch(
      /CASE\s+WHEN\s+access\.can_manage\s+OR\s+vis\.qualification_visible\s+THEN\s+e\.result_status\s+END\s+AS\s+result_status/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+access\.can_manage\s+OR\s+vis\.placement_visible\s+THEN\s+e\.final_placement\s+END\s+AS\s+final_placement/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+access\.can_manage\s+OR\s+vis\.time_visible\s+THEN\s+e\.search_time_seconds\s+END\s+AS\s+search_time_seconds/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+access\.can_manage\s+OR\s+vis\.faults_visible\s+THEN\s+e\.total_faults\s+END\s+AS\s+total_faults/i
    );
    expect(view).toMatch(
      /CASE\s+WHEN\s+access\.can_manage\s+THEN\s+e\.judge_notes\s+END\s+AS\s+judge_notes/i
    );
  });

  it('revokes authenticated table-wide SELECT and re-grants only non-scored columns', () => {
    expect(migration).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.entries\s+FROM\s+authenticated/i);

    const grant = sliceBetween(
      migration,
      'GRANT SELECT (',
      ') ON public.entries TO authenticated;'
    );

    expect(grant).toContain('entry_status');
    expect(grant).toContain('check_in_status');
    expect(grant).toContain('is_scored');
    for (const col of FORBIDDEN_AUTHENTICATED_COLUMNS) {
      expect(grant.includes(col)).toBe(false);
    }
  });

  it('does not expose the authenticated result view to anon', () => {
    expect(migration).toMatch(
      /GRANT\s+SELECT\s+ON\s+public\.view_authenticated_entry_results\s+TO\s+authenticated/i
    );
    expect(migration).toMatch(
      /REVOKE\s+SELECT\s+ON\s+public\.view_authenticated_entry_results\s+FROM\s+anon/i
    );
  });

  it('drops the superseded invoker-rights own-entry view', () => {
    expect(migration).toMatch(/DROP\s+VIEW\s+IF\s+EXISTS\s+public\.view_own_entry_results/i);
  });

  it('watermarks authenticated result rows on visibility changes for incremental sync', () => {
    expect(refreshMigration).toMatch(
      /GREATEST\(\s*e\.updated_at,\s*c\.updated_at,\s*sh\.updated_at,\s*show_vis\.updated_at,\s*trial_vis\.updated_at,\s*class_vis\.updated_at\s*\)\s+AS\s+updated_at/i
    );
    expect(refreshMigration).toMatch(/show_visibility_settings\s+show_vis/i);
    expect(refreshMigration).toMatch(/trial_visibility_overrides\s+trial_vis/i);
    expect(refreshMigration).toMatch(/class_visibility_overrides\s+class_vis/i);
  });
});
